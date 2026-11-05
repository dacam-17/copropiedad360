-- =====================================================================
--  SYAPH360 · Migración 02
--  1) Plataforma: dueño, clientes (administradores que pagan), pagos y
--     suscripción. Nadie crea conjuntos sin que el dueño lo autorice.
--  2) Inventario de activos con hoja de vida y documentos con vencimiento.
--  Correr una sola vez, después de 01_esquema.sql.
-- =====================================================================

create or replace function public.mi_email() returns text
language sql stable as $$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;

-- ---------- Dueño de la plataforma ----------
create table public.duenos (email text primary key);
alter table public.duenos enable row level security;   -- sin reglas: solo lo leen las funciones

create or replace function public.es_dueno() returns boolean
language sql stable security definer set search_path = public as $$
  select mi_email() <> '' and exists (select 1 from duenos where email = mi_email()) $$;

create table public.plataforma_config (
  id int primary key default 1 check (id = 1),
  instrucciones_pago text,      -- cuenta bancaria, Nequi, etc.
  contacto text,                -- WhatsApp o correo del dueño
  planes text                   -- texto libre con los precios
);
insert into public.plataforma_config (id) values (1);

-- ---------- Clientes (administradores que contratan) ----------
create table public.cuentas (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email)),
  nombre text,
  empresa text,
  telefono text,
  ciudad text,
  conjuntos_estimados int,
  estado text not null default 'pendiente' check (estado in ('pendiente','activa','suspendida')),
  max_conjuntos int not null default 1 check (max_conjuntos > 0),
  max_unidades int check (max_unidades is null or max_unidades > 0),
  vigente_hasta date,
  notas text,
  created_at timestamptz not null default now()
);

create table public.pagos_plataforma (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references public.cuentas on delete cascade,
  valor numeric(14,0) not null check (valor > 0),
  fecha date not null default public.hoy(),
  medio text,
  meses int not null default 1 check (meses > 0),
  referencia text,
  nota text,
  registrado_por uuid default auth.uid(),
  created_at timestamptz not null default now()
);

alter table public.conjuntos add column cuenta_id uuid references public.cuentas on delete set null;

-- Una suscripción sigue vigente 5 días después de vencer (días de gracia)
create or replace function public.cuenta_vigente(k uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from cuentas where id = k and estado = 'activa'
                 and coalesce(vigente_hasta, hoy()) >= hoy() - 5) $$;

create or replace function public.conjunto_vigente(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select case when cuenta_id is null then true else cuenta_vigente(cuenta_id) end
                   from conjuntos where id = c), true) $$;

-- Si la suscripción del conjunto venció o se suspendió, la administración queda en solo lectura
create or replace function public.es_admin(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from miembros where conjunto_id = c and user_id = auth.uid() and rol = 'admin')
         and conjunto_vigente(c) $$;

alter table public.duenos enable row level security;
alter table public.plataforma_config enable row level security;
alter table public.cuentas enable row level security;
alter table public.pagos_plataforma enable row level security;

create policy cfg_ver on public.plataforma_config for select to authenticated using (true);
create policy cfg_dueno on public.plataforma_config for update using (es_dueno()) with check (es_dueno());
create policy cta_ver on public.cuentas for select using (es_dueno() or email = mi_email());
create policy cta_dueno on public.cuentas for all using (es_dueno()) with check (es_dueno());
create policy pp_ver on public.pagos_plataforma for select
  using (es_dueno() or cuenta_id in (select id from public.cuentas where email = mi_email()));
create policy pp_dueno on public.pagos_plataforma for all using (es_dueno()) with check (es_dueno());

-- Crear conjunto: solo el dueño o un cliente con suscripción activa y cupo en su plan
create or replace function public.crear_conjunto(p_nombre text, p_nit text, p_ciudad text, p_presupuesto numeric)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_cuenta uuid; v_estado text; v_max int; v_n int;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión'; end if;
  if not es_dueno() then
    select id, estado, max_conjuntos into v_cuenta, v_estado, v_max from cuentas where email = mi_email();
    if v_cuenta is null then raise exception 'Tu cuenta de administrador aún no está autorizada. Envía la solicitud de acceso.'; end if;
    if v_estado <> 'activa' or not cuenta_vigente(v_cuenta) then
      raise exception 'Tu suscripción no está activa. Cuando confirmemos tu pago podrás crear conjuntos.'; end if;
    select count(*) into v_n from conjuntos where cuenta_id = v_cuenta;
    if v_n >= v_max then raise exception 'Tu plan incluye % conjunto(s). Escríbenos para ampliarlo.', v_max; end if;
  end if;
  insert into conjuntos (nombre, nit, ciudad, presupuesto_mensual, cuenta_id)
    values (p_nombre, p_nit, p_ciudad, coalesce(p_presupuesto, 0), v_cuenta) returning id into v_id;
  insert into miembros (conjunto_id, user_id, rol) values (v_id, auth.uid(), 'admin');
  return v_id;
