-- =====================================================================
--  SYAPH360 · Migración 04 · Programa de mantenimiento y control operativo
--  Áreas, proveedores con seguridad social y controles operativos,
--  agenda de mantenimientos con ingreso por portería, registro
--  fotográfico antes/durante/después, liberación con alertas preventivas,
--  presupuesto anual con gasto descontado y revisión diaria automática.
--  Correr una sola vez, después de 01, 02 y 03.
-- =====================================================================

-- ---------- Rol proveedor (técnico externo con acceso propio) ----------
alter table public.miembros drop constraint miembros_rol_check;
alter table public.miembros add constraint miembros_rol_check check (rol in ('admin','consejo','residente','porteria','proveedor'));
alter table public.invitaciones drop constraint invitaciones_rol_check;
alter table public.invitaciones add constraint invitaciones_rol_check check (rol in ('admin','consejo','residente','porteria','proveedor'));

-- ---------- Áreas del conjunto ----------
create table public.areas (
  id uuid primary key default gen_random_uuid(),
  conjunto_id uuid not null references public.conjuntos on delete cascade,
  nombre text not null,
  descripcion text,
  orden int not null default 0,
  unique (conjunto_id, nombre)
);
alter table public.activos add column area_id uuid references public.areas on delete set null;

-- ---------- Proveedores ----------
create table public.proveedores (
  id uuid primary key default gen_random_uuid(),
  conjunto_id uuid not null references public.conjuntos on delete cascade,
  nombre text not null,
  nit text,
  especialidad text,
  contacto text,
  telefono text,
  email text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (conjunto_id, nombre)
);
alter table public.miembros add column proveedor_id uuid references public.proveedores on delete cascade;
alter table public.invitaciones add column proveedor_id uuid references public.proveedores on delete cascade;

