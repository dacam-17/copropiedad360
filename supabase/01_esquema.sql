-- =====================================================================
--  Copropiedad 360 · Esquema de base de datos para Supabase (piloto)
--  Cómo usarlo: Supabase > SQL Editor > New query > pegar todo > Run
--  Se puede correr una sola vez sobre un proyecto nuevo.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Fecha local de Colombia ----------
create or replace function public.hoy() returns date
language sql stable as $$ select (now() at time zone 'America/Bogota')::date $$;

-- ---------- Conjuntos, unidades y personas ----------
create table public.conjuntos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  nit text,
  ciudad text,
  direccion text,
  presupuesto_mensual numeric(14,0) not null default 0,  -- total de cuotas ordinarias al mes
  info_util text,                                          -- horarios, teléfonos, normas rápidas
  created_at timestamptz not null default now()
);

create table public.unidades (
  id uuid primary key default gen_random_uuid(),
  conjunto_id uuid not null references public.conjuntos on delete cascade,
  codigo text not null,                  -- ej. T1-1104, Casa 14
  coeficiente numeric(8,4) not null default 0,
  propietario text,
  email text,
  unique (conjunto_id, codigo)
);

create table public.miembros (
  id uuid primary key default gen_random_uuid(),
  conjunto_id uuid not null references public.conjuntos on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  rol text not null check (rol in ('admin','consejo','residente')),
  unidad_id uuid references public.unidades on delete set null,
  created_at timestamptz not null default now(),
  unique (conjunto_id, user_id, rol)
);

create table public.invitaciones (
  id uuid primary key default gen_random_uuid(),
  conjunto_id uuid not null references public.conjuntos on delete cascade,
  email text not null,
  rol text not null check (rol in ('admin','consejo','residente')),
  unidad_id uuid references public.unidades on delete cascade,
  usada boolean not null default false,
  created_at timestamptz not null default now()
);
create index invitaciones_email on public.invitaciones (lower(email)) where not usada;

-- ---------- Funciones de permisos (se usan en todas las reglas) ----------
create or replace function public.es_miembro(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from miembros where conjunto_id = c and user_id = auth.uid()) $$;

create or replace function public.es_admin(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from miembros where conjunto_id = c and user_id = auth.uid() and rol = 'admin') $$;

create or replace function public.es_gestion(c uuid) returns boolean   -- admin o consejo
language sql stable security definer set search_path = public as $$
  select exists (select 1 from miembros where conjunto_id = c and user_id = auth.uid() and rol in ('admin','consejo')) $$;