end $$;

-- Límite de unidades del plan (no cuenta las que ya existen y solo se actualizan)
create or replace function public.limite_unidades() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_k uuid; v_max int; v_n int;
begin
  if exists (select 1 from unidades where conjunto_id = new.conjunto_id and codigo = new.codigo) then return new; end if;
  select cuenta_id into v_k from conjuntos where id = new.conjunto_id;
  if v_k is null then return new; end if;
  select max_unidades into v_max from cuentas where id = v_k;
  if v_max is null then return new; end if;
  select count(*) into v_n from unidades u join conjuntos c on c.id = u.conjunto_id where c.cuenta_id = v_k;
  if v_n >= v_max then raise exception 'Tu plan incluye % unidades en total. Escríbenos para ampliarlo.', v_max; end if;
  return new;
end $$;
create trigger unidades_limite before insert on public.unidades
  for each row execute function public.limite_unidades();

-- El administrador nuevo pide acceso; queda pendiente hasta que el dueño registre el pago
create or replace function public.solicitar_acceso(p_nombre text, p_empresa text, p_telefono text, p_ciudad text, p_conjuntos int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if mi_email() = '' then raise exception 'Debes iniciar sesión'; end if;
  insert into cuentas (email, nombre, empresa, telefono, ciudad, conjuntos_estimados)
    values (mi_email(), p_nombre, p_empresa, p_telefono, p_ciudad, p_conjuntos)
  on conflict (email) do update set nombre = excluded.nombre, empresa = excluded.empresa,
    telefono = excluded.telefono, ciudad = excluded.ciudad, conjuntos_estimados = excluded.conjuntos_estimados
    where cuentas.estado = 'pendiente';
end $$;

create or replace function public.mi_cuenta() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'dueno', es_dueno(),
    'cuenta', (select row_to_json(x) from (
        select k.*, cuenta_vigente(k.id) as vigente,
               (select count(*) from conjuntos c where c.cuenta_id = k.id) as conjuntos_usados
        from cuentas k where k.email = mi_email()) x),
    'config', (select row_to_json(p) from plataforma_config p where id = 1)) $$;

-- El dueño registra un pago recibido: activa la cuenta y extiende la vigencia
create or replace function public.registrar_pago_plataforma(p_cuenta uuid, p_valor numeric, p_fecha date,
  p_medio text, p_meses int, p_referencia text, p_nota text)
returns date language plpgsql security definer set search_path = public as $$
declare v_hasta date;
begin
  if not es_dueno() then raise exception 'Solo el dueño de la plataforma puede registrar pagos'; end if;
  insert into pagos_plataforma (cuenta_id, valor, fecha, medio, meses, referencia, nota)
    values (p_cuenta, p_valor, coalesce(p_fecha, hoy()), p_medio, p_meses, p_referencia, p_nota);
  update cuentas set estado = 'activa',
    vigente_hasta = (greatest(coalesce(vigente_hasta, hoy()), hoy()) + make_interval(months => p_meses))::date
    where id = p_cuenta returning vigente_hasta into v_hasta;
  return v_hasta;
end $$;

create or replace function public.resumen_plataforma()
returns table (id uuid, email text, nombre text, empresa text, telefono text, ciudad text, estado text,
  max_conjuntos int, max_unidades int, vigente_hasta date, vigente boolean, conjuntos bigint, unidades bigint,
  ultimo_ingreso timestamptz, total_pagado numeric, ultimo_pago date, conjuntos_estimados int, notas text, created_at timestamptz)
language sql stable security definer set search_path = public, auth as $$
  select k.id, k.email, k.nombre, k.empresa, k.telefono, k.ciudad, k.estado, k.max_conjuntos, k.max_unidades,
    k.vigente_hasta, cuenta_vigente(k.id),
    (select count(*) from public.conjuntos c where c.cuenta_id = k.id),
    (select count(*) from public.unidades u join public.conjuntos c on c.id = u.conjunto_id where c.cuenta_id = k.id),
    (select max(au.last_sign_in_at) from auth.users au where lower(au.email) = k.email),
    coalesce((select sum(p.valor) from public.pagos_plataforma p where p.cuenta_id = k.id), 0),
    (select max(p.fecha) from public.pagos_plataforma p where p.cuenta_id = k.id),
    k.conjuntos_estimados, k.notas, k.created_at
  from public.cuentas k where public.es_dueno()
  order by case k.estado when 'pendiente' then 0 when 'activa' then 1 else 2 end, k.vigente_hasta nulls first $$;

