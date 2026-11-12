-- =====================================================================
--  SYAPH360 · Migración 09 · Manual de convivencia y decisión del consejo
--  - Faltas del manual de convivencia con su artículo, gravedad y sanción
--    sugerida; cada llamado queda atado a la falta que se cometió.
--  - El infractor responde desde la app: acepta la falta y se compromete,
--    o presenta descargos con pruebas.
--  - El consejo de administración delibera y vota si aplica o no sanción;
--    con mayoría de sus miembros queda registrada la decisión.
--  Correr una sola vez, después de 01 a 08.
-- =====================================================================

-- ---------- Manual de convivencia ----------
create table public.manual_faltas (
  id uuid primary key default gen_random_uuid(),
  conjunto_id uuid not null references public.conjuntos on delete cascade,
  articulo text not null,                         -- Art. 25, Num. 3.2 …
  titulo text not null,                           -- Ruido en horario nocturno
  descripcion text,                               -- texto de la norma
  categoria text not null default 'Convivencia' check (categoria in ('Ruido','Mascotas','Parqueadero','Basuras','Obras','Zonas comunes','Convivencia','Seguridad','Otro')),
  gravedad text not null default 'Leve' check (gravedad in ('Leve','Grave','Gravísima')),
  sancion text,                                   -- sanción que prevé el manual
  plazo_dias int not null default 5 check (plazo_dias between 1 and 60),
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (conjunto_id, articulo, titulo)
);
alter table public.manual_faltas enable row level security;
create policy mf_ver on public.manual_faltas for select using (es_miembro(conjunto_id));
create policy mf_admin on public.manual_faltas for all using (es_admin(conjunto_id)) with check (es_admin(conjunto_id));

alter table public.llamados
  add column falta_id uuid references public.manual_faltas on delete set null,
  add column gravedad text check (gravedad in ('Leve','Grave','Gravísima')),
  add column acepta boolean not null default false,          -- el infractor aceptó la falta
  add column compromiso text,
  add column consejo_at timestamptz;                         -- enviado a deliberación del consejo

alter table public.llamados drop constraint llamados_estado_check;
alter table public.llamados add constraint llamados_estado_check
  check (estado in ('Enviado','Leído','Con descargos','Aceptado','En consejo','Decidido','Impugnado','Cerrado'));