create table public.proveedor_docs (
  id uuid primary key default gen_random_uuid(),
  conjunto_id uuid not null references public.conjuntos on delete cascade,
  proveedor_id uuid not null references public.proveedores on delete cascade,
  ejecucion_id uuid,                -- control operativo de un trabajo puntual (ATS, permiso de trabajo)
  tipo text not null check (tipo in ('Seguridad social (PILA)','ARL','Trabajo en alturas','RUT','Cámara de comercio','Póliza de responsabilidad civil','Control operativo','Otro')),
  titulo text,
  archivo text,
  vence date,
  subido_por uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create or replace function public.mi_proveedor(c uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select proveedor_id from miembros where conjunto_id = c and user_id = auth.uid() and rol = 'proveedor' and conjunto_vigente(c) limit 1 $$;

-- Habilitado = seguridad social (PILA) vigente
create or replace function public.proveedor_habilitado(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from proveedor_docs d where d.proveedor_id = p and d.tipo = 'Seguridad social (PILA)' and d.vence >= hoy()) $$;

-- ---------- Plan: proveedor y tipo ----------
alter table public.mant_plan add column proveedor_id uuid references public.proveedores on delete set null;
alter table public.mant_plan add column tipo text not null default 'Preventivo' check (tipo in ('Preventivo','Predictivo','Correctivo'));
alter table public.ordenes add column costo numeric(14,0);

-- ---------- Agenda: cada mantenimiento programado y su ejecución ----------
create table public.ejecuciones (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity,
  conjunto_id uuid not null references public.conjuntos on delete cascade,
  plan_id uuid references public.mant_plan on delete set null,
  activo_id uuid references public.activos on delete set null,
  proveedor_id uuid references public.proveedores on delete set null,
  titulo text not null,
  tipo text not null default 'Preventivo' check (tipo in ('Preventivo','Predictivo','Correctivo')),
  fecha_programada date not null,
  hora text,
  estado text not null default 'Programado' check (estado in ('Programado','En portería','Ingreso aprobado','En curso','Liberado','No realizado','Cancelado')),
  costo_estimado numeric(14,0) not null default 0,
  costo numeric(14,0),
  tecnico text,
  llegada_at timestamptz,
  ingreso_at timestamptz,
  ingreso_aprobado_por uuid,
  inicio_at timestamptz,
  liberado_at timestamptz,
  liberado_por uuid,
  fotos_antes text[] not null default '{}',
  fotos_durante text[] not null default '{}',
  fotos_despues text[] not null default '{}',
  observaciones text,
  novedades text,
  equipo_estado text check (equipo_estado in ('Bueno','Regular','Malo','Fuera de servicio')),
  proximo_cambio text,
  proximo_cambio_fecha date,
  proximo_cambio_costo numeric(14,0),
  motivo_no_realizado text,
  creado_por uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index ejecuciones_plan_fecha on public.ejecuciones (plan_id, fecha_programada) where plan_id is not null;
create index ejecuciones_agenda on public.ejecuciones (conjunto_id, fecha_programada);
alter table public.proveedor_docs add constraint proveedor_docs_ejecucion_fk foreign key (ejecucion_id) references public.ejecuciones on delete cascade;

create table public.presupuestos_mant (
  conjunto_id uuid not null references public.conjuntos on delete cascade,
  anio int not null,
  valor numeric(14,0) not null check (valor >= 0),
  primary key (conjunto_id, anio)
);

-- ---------- Reglas del flujo y avisos ----------
create or replace function public.tg_ejecucion() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_act text; v_prov text; v_hab boolean;
begin
  select nombre into v_act from activos where id = new.activo_id;
  select nombre into v_prov from proveedores where id = new.proveedor_id;
  v_hab := new.proveedor_id is null or proveedor_habilitado(new.proveedor_id);
  if tg_op = 'UPDATE' and new.estado is distinct from old.estado then
    if new.estado = 'Ingreso aprobado' and not v_hab and not es_admin(new.conjunto_id) then
      raise exception 'La seguridad social del proveedor no está vigente. Solo la administración puede aprobar el ingreso.';
    end if;
    if new.estado = 'En curso' and old.estado not in ('Ingreso aprobado','En curso') and new.proveedor_id is not null then
      raise exception 'Primero se debe aprobar el ingreso del proveedor.';
    end if;
    if new.estado = 'En curso' and cardinality(new.fotos_antes) = 0 then
      raise exception 'Toma al menos una foto del equipo ANTES de empezar.';
    end if;
    if new.estado = 'Liberado' and (cardinality(new.fotos_antes) = 0 or cardinality(new.fotos_despues) = 0) then
      raise exception 'Para liberar el equipo se necesitan fotos de antes y de después.';
    end if;
    if new.estado = 'En portería' then new.llegada_at := coalesce(new.llegada_at, now()); end if;
    if new.estado = 'Ingreso aprobado' then new.ingreso_at := coalesce(new.ingreso_at, now()); new.ingreso_aprobado_por := auth.uid(); end if;
    if new.estado = 'En curso' then new.inicio_at := coalesce(new.inicio_at, now()); end if;
    if new.estado = 'Liberado' then new.liberado_at := now(); new.liberado_por := auth.uid(); end if;
  end if;
  return new;
end $$;
create trigger ejecuciones_reglas before update on public.ejecuciones for each row execute function public.tg_ejecucion();

create or replace function public.tg_ejecucion_aviso() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_act text; v_prov text; v_hab boolean; v_t text;
begin
  if new.estado is not distinct from old.estado then return new; end if;
  select nombre into v_act from activos where id = new.activo_id;
  select nombre into v_prov from proveedores where id = new.proveedor_id;
  v_hab := new.proveedor_id is null or proveedor_habilitado(new.proveedor_id);
  v_t := new.titulo || coalesce(' · ' || v_act, '');
  if new.estado = 'En portería' then
    perform notificar(new.conjunto_id, null, null, true, false, false,
      'Llegó ' || coalesce(v_prov, 'el proveedor') || case when v_hab then '' else ' · SEGURIDAD SOCIAL VENCIDA' end,
      v_t || case when v_hab then '. Aprueba el ingreso.' else '. Solo la administración puede autorizar su ingreso.' end, 'mant', 'mant');
  elsif new.estado = 'Ingreso aprobado' then
    perform notificar(new.conjunto_id, null, null, false, true, false, 'Ingreso aprobado: ' || coalesce(v_prov, 'proveedor'), v_t, 'mant', 'porteria');
  elsif new.estado = 'Liberado' then
    -- el plan corre su próxima fecha y el equipo queda con el estado reportado
    update mant_plan set ultimo = hoy(), proximo = (hoy() + make_interval(months => frecuencia_meses))::date where id = new.plan_id;
    if new.equipo_estado is not null then update activos set estado = new.equipo_estado where id = new.activo_id; end if;
    perform notificar(new.conjunto_id, null, null, true, false, false, 'Mantenimiento liberado: ' || v_t,
      coalesce(new.novedades, 'Sin novedades') || coalesce(' · Costo ' || replace(to_char(new.costo, 'FM999,999,999,999'), ',', '.'), ''), 'mant', 'mant');
    if new.proximo_cambio is not null then
      perform notificar(new.conjunto_id, null, null, true, false, false, 'Alerta preventiva: ' || coalesce(v_act, new.titulo),
        new.proximo_cambio || coalesce(' para ' || to_char(new.proximo_cambio_fecha, 'DD/MM/YYYY'), '') || coalesce(' · estimado $' || replace(to_char(new.proximo_cambio_costo, 'FM999,999,999,999'), ',', '.'), ''), 'mant', 'mant');
    end if;
  elsif new.estado = 'No realizado' then
    perform notificar(new.conjunto_id, null, null, true, false, false, 'No se realizó: ' || v_t, coalesce(new.motivo_no_realizado, 'Sin motivo registrado'), 'mant', 'mant');
  end if;
  return new;
end $$;
create trigger ejecuciones_aviso after update on public.ejecuciones for each row execute function public.tg_ejecucion_aviso();

-- Arma la agenda de los próximos meses a partir del plan preventivo
create or replace function public.generar_agenda(p_conjunto uuid, p_meses int default 3) returns int
language plpgsql security definer set search_path = public as $$
declare r record; f date; n int := 0; v_hasta date := (hoy() + make_interval(months => greatest(1, least(p_meses, 12))))::date; k int;
begin
  if not es_admin(p_conjunto) then raise exception 'Solo la administración puede generar la agenda'; end if;
  for r in select * from mant_plan where conjunto_id = p_conjunto loop
    f := r.proximo;
    while f <= v_hasta loop
      if f >= hoy() - 7 then
        insert into ejecuciones (conjunto_id, plan_id, activo_id, proveedor_id, titulo, tipo, fecha_programada, costo_estimado)
        values (p_conjunto, r.id, r.activo_id, r.proveedor_id, r.activo, r.tipo, f, r.costo)
        on conflict (plan_id, fecha_programada) where plan_id is not null do nothing;
        get diagnostics k = row_count; n := n + k;
      end if;
      f := (f + make_interval(months => r.frecuencia_meses))::date;
    end loop;
  end loop;
  return n;
end $$;

-- Cuadro de mando del año: presupuesto, gasto descontado, proyección e inventario
create or replace function public.tablero_mant(p_conjunto uuid, p_anio int) returns json
language sql stable security definer set search_path = public as $$
  with
  ok as (select es_gestion(p_conjunto) as v),
  gastos as (
    select date_part('month', liberado_at at time zone 'America/Bogota')::int as mes, coalesce(costo, 0) as valor, activo_id
      from ejecuciones where conjunto_id = p_conjunto and estado = 'Liberado' and date_part('year', liberado_at at time zone 'America/Bogota') = p_anio
    union all
    select date_part('month', cerrada_at at time zone 'America/Bogota')::int, coalesce(costo, 0), activo_id
      from ordenes where conjunto_id = p_conjunto and estado = 'Cerrada' and costo is not null and date_part('year', cerrada_at at time zone 'America/Bogota') = p_anio)
  select case when not (select v from ok) then null else json_build_object(
    'presupuesto', coalesce((select valor from presupuestos_mant where conjunto_id = p_conjunto and anio = p_anio), 0),
    'gastado', coalesce((select sum(valor) from gastos), 0),
    'por_mes', (select json_agg(coalesce((select sum(valor) from gastos g where g.mes = m), 0) order by m) from generate_series(1, 12) m),
    'comprometido', coalesce((select sum(costo_estimado) from ejecuciones where conjunto_id = p_conjunto and estado in ('Programado','En portería','Ingreso aprobado','En curso')
                                 and date_part('year', fecha_programada) = p_anio and fecha_programada >= hoy()), 0),
    'proximos_cambios', coalesce((select sum(proximo_cambio_costo) from ejecuciones where conjunto_id = p_conjunto and proximo_cambio_fecha is not null
                                 and date_part('year', proximo_cambio_fecha) = p_anio and proximo_cambio_fecha >= hoy()), 0),
    'por_area', (select coalesce(json_agg(x order by x.valor desc), '[]') from (
        select coalesce(ar.nombre, 'Sin área') as area, sum(g.valor) as valor from gastos g
        left join activos a on a.id = g.activo_id left join areas ar on ar.id = a.area_id group by 1) x),
    'programados', (select count(*) from ejecuciones where conjunto_id = p_conjunto and date_part('year', fecha_programada) = p_anio and fecha_programada < hoy() and estado <> 'Cancelado'),
    'cumplidos', (select count(*) from ejecuciones where conjunto_id = p_conjunto and date_part('year', fecha_programada) = p_anio and fecha_programada < hoy() and estado = 'Liberado'),
    'atrasados', (select count(*) from ejecuciones where conjunto_id = p_conjunto and fecha_programada < hoy() and estado in ('Programado','En portería','Ingreso aprobado','En curso')),
    'equipos', (select json_object_agg(estado, n) from (select estado, count(*) n from activos where conjunto_id = p_conjunto group by estado) e),
    'equipos_total', (select count(*) from activos where conjunto_id = p_conjunto),
    'valor_inventario', coalesce((select sum(valor) from activos where conjunto_id = p_conjunto), 0)
  ) end $$;

-- Lo que un residente puede consultar de un equipo al escanear su QR o NFC
create or replace function public.activo_publico(p_id uuid) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('id', a.id, 'codigo', a.codigo, 'nombre', a.nombre, 'ubicacion', a.ubicacion, 'area', ar.nombre,
    'estado', a.estado, 'conjunto_id', a.conjunto_id,
    'ultimo', (select max(e.liberado_at) from ejecuciones e where e.activo_id = a.id and e.estado = 'Liberado'),
    'proximo', (select min(e.fecha_programada) from ejecuciones e where e.activo_id = a.id and e.estado = 'Programado' and e.fecha_programada >= hoy()),
    'certificado_vence', (select max(d.vence) from documentos d where d.activo_id = a.id and d.tipo = 'Certificado'))
  from activos a left join areas ar on ar.id = a.area_id
  where a.id = p_id and es_miembro(a.conjunto_id) $$;

-- Invitaciones: ahora también vinculan al técnico con su proveedor
create or replace function public.reclamar_invitaciones() returns int
language plpgsql security definer set search_path = public as $$
declare v_email text := lower(coalesce(auth.jwt() ->> 'email', '')); n int;
begin
  if auth.uid() is null or v_email = '' then return 0; end if;
  insert into miembros (conjunto_id, user_id, rol, unidad_id, proveedor_id)
    select conjunto_id, auth.uid(), rol, unidad_id, proveedor_id from invitaciones
    where lower(email) = v_email and not usada
    on conflict (conjunto_id, user_id, rol) do nothing;
  get diagnostics n = row_count;
  update invitaciones set usada = true where lower(email) = v_email and not usada;
  return n;
end $$;

-- ---------- Revisión diaria (alertas de vencimientos y lo que no se hizo) ----------
create or replace function public.revision_diaria() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  -- mañana hay mantenimiento
  for r in select e.*, a.nombre act, p.nombre prov from ejecuciones e left join activos a on a.id = e.activo_id left join proveedores p on p.id = e.proveedor_id
           where e.fecha_programada = hoy() + 1 and e.estado = 'Programado' loop
    perform notificar(r.conjunto_id, null, null, true, true, false, 'Mañana: ' || r.titulo,
      coalesce(r.act, '') || coalesce(' · ' || r.prov, '') || case when r.proveedor_id is not null and not proveedor_habilitado(r.proveedor_id) then ' · seguridad social sin vigencia' else '' end, 'mant', 'mant');
    n := n + 1;
  end loop;
  -- ayer no se realizó
  for r in select e.*, p.nombre prov from ejecuciones e left join proveedores p on p.id = e.proveedor_id
           where e.fecha_programada = hoy() - 1 and e.estado in ('Programado','En portería','Ingreso aprobado','En curso') loop
    perform notificar(r.conjunto_id, null, null, true, false, false, 'No se realizó el mantenimiento: ' || r.titulo,
      'Estaba programado para ayer' || coalesce(' con ' || r.prov, '') || '. Reprográmalo o registra el motivo.', 'mant', 'mant');
    n := n + 1;
  end loop;
  -- documentos de proveedores que vencen en 7 días o vencieron hoy
  for r in select d.*, p.nombre prov from proveedor_docs d join proveedores p on p.id = d.proveedor_id
           where d.vence in (hoy() + 7, hoy()) loop
    perform notificar(r.conjunto_id, null, null, true, false, false,
      case when r.vence = hoy() then 'Vence hoy: ' else 'Vence en 7 días: ' end || r.tipo || ' de ' || r.prov, coalesce(r.titulo, ''), 'mant', 'proveedores');
    n := n + 1;
  end loop;
  -- próximos cambios de equipos en 15 días
  for r in select e.*, a.nombre act from ejecuciones e left join activos a on a.id = e.activo_id
           where e.proximo_cambio_fecha = hoy() + 15 loop
    perform notificar(r.conjunto_id, null, null, true, false, false, 'Cambio en 15 días: ' || coalesce(r.act, r.titulo),
      r.proximo_cambio || coalesce(' · estimado $' || replace(to_char(r.proximo_cambio_costo, 'FM999,999,999,999'), ',', '.'), ''), 'mant', 'mant');
    n := n + 1;
  end loop;
  -- garantías y documentos del conjunto que vencen en 30 días
  for r in select a.conjunto_id, a.nombre, a.garantia_hasta from activos a where a.garantia_hasta = hoy() + 30 loop
    perform notificar(r.conjunto_id, null, null, true, false, false, 'Garantía vence en 30 días: ' || r.nombre, null, 'mant', 'inventario'); n := n + 1;
  end loop;
  for r in select d.conjunto_id, d.titulo, d.tipo from documentos d where d.vence = hoy() + 30 loop
    perform notificar(r.conjunto_id, null, null, true, false, false, r.tipo || ' vence en 30 días: ' || r.titulo, null, 'mant', 'documentos'); n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.revision_diaria() from public, anon, authenticated;

-- ---------- Seguridad por filas ----------
alter table public.areas enable row level security;
alter table public.proveedores enable row level security;
alter table public.proveedor_docs enable row level security;
alter table public.ejecuciones enable row level security;
alter table public.presupuestos_mant enable row level security;

create policy area_ver on public.areas for select using (es_miembro(conjunto_id));
create policy area_admin on public.areas for all using (es_admin(conjunto_id)) with check (es_admin(conjunto_id));

create policy prov_ver on public.proveedores for select using (es_gestion(conjunto_id) or es_porteria(conjunto_id) or id = mi_proveedor(conjunto_id));
create policy prov_admin on public.proveedores for all using (es_admin(conjunto_id)) with check (es_admin(conjunto_id));

create policy pdoc_ver on public.proveedor_docs for select using (es_gestion(conjunto_id) or es_porteria(conjunto_id) or proveedor_id = mi_proveedor(conjunto_id));
create policy pdoc_subir on public.proveedor_docs for insert with check (es_admin(conjunto_id) or proveedor_id = mi_proveedor(conjunto_id));
create policy pdoc_borrar on public.proveedor_docs for delete using (es_admin(conjunto_id));

create policy ejec_ver on public.ejecuciones for select using (es_gestion(conjunto_id) or es_porteria(conjunto_id) or proveedor_id = mi_proveedor(conjunto_id));
create policy ejec_crear on public.ejecuciones for insert with check (es_admin(conjunto_id));
create policy ejec_operar on public.ejecuciones for update
  using (es_operacion(conjunto_id) or proveedor_id = mi_proveedor(conjunto_id))
  with check (es_operacion(conjunto_id) or proveedor_id = mi_proveedor(conjunto_id));
create policy ejec_borrar on public.ejecuciones for delete using (es_admin(conjunto_id));

create policy ppto_ver on public.presupuestos_mant for select using (es_gestion(conjunto_id));
create policy ppto_admin on public.presupuestos_mant for all using (es_admin(conjunto_id)) with check (es_admin(conjunto_id));

-- El técnico y portería ven los equipos con los que trabajan
create policy act_porteria on public.activos for select using (es_porteria(conjunto_id));
create policy act_proveedor on public.activos for select using (exists (
  select 1 from public.ejecuciones e where e.activo_id = activos.id and e.proveedor_id = public.mi_proveedor(e.conjunto_id)));

-- Fotos: el técnico ve lo que subió; gestión y portería ya ven todo lo de su conjunto
create policy soportes_proveedor on storage.objects for select to authenticated using (
  bucket_id = 'soportes' and exists (select 1 from public.ejecuciones e
    where e.proveedor_id = public.mi_proveedor(e.conjunto_id)
      and (name = any(e.fotos_antes) or name = any(e.fotos_durante) or name = any(e.fotos_despues))));

revoke execute on function public.generar_agenda(uuid, int) from anon;
revoke execute on function public.tablero_mant(uuid, int) from anon;
revoke execute on function public.activo_publico(uuid) from anon;
revoke execute on function public.proveedor_habilitado(uuid) from anon;

alter publication supabase_realtime add table public.ejecuciones;

-- ---------- Programar la revisión diaria a las 6:00 a.m. de Colombia ----------
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('syaph-revision-diaria', '0 11 * * *', 'select public.revision_diaria()');
exception when others then
  raise notice 'pg_cron no disponible: la revisión diaria no quedó programada (%).', sqlerrm;
end $$;