-- =====================================================================
--  Inventario de activos y documentos
-- =====================================================================
create table public.activos (
  id uuid primary key default gen_random_uuid(),
  conjunto_id uuid not null references public.conjuntos on delete cascade,
  codigo text not null,
  nombre text not null,
  categoria text not null default 'Equipo' check (categoria in ('Equipo','Mobiliario','Herramienta','Tecnología','Otro')),
  ubicacion text,
  marca text,
  modelo text,
  serial text,
  fecha_instalacion date,
  valor numeric(14,0),
  proveedor text,
  garantia_hasta date,
  estado text not null default 'Bueno' check (estado in ('Bueno','Regular','Malo','Fuera de servicio')),
  foto text,
  notas text,
  created_at timestamptz not null default now(),
  unique (conjunto_id, codigo)
);

create table public.documentos (
  id uuid primary key default gen_random_uuid(),
  conjunto_id uuid not null references public.conjuntos on delete cascade,
  activo_id uuid references public.activos on delete set null,
  titulo text not null,
  tipo text not null default 'Otro' check (tipo in ('Reglamento','Acta','Póliza','Certificado','Contrato','Manual','Factura','Otro')),
  archivo text,
  vence date,
  publico boolean not null default false,     -- visible para los residentes
  created_at timestamptz not null default now()
);

alter table public.mant_plan add column activo_id uuid references public.activos on delete set null;
alter table public.ordenes add column activo_id uuid references public.activos on delete set null;

alter table public.activos enable row level security;
alter table public.documentos enable row level security;
create policy act_ver on public.activos for select using (es_gestion(conjunto_id));
create policy act_admin on public.activos for all using (es_admin(conjunto_id)) with check (es_admin(conjunto_id));
create policy doc_ver on public.documentos for select using (es_gestion(conjunto_id) or (publico and es_miembro(conjunto_id)));
create policy doc_admin on public.documentos for all using (es_admin(conjunto_id)) with check (es_admin(conjunto_id));

create policy soportes_docs_publicos on storage.objects for select to authenticated
  using (bucket_id = 'soportes' and exists (
    select 1 from public.documentos d where d.archivo = name and d.publico and public.es_miembro(d.conjunto_id)));

-- Lo mínimo de un activo para quien escanea su QR (residente que reporta un daño)
create or replace function public.activo_basico(p_id uuid) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('id', a.id, 'codigo', a.codigo, 'nombre', a.nombre, 'ubicacion', a.ubicacion, 'conjunto_id', a.conjunto_id)
  from activos a where a.id = p_id and es_miembro(a.conjunto_id) $$;

-- Tablero consolidado con suscripción y alertas de inventario
drop function public.resumen_portafolio();
create or replace function public.resumen_portafolio()
returns table (conjunto_id uuid, nombre text, ciudad text, rol text, unidades bigint,
  cargado_mes numeric, recaudado_mes numeric, mora numeric, unidades_mora bigint,
  ordenes_abiertas bigint, ordenes_altas bigint, pqrs_abiertas bigint, chats_sin_leer bigint,
  pagos_por_revisar bigint, mant_vencidos bigint, mant_proximos bigint,
  docs_por_vencer bigint, garantias_por_vencer bigint, activos_malos bigint, vigente boolean, vigente_hasta date)
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
    (select count(*) from mant_plan mp where mp.conjunto_id = c.id and mp.proximo between hoy() and hoy() + 10),
    (select count(*) from documentos d where d.conjunto_id = c.id and d.vence is not null and d.vence <= hoy() + 30),
    (select count(*) from activos a where a.conjunto_id = c.id and a.garantia_hasta between hoy() and hoy() + 30),
    (select count(*) from activos a where a.conjunto_id = c.id and a.estado in ('Malo','Fuera de servicio')),
    conjunto_vigente(c.id),
    (select k.vigente_hasta from cuentas k where k.id = c.cuenta_id)
  from conjuntos c
  join miembros m on m.conjunto_id = c.id and m.user_id = auth.uid() and m.rol in ('admin','consejo')
  group by c.id, c.nombre, c.ciudad
  order by c.nombre $$;

revoke execute on function public.resumen_portafolio() from anon;
revoke execute on function public.solicitar_acceso(text, text, text, text, int) from anon;
revoke execute on function public.mi_cuenta() from anon;
revoke execute on function public.registrar_pago_plataforma(uuid, numeric, date, text, int, text, text) from anon;
revoke execute on function public.resumen_plataforma() from anon;
revoke execute on function public.activo_basico(uuid) from anon;

-- =====================================================================
--  Último paso: registrar el correo del dueño de la plataforma.
--  Cambia el correo por el tuyo antes de correrlo (va en minúsculas).
-- =====================================================================
-- insert into public.duenos (email) values ('tu-correo@ejemplo.com');
