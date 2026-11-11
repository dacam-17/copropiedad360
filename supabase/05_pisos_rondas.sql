-- =====================================================================
--  SYAPH360 · Migración 05 · Puntos NFC por piso y rondas de aseo/mantenimiento
--  Cada piso o pasillo tiene una etiqueta NFC. Quien hace el aseo o el
--  mantenimiento la escanea, marca lo realizado (con foto si se exige) y
--  los residentes de ese piso reciben el aviso. Si se pasa la hora
--  límite sin registro, la administración recibe una alerta.
--  Correr una sola vez, después de 01 a 04.
-- =====================================================================

-- ---------- Rol operario (aseo, todero, jardinería) ----------
alter table public.miembros drop constraint miembros_rol_check;
alter table public.miembros add constraint miembros_rol_check check (rol in ('admin','consejo','residente','porteria','proveedor','operario'));
alter table public.invitaciones drop constraint invitaciones_rol_check;
alter table public.invitaciones add constraint invitaciones_rol_check check (rol in ('admin','consejo','residente','porteria','proveedor','operario'));

create or replace function public.es_operario(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from miembros where conjunto_id = c and user_id = auth.uid() and rol = 'operario') and conjunto_vigente(c) $$;

-- Personal que puede registrar rondas: administración, portería, operarios y proveedores
create or replace function public.es_personal(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select es_admin(c) or es_porteria(c) or es_operario(c) or mi_proveedor(c) is not null $$;

-- ---------- Puntos de control (piso, pasillo, zona) ----------
create table public.puntos (
  id uuid primary key default gen_random_uuid(),
  conjunto_id uuid not null references public.conjuntos on delete cascade,
  nombre text not null,                  -- ej. Torre 1 · Piso 7
  torre text,
  piso text,
  descripcion text,
  token text not null default replace(gen_random_uuid()::text, '-', ''),   -- va grabado en la etiqueta NFC
  orden int not null default 0,
  created_at timestamptz not null default now(),
  unique (conjunto_id, nombre)
);

create table public.punto_unidades (
  punto_id uuid not null references public.puntos on delete cascade,
  unidad_id uuid not null references public.unidades on delete cascade,
  primary key (punto_id, unidad_id)
);

create table public.rutinas (
  id uuid primary key default gen_random_uuid(),
  conjunto_id uuid not null references public.conjuntos on delete cascade,
  punto_id uuid not null references public.puntos on delete cascade,
  nombre text not null,                  -- ej. Aseo de pasillo
  tipo text not null default 'Aseo' check (tipo in ('Aseo','Mantenimiento','Ronda','Otro')),
  dias int[] not null default '{1,2,3,4,5,6}',   -- 1 = lunes … 7 = domingo
  hora_limite time,
  foto_requerida boolean not null default false,
  notificar boolean not null default true,       -- avisar a los residentes del piso
  activa boolean not null default true,
  ultima_alerta date,
  created_at timestamptz not null default now()
);

create table public.rutina_registros (
  id uuid primary key default gen_random_uuid(),
  conjunto_id uuid not null references public.conjuntos on delete cascade,
  rutina_id uuid not null references public.rutinas on delete cascade,
  punto_id uuid not null references public.puntos on delete cascade,
  fecha date not null default public.hoy(),
  hecho_at timestamptz not null default now(),
  hecho_por uuid default auth.uid(),
  quien text,
  via text not null default 'nfc' check (via in ('nfc','manual')),
  foto text,
  nota text,
  unique (rutina_id, fecha)
);
create index rutina_registros_punto on public.rutina_registros (punto_id, hecho_at desc);

alter table public.puntos enable row level security;
alter table public.punto_unidades enable row level security;
alter table public.rutinas enable row level security;
alter table public.rutina_registros enable row level security;

create policy pto_ver on public.puntos for select using (es_miembro(conjunto_id));
create policy pto_admin on public.puntos for all using (es_admin(conjunto_id)) with check (es_admin(conjunto_id));
create policy pu_ver on public.punto_unidades for select using (exists (select 1 from public.puntos p where p.id = punto_id and es_miembro(p.conjunto_id)));
create policy pu_admin on public.punto_unidades for all
  using (exists (select 1 from public.puntos p where p.id = punto_id and es_admin(p.conjunto_id)))
  with check (exists (select 1 from public.puntos p where p.id = punto_id and es_admin(p.conjunto_id)));
create policy rut_ver on public.rutinas for select using (es_miembro(conjunto_id));
create policy rut_admin on public.rutinas for all using (es_admin(conjunto_id)) with check (es_admin(conjunto_id));
create policy reg_ver on public.rutina_registros for select using (es_miembro(conjunto_id));
create policy reg_borrar on public.rutina_registros for delete using (es_admin(conjunto_id));
-- los registros solo se crean con marcar_rutina (exige la etiqueta del piso)

-- Nadie lee el código secreto de la etiqueta desde la app (solo la administración, con token_punto)
revoke select on public.puntos from anon, authenticated;
grant select (id, conjunto_id, nombre, torre, piso, descripcion, orden, created_at) on public.puntos to authenticated;
grant insert, update, delete on public.puntos to authenticated;

-- El residente no ve el código secreto de la etiqueta
create or replace function public.token_punto(p uuid) returns text
language sql stable security definer set search_path = public as $$
  select token from puntos where id = p and es_admin(conjunto_id) $$;

-- Marcar una rutina como realizada (escaneando la etiqueta NFC del piso)
create or replace function public.marcar_rutina(p_rutina uuid, p_token text, p_foto text, p_nota text) returns json
language plpgsql security definer set search_path = public, auth as $$
declare r rutinas%rowtype; p puntos%rowtype; v_via text; v_quien text; v_reg rutina_registros%rowtype; u record;
begin
  select * into r from rutinas where id = p_rutina;
  if r.id is null then raise exception 'Rutina no encontrada'; end if;
  select * into p from puntos where id = r.punto_id;
  if not es_personal(r.conjunto_id) then raise exception 'Solo el personal del conjunto puede registrar rondas'; end if;
  if p_token is not null and p_token = p.token then v_via := 'nfc';
  elsif es_admin(r.conjunto_id) then v_via := 'manual';
  else raise exception 'Escanea la etiqueta NFC del piso para registrar que se realizó.'; end if;
  if r.foto_requerida and coalesce(p_foto, '') = '' then raise exception 'Esta rutina exige una foto como evidencia.'; end if;
  select coalesce(nullif(u2.raw_user_meta_data ->> 'nombre', ''), u2.email) into v_quien from auth.users u2 where u2.id = auth.uid();
  insert into rutina_registros (conjunto_id, rutina_id, punto_id, quien, via, foto, nota)
    values (r.conjunto_id, r.id, r.punto_id, v_quien, v_via, nullif(p_foto, ''), nullif(p_nota, ''))
    on conflict (rutina_id, fecha) do nothing
    returning * into v_reg;
  if v_reg.id is null then
    select * into v_reg from rutina_registros where rutina_id = r.id and fecha = hoy();
    raise exception 'Ya quedó registrado hoy a las %', to_char(v_reg.hecho_at at time zone 'America/Bogota', 'HH12:MI a.m.');
  end if;
  if r.notificar then
    for u in select unidad_id from punto_unidades where punto_id = p.id loop
      perform notificar(r.conjunto_id, u.unidad_id, null, false, false, false,
        p.nombre || ': ' || lower(r.nombre) || ' realizado',
        'A las ' || to_char(v_reg.hecho_at at time zone 'America/Bogota', 'HH12:MI a.m.') || coalesce(' · ' || v_reg.nota, ''), 'ronda', 'mipiso');
    end loop;
  end if;
  return json_build_object('id', v_reg.id, 'hecho_at', v_reg.hecho_at, 'via', v_via);
end $$;

-- Cumplimiento de cada rutina en los últimos N días (sin contar hoy)
create or replace function public.cumplimiento_rutinas(p_conjunto uuid, p_dias int default 30)
returns table (rutina_id uuid, punto_id uuid, esperados bigint, hechos bigint, ultimo timestamptz)
language sql stable security definer set search_path = public as $$
  select r.id, r.punto_id,
    (select count(*) from generate_series(greatest(hoy() - p_dias, r.created_at::date), hoy() - 1, interval '1 day') d
       where extract(isodow from d)::int = any(r.dias)),
    (select count(*) from rutina_registros g where g.rutina_id = r.id and g.fecha >= hoy() - p_dias and g.fecha < hoy()),
    (select max(hecho_at) from rutina_registros g where g.rutina_id = r.id)
  from rutinas r where r.conjunto_id = p_conjunto and r.activa and es_gestion(p_conjunto) $$;

-- Alerta a la administración cuando se pasa la hora límite sin registro
create or replace function public.revision_rutinas() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; v_ahora time := (now() at time zone 'America/Bogota')::time;
begin
  for r in select ru.*, p.nombre punto from rutinas ru join puntos p on p.id = ru.punto_id
           where ru.activa and ru.hora_limite is not null and ru.hora_limite <= v_ahora
             and extract(isodow from hoy())::int = any(ru.dias)
             and ru.ultima_alerta is distinct from hoy()
             and not exists (select 1 from rutina_registros g where g.rutina_id = ru.id and g.fecha = hoy()) loop
    perform notificar(r.conjunto_id, null, null, true, false, false, 'Sin realizar: ' || r.nombre || ' · ' || r.punto,
      'La hora límite era ' || to_char(r.hora_limite, 'HH12:MI a.m.') || ' y nadie lo ha registrado.', 'ronda', 'mant');
    update rutinas set ultima_alerta = hoy() where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.revision_rutinas() from public, anon, authenticated;
revoke execute on function public.marcar_rutina(uuid, text, text, text) from anon;
revoke execute on function public.cumplimiento_rutinas(uuid, int) from anon;
revoke execute on function public.token_punto(uuid) from anon;

-- Los residentes ven la foto del aseo de su conjunto
create policy soportes_rondas on storage.objects for select to authenticated using (
  bucket_id = 'soportes' and exists (select 1 from public.rutina_registros g where g.foto = name and public.es_miembro(g.conjunto_id)));

alter publication supabase_realtime add table public.rutina_registros;

do $$
begin
  perform cron.schedule('syaph-revision-rutinas', '*/30 * * * *', 'select public.revision_rutinas()');
exception when others then
  raise notice 'pg_cron no disponible: la alerta de rondas no quedó programada (%).', sqlerrm;
end $$;