create or replace function public.mi_unidad(c uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select unidad_id from miembros where conjunto_id = c and user_id = auth.uid() and rol = 'residente' limit 1 $$;

-- ---------- Cartera ----------
create table public.cargos (
  id uuid primary key default gen_random_uuid(),
  conjunto_id uuid not null references public.conjuntos on delete cascade,
  unidad_id uuid not null references public.unidades on delete cascade,
  periodo date not null,                         -- primer día del mes
  concepto text not null default 'Cuota ordinaria',
  valor numeric(14,0) not null check (valor >= 0),
  vence date not null,
  created_at timestamptz not null default now(),
  unique (unidad_id, periodo, concepto)
);

create table public.pagos (
  id uuid primary key default gen_random_uuid(),
  conjunto_id uuid not null references public.conjuntos on delete cascade,
  unidad_id uuid not null references public.unidades on delete cascade,
  valor numeric(14,0) not null check (valor > 0),
  fecha_pago date not null default public.hoy(),
  medio text,
  comprobante text,                              -- ruta del archivo en Storage
  estado text not null default 'pendiente' check (estado in ('pendiente','aprobado','rechazado')),
  nota text,
  creado_por uuid default auth.uid(),
  revisado_por uuid,
  created_at timestamptz not null default now()
);

create view public.v_saldos with (security_invoker = on) as
select u.id as unidad_id, u.conjunto_id, u.codigo, u.propietario,
  coalesce((select sum(c.valor) from public.cargos c where c.unidad_id = u.id), 0)
  - coalesce((select sum(p.valor) from public.pagos p where p.unidad_id = u.id and p.estado = 'aprobado'), 0) as saldo,
  (select c.valor from public.cargos c where c.unidad_id = u.id order by c.periodo desc limit 1) as cuota
from public.unidades u;

-- ---------- Mantenimiento ----------
create table public.mant_plan (
  id uuid primary key default gen_random_uuid(),
  conjunto_id uuid not null references public.conjuntos on delete cascade,
  activo text not null,
  frecuencia_meses int not null default 1 check (frecuencia_meses > 0),
  proveedor text,
  ultimo date,
  proximo date not null,
  costo numeric(14,0) not null default 0,
  nota text
);

create table public.ordenes (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity,
  conjunto_id uuid not null references public.conjuntos on delete cascade,
  titulo text not null,
  ubicacion text,
  prioridad text not null default 'Media' check (prioridad in ('Alta','Media','Baja')),
  estado text not null default 'Reportada' check (estado in ('Reportada','En curso','Cerrada')),
  responsable text,
  origen text,
  foto text,
  creado_por uuid default auth.uid(),
  created_at timestamptz not null default now(),
  cerrada_at timestamptz
);

-- ---------- PQRS ----------
create table public.pqrs (
  id uuid primary key default gen_random_uuid(),
  radicado bigint generated always as identity,
  conjunto_id uuid not null references public.conjuntos on delete cascade,
  unidad_id uuid references public.unidades on delete set null,
  tipo text not null check (tipo in ('Petición','Queja','Reclamo','Sugerencia')),
  asunto text not null,
  detalle text,
  estado text not null default 'Abierta' check (estado in ('Abierta','Respondida')),
  respuesta text,
  creado_por uuid default auth.uid(),
  created_at timestamptz not null default now(),
  respondida_at timestamptz
);

-- ---------- Reservas ----------
create table public.zonas (
  id uuid primary key default gen_random_uuid(),
  conjunto_id uuid not null references public.conjuntos on delete cascade,
  nombre text not null,
  aforo int,
  costo numeric(14,0) not null default 0,
  deposito numeric(14,0) not null default 0,
  reglas text,
  horarios text[] not null default '{}'
);

create table public.reservas (
  id uuid primary key default gen_random_uuid(),
  conjunto_id uuid not null references public.conjuntos on delete cascade,
  zona_id uuid not null references public.zonas on delete cascade,
  unidad_id uuid not null references public.unidades on delete cascade,
  fecha date not null,
  horario text not null,
  estado text not null default 'Confirmada' check (estado in ('Confirmada','Pendiente depósito','Cancelada')),
  creado_por uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index reservas_unica on public.reservas (zona_id, fecha, horario) where estado <> 'Cancelada';

-- El residente no decide el estado: si la zona cobra, queda pendiente de depósito
create or replace function public.reserva_estado() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not es_admin(new.conjunto_id) then
    select case when z.costo + z.deposito > 0 then 'Pendiente depósito' else 'Confirmada' end
      into new.estado from zonas z where z.id = new.zona_id;
    if new.fecha < hoy() then raise exception 'No se puede reservar una fecha pasada'; end if;
  end if;
  return new;
end $$;
create trigger reservas_estado before insert on public.reservas
  for each row execute function public.reserva_estado();

-- ---------- Comunicación ----------
create table public.circulares (
  id uuid primary key default gen_random_uuid(),
  conjunto_id uuid not null references public.conjuntos on delete cascade,
  titulo text not null,
  categoria text not null default 'Aviso',
  cuerpo text not null,
  fijada boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.mensajes (
  id uuid primary key default gen_random_uuid(),
  conjunto_id uuid not null references public.conjuntos on delete cascade,
  unidad_id uuid not null references public.unidades on delete cascade,   -- cada unidad es una conversación
  autor uuid default auth.uid(),
  de_admin boolean not null default false,
  texto text not null check (length(texto) between 1 and 2000),
  leido boolean not null default false,
  created_at timestamptz not null default now()
);
create index mensajes_hilo on public.mensajes (conjunto_id, unidad_id, created_at);

-- ---------- Asambleas y votaciones ----------
create table public.asambleas (
  id uuid primary key default gen_random_uuid(),
  conjunto_id uuid not null references public.conjuntos on delete cascade,
  titulo text not null,
  fecha timestamptz,
  descripcion text,
  created_at timestamptz not null default now()
);

create table public.votaciones (
  id uuid primary key default gen_random_uuid(),
  conjunto_id uuid not null references public.conjuntos on delete cascade,
  asamblea_id uuid not null references public.asambleas on delete cascade,
  pregunta text not null,
  opciones text[] not null,
  abierta boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.votos (
  votacion_id uuid not null references public.votaciones on delete cascade,
  unidad_id uuid not null references public.unidades on delete cascade,
  conjunto_id uuid not null references public.conjuntos on delete cascade,
  opcion text not null,
  user_id uuid default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (votacion_id, unidad_id)
);

-- =====================================================================
--  Seguridad por filas (cada quien ve solo lo de su conjunto y su rol)
-- =====================================================================
alter table public.conjuntos   enable row level security;
alter table public.unidades    enable row level security;
alter table public.miembros    enable row level security;
alter table public.invitaciones enable row level security;
alter table public.cargos      enable row level security;
alter table public.pagos       enable row level security;
alter table public.mant_plan   enable row level security;
alter table public.ordenes     enable row level security;
alter table public.pqrs        enable row level security;
alter table public.zonas       enable row level security;
alter table public.reservas    enable row level security;
alter table public.circulares  enable row level security;
alter table public.mensajes    enable row level security;
alter table public.asambleas   enable row level security;
alter table public.votaciones  enable row level security;
alter table public.votos       enable row level security;

-- Conjuntos
create policy conj_ver on public.conjuntos for select using (es_miembro(id));
create policy conj_editar on public.conjuntos for update using (es_admin(id)) with check (es_admin(id));

-- Lectura para todos los miembros y escritura solo del administrador
create policy zonas_ver on public.zonas for select using (es_miembro(conjunto_id));
create policy zonas_admin on public.zonas for all using (es_admin(conjunto_id)) with check (es_admin(conjunto_id));
create policy circ_ver on public.circulares for select using (es_miembro(conjunto_id));
create policy circ_admin on public.circulares for all using (es_admin(conjunto_id)) with check (es_admin(conjunto_id));
create policy asam_ver on public.asambleas for select using (es_miembro(conjunto_id));
create policy asam_admin on public.asambleas for all using (es_admin(conjunto_id)) with check (es_admin(conjunto_id));
create policy vot_ver on public.votaciones for select using (es_miembro(conjunto_id));
create policy vot_admin on public.votaciones for all using (es_admin(conjunto_id)) with check (es_admin(conjunto_id));

-- Miembros e invitaciones
create policy miem_ver on public.miembros for select using (user_id = auth.uid() or es_admin(conjunto_id));
create policy miem_admin on public.miembros for all using (es_admin(conjunto_id)) with check (es_admin(conjunto_id));
create policy inv_admin on public.invitaciones for all using (es_admin(conjunto_id)) with check (es_admin(conjunto_id));

-- Unidades: gestión ve todas; el residente solo la suya
create policy uni_ver on public.unidades for select using (es_gestion(conjunto_id) or id = mi_unidad(conjunto_id));
create policy uni_admin on public.unidades for all using (es_admin(conjunto_id)) with check (es_admin(conjunto_id));

-- Cargos y pagos
create policy carg_ver on public.cargos for select using (es_gestion(conjunto_id) or unidad_id = mi_unidad(conjunto_id));
create policy carg_admin on public.cargos for all using (es_admin(conjunto_id)) with check (es_admin(conjunto_id));
create policy pag_ver on public.pagos for select using (es_gestion(conjunto_id) or unidad_id = mi_unidad(conjunto_id));
create policy pag_reportar on public.pagos for insert with check (
  es_admin(conjunto_id) or (unidad_id = mi_unidad(conjunto_id) and estado = 'pendiente' and revisado_por is null));
create policy pag_admin on public.pagos for update using (es_admin(conjunto_id)) with check (es_admin(conjunto_id));
create policy pag_borrar on public.pagos for delete using (es_admin(conjunto_id));

-- Mantenimiento
create policy plan_ver on public.mant_plan for select using (es_gestion(conjunto_id));
create policy plan_admin on public.mant_plan for all using (es_admin(conjunto_id)) with check (es_admin(conjunto_id));
create policy ot_ver on public.ordenes for select using (es_gestion(conjunto_id) or creado_por = auth.uid());
create policy ot_reportar on public.ordenes for insert with check (es_miembro(conjunto_id));
create policy ot_admin on public.ordenes for update using (es_admin(conjunto_id)) with check (es_admin(conjunto_id));
create policy ot_borrar on public.ordenes for delete using (es_admin(conjunto_id));

-- PQRS
create policy pq_ver on public.pqrs for select using (es_gestion(conjunto_id) or unidad_id = mi_unidad(conjunto_id));
create policy pq_radicar on public.pqrs for insert with check (
  es_admin(conjunto_id) or (unidad_id = mi_unidad(conjunto_id) and estado = 'Abierta' and respuesta is null));
create policy pq_admin on public.pqrs for update using (es_admin(conjunto_id)) with check (es_admin(conjunto_id));

-- Reservas: todos ven la ocupación; el residente reserva y cancela las suyas
create policy res_ver on public.reservas for select using (es_miembro(conjunto_id));
create policy res_crear on public.reservas for insert with check (es_admin(conjunto_id) or unidad_id = mi_unidad(conjunto_id));
create policy res_cambiar on public.reservas for update
  using (es_admin(conjunto_id) or unidad_id = mi_unidad(conjunto_id))
  with check (es_admin(conjunto_id) or (unidad_id = mi_unidad(conjunto_id) and estado = 'Cancelada'));

-- Chat: solo el administrador y la unidad dueña de la conversación
create policy msg_ver on public.mensajes for select using (es_admin(conjunto_id) or unidad_id = mi_unidad(conjunto_id));
create policy msg_enviar on public.mensajes for insert with check (
  (es_admin(conjunto_id) and de_admin) or (unidad_id = mi_unidad(conjunto_id) and not de_admin));

-- Votos: una unidad, un voto, mientras la votación esté abierta
create policy voto_ver on public.votos for select using (es_gestion(conjunto_id) or unidad_id = mi_unidad(conjunto_id));
create policy voto_emitir on public.votos for insert with check (
  unidad_id = mi_unidad(conjunto_id)
  and exists (select 1 from public.votaciones v where v.id = votacion_id and v.abierta and v.conjunto_id = votos.conjunto_id));
create policy voto_cambiar on public.votos for update
  using (unidad_id = mi_unidad(conjunto_id))
  with check (unidad_id = mi_unidad(conjunto_id)
    and exists (select 1 from public.votaciones v where v.id = votacion_id and v.abierta and v.conjunto_id = votos.conjunto_id));

-- =====================================================================
--  Funciones que llama la app
-- =====================================================================

-- Crear un conjunto: quien lo crea queda como administrador
create or replace function public.crear_conjunto(p_nombre text, p_nit text, p_ciudad text, p_presupuesto numeric)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión'; end if;
  insert into conjuntos (nombre, nit, ciudad, presupuesto_mensual)
    values (p_nombre, p_nit, p_ciudad, coalesce(p_presupuesto, 0)) returning id into v_id;
  insert into miembros (conjunto_id, user_id, rol) values (v_id, auth.uid(), 'admin');
  return v_id;
end $$;

-- Al iniciar sesión: convierte las invitaciones de su correo en accesos
create or replace function public.reclamar_invitaciones() returns int
language plpgsql security definer set search_path = public as $$
declare v_email text := lower(coalesce(auth.jwt() ->> 'email', '')); n int;
begin
  if auth.uid() is null or v_email = '' then return 0; end if;
  insert into miembros (conjunto_id, user_id, rol, unidad_id)
    select conjunto_id, auth.uid(), rol, unidad_id from invitaciones
    where lower(email) = v_email and not usada
    on conflict (conjunto_id, user_id, rol) do nothing;
  get diagnostics n = row_count;
  update invitaciones set usada = true where lower(email) = v_email and not usada;
  return n;
end $$;

-- Liquida la cuota del mes para todas las unidades según coeficiente
create or replace function public.generar_cuotas(p_conjunto uuid, p_periodo date, p_vence date)
returns int language plpgsql security definer set search_path = public as $$
declare v_pres numeric; v_coef numeric; v_n int;
begin
  if not es_admin(p_conjunto) then raise exception 'Solo la administración puede liquidar cuotas'; end if;
  select presupuesto_mensual into v_pres from conjuntos where id = p_conjunto;
  if coalesce(v_pres, 0) <= 0 then raise exception 'Primero define el presupuesto mensual en Configuración'; end if;
  select coalesce(sum(coeficiente), 0), count(*) into v_coef, v_n from unidades where conjunto_id = p_conjunto;
  if v_n = 0 then raise exception 'Primero carga las unidades en Configuración'; end if;
  insert into cargos (conjunto_id, unidad_id, periodo, valor, vence)
    select p_conjunto, u.id, date_trunc('month', p_periodo)::date,
      case when v_coef > 0 then round(v_pres * u.coeficiente / v_coef, -2) else round(v_pres / v_n, -2) end,
      p_vence
    from unidades u where u.conjunto_id = p_conjunto
    on conflict (unidad_id, periodo, concepto) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Marca como leídos los mensajes de una conversación
create or replace function public.marcar_leidos(p_conjunto uuid, p_unidad uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if es_admin(p_conjunto) then
    update mensajes set leido = true where conjunto_id = p_conjunto and unidad_id = p_unidad and not de_admin and not leido;
  elsif mi_unidad(p_conjunto) = p_unidad then
    update mensajes set leido = true where conjunto_id = p_conjunto and unidad_id = p_unidad and de_admin and not leido;
  end if;
end $$;

-- Resultados de una votación ponderados por coeficiente
create or replace function public.resultados(p_votacion uuid)
returns table (opcion text, votos bigint, coeficiente numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from votaciones v where v.id = p_votacion and es_miembro(v.conjunto_id)) then return; end if;
  return query
    select vo.opcion, count(*), coalesce(sum(u.coeficiente), 0)
    from votos vo join unidades u on u.id = vo.unidad_id
    where vo.votacion_id = p_votacion group by vo.opcion;
end $$;

-- Tablero consolidado de todos los conjuntos que la persona gestiona
create or replace function public.resumen_portafolio()
returns table (conjunto_id uuid, nombre text, ciudad text, rol text, unidades bigint,
  cargado_mes numeric, recaudado_mes numeric, mora numeric, unidades_mora bigint,
  ordenes_abiertas bigint, ordenes_altas bigint, pqrs_abiertas bigint, chats_sin_leer bigint,
  pagos_por_revisar bigint, mant_vencidos bigint, mant_proximos bigint)
language sql stable security definer set search_path = public as $$
  select c.id, c.nombre, c.ciudad, min(m.rol),
    (select count(*) from unidades u where u.conjunto_id = c.id),
    coalesce((select sum(x.valor) from cargos x where x.conjunto_id = c.id and x.periodo = date_trunc('month', hoy())::date), 0),
    coalesce((select sum(p.valor) from pagos p where p.conjunto_id = c.id and p.estado = 'aprobado' and p.fecha_pago >= date_trunc('month', hoy())::date), 0),
    coalesce((select sum(s.saldo) from v_saldos s where s.conjunto_id = c.id and s.saldo > 0), 0),
    (select count(*) from v_saldos s where s.conjunto_id = c.id and s.saldo > 0),
    (select count(*) from ordenes o where o.conjunto_id = c.id and o.estado <> 'Cerrada'),
    (select count(*) from ordenes o where o.conjunto_id = c.id and o.estado <> 'Cerrada' and o.prioridad = 'Alta'),
    (select count(*) from pqrs q where q.conjunto_id = c.id and q.estado = 'Abierta'),
    (select count(*) from mensajes ms where ms.conjunto_id = c.id and not ms.de_admin and not ms.leido),
    (select count(*) from pagos p where p.conjunto_id = c.id and p.estado = 'pendiente'),
    (select count(*) from mant_plan mp where mp.conjunto_id = c.id and mp.proximo < hoy()),
    (select count(*) from mant_plan mp where mp.conjunto_id = c.id and mp.proximo between hoy() and hoy() + 10)
  from conjuntos c
  join miembros m on m.conjunto_id = c.id and m.user_id = auth.uid() and m.rol in ('admin','consejo')
  group by c.id, c.nombre, c.ciudad
  order by c.nombre $$;

revoke execute on function public.crear_conjunto(text, text, text, numeric) from anon;
revoke execute on function public.reclamar_invitaciones() from anon;
revoke execute on function public.generar_cuotas(uuid, date, date) from anon;
revoke execute on function public.marcar_leidos(uuid, uuid) from anon;
revoke execute on function public.resultados(uuid) from anon;
revoke execute on function public.resumen_portafolio() from anon;

-- =====================================================================
--  Archivos: comprobantes de pago y fotos de daños (privados)
-- =====================================================================
insert into storage.buckets (id, name, public) values ('soportes', 'soportes', false)
  on conflict (id) do nothing;

create policy soportes_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'soportes' and public.es_miembro(((storage.foldername(name))[1])::uuid));
create policy soportes_ver on storage.objects for select to authenticated
  using (bucket_id = 'soportes' and (owner_id = auth.uid()::text or public.es_gestion(((storage.foldername(name))[1])::uuid)));

-- Chat en tiempo real
alter publication supabase_realtime add table public.mensajes;