-- ---------- Respuesta del infractor: aceptar o presentar descargos ----------
drop function if exists public.descargos_llamado(uuid, text, text[]);
create or replace function public.descargos_llamado(p_id uuid, p_texto text, p_fotos text[], p_acepta boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare l llamados%rowtype;
begin
  select * into l from llamados where id = p_id;
  if l.id is null or l.unidad_id is distinct from mi_unidad(l.conjunto_id) then raise exception 'Este llamado no es de tu unidad'; end if;
  if l.decision is not null then raise exception 'Este llamado ya fue decidido. Si es una sanción, puedes impugnarla.'; end if;
  if coalesce(trim(p_texto), '') = '' then raise exception '%', case when p_acepta then 'Escribe tu compromiso.' else 'Escribe tus descargos.' end; end if;
  if p_acepta then
    update llamados set acepta = true, compromiso = p_texto, descargos = null, descargos_fotos = coalesce(p_fotos, '{}'), descargos_at = now(),
      estado = case when estado = 'En consejo' then estado else 'Aceptado' end, leido_at = coalesce(leido_at, now()) where id = p_id;
  else
    update llamados set acepta = false, compromiso = null, descargos = p_texto, descargos_fotos = coalesce(p_fotos, '{}'), descargos_at = now(),
      estado = case when estado = 'En consejo' then estado else 'Con descargos' end, leido_at = coalesce(leido_at, now()) where id = p_id;
  end if;
end $$;
revoke execute on function public.descargos_llamado(uuid, text, text[], boolean) from anon;

-- Aviso a la administración cuando el infractor acepta
create or replace function public.tg_llamado_aviso() returns trigger
language plpgsql security definer set search_path = public as $$
declare m record;
begin
  if tg_op = 'INSERT' then
    perform notificar(new.conjunto_id, new.unidad_id, null, false, false, false,
      new.tipo || ' #' || new.numero || ' de la administración', 'Motivo: ' || lower(new.categoria) || coalesce(' (' || new.norma || ')', '') || '. Tienes ' || new.plazo_dias || ' días para corregir, aceptar o presentar descargos.', 'llamado', 'misllamados');
  elsif new.descargos_at is distinct from old.descargos_at and new.descargos_at is not null then
    perform notificar(new.conjunto_id, null, null, true, false, false,
      case when new.acepta then 'Aceptó el llamado #' else 'Descargos al llamado #' end || new.numero || ' · ' || cod_unidad(new.unidad_id),
      left(coalesce(case when new.acepta then new.compromiso else new.descargos end, ''), 200), 'llamado', 'llamados');
    if new.consejo_at is not null then
      for m in select user_id from miembros where conjunto_id = new.conjunto_id and rol = 'consejo' loop
        perform notificar(new.conjunto_id, null, m.user_id, false, false, false, 'Nueva respuesta en el caso #' || new.numero || ' · ' || cod_unidad(new.unidad_id), 'La unidad respondió. Revísala antes de votar.', 'llamado', 'llamados');
      end loop;
    end if;
  elsif new.consejo_at is distinct from old.consejo_at and new.consejo_at is not null then
    for m in select user_id from miembros where conjunto_id = new.conjunto_id and rol = 'consejo' loop
      perform notificar(new.conjunto_id, null, m.user_id, false, false, false, 'El consejo debe decidir el caso #' || new.numero || ' · ' || cod_unidad(new.unidad_id),
        'Revisa los hechos y la respuesta de la unidad, y vota si aplica o no sanción.', 'llamado', 'llamados');
    end loop;
  elsif new.decision_at is distinct from old.decision_at and new.decision_at is not null then
    perform notificar(new.conjunto_id, new.unidad_id, null, false, false, false, 'Decisión sobre el llamado #' || new.numero || ': ' || new.decision,
      coalesce(new.decision_texto, '') || case when new.decision in ('Multa','Restricción de uso') then ' Puedes impugnarla dentro del mes siguiente.' else '' end, 'llamado', 'misllamados');
  elsif new.impugnacion_at is distinct from old.impugnacion_at and new.impugnacion_at is not null then
    perform notificar(new.conjunto_id, null, null, true, false, false, 'Impugnación del llamado #' || new.numero || ' · ' || cod_unidad(new.unidad_id), left(new.impugnacion, 200), 'llamado', 'llamados');
  end if;
  return new;
end $$;

-- ---------- Deliberación del consejo ----------
create or replace function public.es_consejo(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from miembros where conjunto_id = c and user_id = auth.uid() and rol = 'consejo') $$;

create table public.llamado_votos (
  llamado_id uuid not null references public.llamados on delete cascade,
  conjunto_id uuid not null references public.conjuntos on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  nombre text,
  voto text not null check (voto in ('Sanciona','No sanciona')),
  propuesta text check (propuesta in ('Multa','Restricción de uso','Se mantiene el llamado','Archivado')),
  multa_valor numeric(14,0),
  comentario text,
  created_at timestamptz not null default now(),
  primary key (llamado_id, user_id)
);
alter table public.llamado_votos enable row level security;
create policy lv_ver on public.llamado_votos for select using (es_gestion(conjunto_id));

-- Enviar el caso al consejo (lo hace la administración)
create or replace function public.enviar_consejo(p_id uuid) returns int
language plpgsql security definer set search_path = public as $$
declare l llamados%rowtype; v_n int;
begin
  select * into l from llamados where id = p_id;
  if l.id is null or not es_admin(l.conjunto_id) then raise exception 'Solo la administración envía casos al consejo'; end if;
  if l.decision is not null then raise exception 'Este caso ya fue decidido'; end if;
  select count(*) into v_n from miembros where conjunto_id = l.conjunto_id and rol = 'consejo';
  if v_n = 0 then raise exception 'No hay miembros del consejo con acceso. Invítalos en Ajustes → Equipo de gestión con el rol Consejo.'; end if;
  update llamados set consejo_at = now(), estado = 'En consejo' where id = p_id;
  return v_n;
end $$;

-- Votar (cada miembro del consejo, una vez; puede cambiar su voto mientras no haya decisión)
create or replace function public.votar_llamado(p_id uuid, p_voto text, p_propuesta text, p_multa numeric, p_comentario text) returns json
language plpgsql security definer set search_path = public, auth as $$
declare l llamados%rowtype; v_nombre text;
begin
  select * into l from llamados where id = p_id;
  if l.id is null or not es_consejo(l.conjunto_id) then raise exception 'Solo los miembros del consejo pueden votar'; end if;
  if l.consejo_at is null then raise exception 'La administración aún no ha enviado este caso al consejo'; end if;
  if l.decision is not null then raise exception 'Este caso ya fue decidido'; end if;
  if p_voto = 'Sanciona' and l.tipo <> 'Proceso sancionatorio' then
    raise exception 'Para votar una sanción, la administración debe abrir primero el proceso sancionatorio (art. 59, Ley 675).';
  end if;
  if p_voto = 'Sanciona' and p_propuesta not in ('Multa','Restricción de uso') then raise exception 'Indica qué sanción propones'; end if;
  if p_voto = 'No sanciona' and p_propuesta not in ('Se mantiene el llamado','Archivado') then raise exception 'Indica si se mantiene el llamado o se archiva'; end if;
  select coalesce(nullif(u.raw_user_meta_data ->> 'nombre', ''), u.email) into v_nombre from auth.users u where u.id = auth.uid();
  insert into llamado_votos (llamado_id, conjunto_id, nombre, voto, propuesta, multa_valor, comentario)
    values (p_id, l.conjunto_id, v_nombre, p_voto, p_propuesta, case when p_propuesta = 'Multa' then p_multa end, nullif(trim(p_comentario), ''))
    on conflict (llamado_id, user_id) do update set voto = excluded.voto, propuesta = excluded.propuesta, multa_valor = excluded.multa_valor,
      comentario = excluded.comentario, created_at = now();
  return estado_votacion(p_id);
end $$;

create or replace function public.estado_votacion(p_id uuid) returns json
language sql stable security definer set search_path = public as $$
  with l as (select * from llamados where id = p_id and es_gestion(conjunto_id)),
  t as (select count(*) as total from miembros m, l where m.conjunto_id = l.conjunto_id and m.rol = 'consejo'),
  v as (select v.* from llamado_votos v join l on l.id = v.llamado_id)
  select json_build_object(
    'total', (select total from t),
    'votos', (select count(*) from v),
    'sanciona', (select count(*) from v where voto = 'Sanciona'),
    'no_sanciona', (select count(*) from v where voto = 'No sanciona'),
    'mayoria', (select total / 2 + 1 from t),
    'propuesta', (select propuesta from v group by propuesta order by count(*) desc, propuesta limit 1)
  ) from l $$;

-- Registrar la decisión del consejo cuando haya mayoría
create or replace function public.decidir_consejo(p_id uuid, p_decision text, p_texto text, p_multa numeric, p_restriccion text, p_hasta date) returns void
language plpgsql security definer set search_path = public as $$
declare l llamados%rowtype; e json; v_si int; v_no int; v_may int;
begin
  select * into l from llamados where id = p_id;
  if l.id is null or not es_gestion(l.conjunto_id) then raise exception 'Solo la administración o el consejo registran la decisión'; end if;
  if l.decision is not null then raise exception 'Este caso ya fue decidido'; end if;
  e := estado_votacion(p_id);
  v_si := (e ->> 'sanciona')::int; v_no := (e ->> 'no_sanciona')::int; v_may := (e ->> 'mayoria')::int;
  if p_decision in ('Multa','Restricción de uso') and v_si < v_may then
    raise exception 'Para sancionar se necesita la mayoría del consejo (% de % votos a favor de sancionar; hacen falta %).', v_si, e ->> 'total', v_may;
  end if;
  if p_decision in ('Archivado','Se mantiene el llamado') and v_no < v_may then
    raise exception 'Aún no hay mayoría del consejo para no sancionar (% de %; hacen falta %).', v_no, e ->> 'total', v_may;
  end if;
  if coalesce(trim(p_texto), '') = '' then raise exception 'Escribe la explicación de la decisión'; end if;
  update llamados set decision = p_decision, organo = 'Consejo de administración',
    acta = 'Deliberación virtual SYAPH360: ' || v_si || ' por sancionar, ' || v_no || ' por no sancionar, de ' || (e ->> 'total') || ' miembros',
    decision_texto = p_texto,
    multa_valor = case when p_decision = 'Multa' then p_multa end,
    restriccion = case when p_decision = 'Restricción de uso' then coalesce(nullif(trim(p_restriccion), ''), 'Zonas comunes no esenciales') end,
    restriccion_hasta = case when p_decision = 'Restricción de uso' then p_hasta end
  where id = p_id;
end $$;
revoke execute on function public.enviar_consejo(uuid) from anon;
revoke execute on function public.votar_llamado(uuid, text, text, numeric, text) from anon;
revoke execute on function public.estado_votacion(uuid) from anon;
revoke execute on function public.decidir_consejo(uuid, text, text, numeric, text, date) from anon;

-- Aviso a la administración y al consejo cuando se alcanza la mayoría
create or replace function public.tg_voto_llamado() returns trigger
language plpgsql security definer set search_path = public as $$
declare e json; l llamados%rowtype; m record;
begin
  e := (select json_build_object('total', count(*)) from miembros where conjunto_id = new.conjunto_id and rol = 'consejo');
  select * into l from llamados where id = new.llamado_id;
  if (select count(*) from llamado_votos where llamado_id = new.llamado_id and voto = new.voto) = (e ->> 'total')::int / 2 + 1 then
    perform notificar(l.conjunto_id, null, null, true, false, false, 'Hay mayoría en el caso #' || l.numero || ' · ' || cod_unidad(l.unidad_id),
      'El consejo votó: ' || lower(new.voto) || '. Ya se puede registrar la decisión.', 'llamado', 'llamados');
    for m in select user_id from miembros where conjunto_id = l.conjunto_id and rol = 'consejo' loop
      perform notificar(l.conjunto_id, null, m.user_id, false, false, false, 'Hay mayoría en el caso #' || l.numero, 'El consejo votó: ' || lower(new.voto) || '. Ya se puede registrar la decisión.', 'llamado', 'llamados');
    end loop;
  end if;
  return new;
end $$;
create trigger llamado_votos_aviso after insert or update on public.llamado_votos for each row execute function public.tg_voto_llamado();
