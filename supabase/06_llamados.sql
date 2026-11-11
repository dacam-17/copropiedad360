-- =====================================================================
--  SYAPH360 · Migración 06 · Llamados de atención con debido proceso
--  Basado en la Ley 675 de 2001: requerimiento escrito con plazo (art. 59),
--  sanciones impuestas por la asamblea o el consejo con derecho de defensa
--  (art. 60), multas de máximo 2 expensas mensuales cada una y 10 en total
--  (art. 59), restricción de bienes comunes no esenciales, e impugnación
--  dentro del mes siguiente a la comunicación (art. 62).
--  Cada conjunto debe ajustar plazos y órganos a su propio reglamento.
--  Correr una sola vez, después de 01 a 05.
-- =====================================================================

create table public.llamados (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity,
  conjunto_id uuid not null references public.conjuntos on delete cascade,
  unidad_id uuid not null references public.unidades on delete cascade,
  tipo text not null default 'Llamado de atención' check (tipo in ('Llamado de atención','Requerimiento','Proceso sancionatorio')),
  categoria text not null default 'Convivencia' check (categoria in ('Ruido','Mascotas','Parqueadero','Basuras','Obras','Zonas comunes','Convivencia','Seguridad','Otro')),
  norma text,                       -- artículo del reglamento o manual de convivencia
  hechos text not null,
  fecha_hechos date,
  evidencias text[] not null default '{}',
  reporte_id uuid references public.reportes on delete set null,
  plazo_dias int not null default 5 check (plazo_dias between 1 and 60),
  estado text not null default 'Enviado' check (estado in ('Enviado','Leído','Con descargos','Decidido','Impugnado','Cerrado')),
  leido_at timestamptz,
  descargos text,
  descargos_fotos text[] not null default '{}',
  descargos_at timestamptz,
  decision text check (decision in ('Archivado','Se mantiene el llamado','Multa','Restricción de uso')),
  decision_texto text,
  organo text check (organo in ('Administración','Consejo de administración','Asamblea general')),
  acta text,
  multa_valor numeric(14,0),
  restriccion text,
  restriccion_hasta date,
  cargo_id uuid references public.cargos on delete set null,
  decision_at timestamptz,
  impugnacion text,
  impugnacion_at timestamptz,
  creado_por uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index llamados_unidad on public.llamados (unidad_id, created_at desc);

alter table public.llamados enable row level security;
create policy ll_ver on public.llamados for select using (es_gestion(conjunto_id) or unidad_id = mi_unidad(conjunto_id));
create policy ll_crear on public.llamados for insert with check (es_admin(conjunto_id) and estado = 'Enviado' and decision is null);
create policy ll_admin on public.llamados for update using (es_admin(conjunto_id)) with check (es_admin(conjunto_id));

-- Reglas del debido proceso al decidir
create or replace function public.tg_llamado() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_cuota numeric; v_multas numeric; v_cod text;
begin
  if tg_op = 'INSERT' and new.tipo = 'Proceso sancionatorio' then
    if not exists (select 1 from llamados l where l.unidad_id = new.unidad_id and l.tipo in ('Llamado de atención','Requerimiento')) then
      raise exception 'Antes de abrir un proceso sancionatorio se debe enviar un requerimiento escrito con plazo para corregir (art. 59, Ley 675).';
    end if;
  end if;
  if tg_op = 'UPDATE' and new.decision is not null and old.decision is null then
    if new.decision in ('Multa','Restricción de uso') then
      if new.tipo <> 'Proceso sancionatorio' then
        raise exception 'Las sanciones solo se imponen dentro de un proceso sancionatorio. Abre el proceso desde este llamado.';
      end if;
      if coalesce(new.organo, 'Administración') = 'Administración' then
        raise exception 'La sanción la impone la asamblea general o el consejo de administración si el reglamento se lo atribuye (art. 60). Indica el órgano y el acta.';
      end if;
      if new.descargos_at is null and now() < new.created_at + make_interval(days => new.plazo_dias) then
        raise exception 'El residente aún está dentro del plazo para presentar descargos (vence el %).', to_char((new.created_at + make_interval(days => new.plazo_dias)) at time zone 'America/Bogota', 'DD/MM/YYYY');
      end if;
    end if;
    if new.decision = 'Multa' then
      select c.valor into v_cuota from cargos c where c.unidad_id = new.unidad_id and c.concepto = 'Cuota ordinaria' order by c.periodo desc limit 1;
      if v_cuota is null then raise exception 'No hay cuota ordinaria liquidada para calcular el tope de la multa.'; end if;
      if coalesce(new.multa_valor, 0) <= 0 then raise exception 'Indica el valor de la multa.'; end if;
      if new.multa_valor > 2 * v_cuota then
        raise exception 'La multa no puede superar 2 veces la cuota mensual (máximo %).', '$' || replace(to_char(2 * v_cuota, 'FM999,999,999,999'), ',', '.');
      end if;
      select coalesce(sum(l.multa_valor), 0) into v_multas from llamados l where l.unidad_id = new.unidad_id and l.decision = 'Multa' and l.id <> new.id;
      if v_multas + new.multa_valor > 10 * v_cuota then
        raise exception 'Las multas sumadas no pueden superar 10 veces la cuota mensual (tope %, ya lleva %).', '$' || replace(to_char(10 * v_cuota, 'FM999,999,999,999'), ',', '.'), '$' || replace(to_char(v_multas, 'FM999,999,999,999'), ',', '.');
      end if;
      insert into cargos (conjunto_id, unidad_id, periodo, concepto, valor, vence)
        values (new.conjunto_id, new.unidad_id, date_trunc('month', hoy())::date, 'Multa · llamado #' || new.numero, new.multa_valor, hoy() + 30)
        returning id into new.cargo_id;
    end if;
    if new.decision = 'Restricción de uso' and new.restriccion_hasta is null then
      raise exception 'Indica hasta cuándo aplica la restricción.';
    end if;
    new.decision_at := now();
    new.estado := 'Decidido';
  end if;
  return new;
end $$;
create trigger llamados_reglas before insert or update on public.llamados for each row execute function public.tg_llamado();

create or replace function public.tg_llamado_aviso() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform notificar(new.conjunto_id, new.unidad_id, null, false, false, false,
      new.tipo || ' #' || new.numero || ' de la administración', 'Motivo: ' || lower(new.categoria) || '. Tienes ' || new.plazo_dias || ' días para corregir o presentar descargos.', 'llamado', 'misllamados');
  elsif new.descargos_at is distinct from old.descargos_at and new.descargos_at is not null then
    perform notificar(new.conjunto_id, null, null, true, false, false, 'Descargos al llamado #' || new.numero || ' · ' || cod_unidad(new.unidad_id), left(new.descargos, 200), 'llamado', 'llamados');
  elsif new.decision_at is distinct from old.decision_at and new.decision_at is not null then
    perform notificar(new.conjunto_id, new.unidad_id, null, false, false, false, 'Decisión sobre el llamado #' || new.numero || ': ' || new.decision,
      coalesce(new.decision_texto, '') || case when new.decision in ('Multa','Restricción de uso') then ' Puedes impugnarla dentro del mes siguiente.' else '' end, 'llamado', 'misllamados');
  elsif new.impugnacion_at is distinct from old.impugnacion_at and new.impugnacion_at is not null then
    perform notificar(new.conjunto_id, null, null, true, false, false, 'Impugnación del llamado #' || new.numero || ' · ' || cod_unidad(new.unidad_id), left(new.impugnacion, 200), 'llamado', 'llamados');
  end if;
  return new;
end $$;
create trigger llamados_aviso after insert or update on public.llamados for each row execute function public.tg_llamado_aviso();

-- Lo que hace el residente: acusar recibo, presentar descargos e impugnar
create or replace function public.acusar_llamado(p_id uuid) returns void
language sql security definer set search_path = public as $$
  update llamados set leido_at = now(), estado = case when estado = 'Enviado' then 'Leído' else estado end
  where id = p_id and leido_at is null and unidad_id = mi_unidad(conjunto_id) $$;

create or replace function public.descargos_llamado(p_id uuid, p_texto text, p_fotos text[]) returns void
language plpgsql security definer set search_path = public as $$
declare l llamados%rowtype;
begin
  select * into l from llamados where id = p_id;
  if l.id is null or l.unidad_id is distinct from mi_unidad(l.conjunto_id) then raise exception 'Este llamado no es de tu unidad'; end if;
  if l.decision is not null then raise exception 'Este llamado ya fue decidido. Si es una sanción, puedes impugnarla.'; end if;
  if coalesce(trim(p_texto), '') = '' then raise exception 'Escribe tus descargos.'; end if;
  update llamados set descargos = p_texto, descargos_fotos = coalesce(p_fotos, '{}'), descargos_at = now(), estado = 'Con descargos',
    leido_at = coalesce(leido_at, now()) where id = p_id;
end $$;

create or replace function public.impugnar_llamado(p_id uuid, p_texto text) returns void
language plpgsql security definer set search_path = public as $$
declare l llamados%rowtype;
begin
  select * into l from llamados where id = p_id;
  if l.id is null or l.unidad_id is distinct from mi_unidad(l.conjunto_id) then raise exception 'Este llamado no es de tu unidad'; end if;
  if l.decision not in ('Multa','Restricción de uso') then raise exception 'Solo se impugnan las sanciones.'; end if;
  if l.impugnacion_at is not null then raise exception 'Ya presentaste la impugnación.'; end if;
  if now() > l.decision_at + interval '1 month' then raise exception 'Pasó el mes para impugnar (art. 62, Ley 675).'; end if;
  if coalesce(trim(p_texto), '') = '' then raise exception 'Escribe los motivos de la impugnación.'; end if;
  update llamados set impugnacion = p_texto, impugnacion_at = now(), estado = 'Impugnado' where id = p_id;
end $$;
revoke execute on function public.acusar_llamado(uuid) from anon;
revoke execute on function public.descargos_llamado(uuid, text, text[]) from anon;
revoke execute on function public.impugnar_llamado(uuid, text) from anon;

-- La restricción de uso bloquea las reservas del apartamento mientras esté vigente
create or replace function public.reserva_estado() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_hasta date;
begin
  if not es_admin(new.conjunto_id) then
    select max(restriccion_hasta) into v_hasta from llamados
      where unidad_id = new.unidad_id and decision = 'Restricción de uso' and restriccion_hasta >= new.fecha and estado <> 'Cerrado';
    if v_hasta is not null then
      raise exception 'Tu unidad tiene restringido el uso de zonas comunes hasta el % por decisión del consejo o la asamblea.', to_char(v_hasta, 'DD/MM/YYYY');
    end if;
    select case when z.costo + z.deposito > 0 then 'Pendiente depósito' else 'Confirmada' end
      into new.estado from zonas z where z.id = new.zona_id;
    if new.fecha < hoy() then raise exception 'No se puede reservar una fecha pasada'; end if;
  end if;
  return new;
end $$;

-- Evidencias: los residentes ven las fotos de sus propios llamados
create policy soportes_llamados on storage.objects for select to authenticated using (
  bucket_id = 'soportes' and exists (select 1 from public.llamados l where name = any(l.evidencias) and l.unidad_id = public.mi_unidad(l.conjunto_id)));
