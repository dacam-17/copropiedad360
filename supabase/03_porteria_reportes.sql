-- =====================================================================
--  SYAPH360 · Migración 03
--  Portería (visitas con autorización, paquetes, minuta), reportes de
--  residentes con fotos, fotos en el chat y notificaciones automáticas.
--  Correr una sola vez, después de 01 y 02.
-- =====================================================================

-- ---------- Nuevo rol: portería ----------
alter table public.miembros drop constraint miembros_rol_check;
alter table public.miembros add constraint miembros_rol_check check (rol in ('admin','consejo','residente','porteria'));
alter table public.invitaciones drop constraint invitaciones_rol_check;
alter table public.invitaciones add constraint invitaciones_rol_check check (rol in ('admin','consejo','residente','porteria'));

create or replace function public.es_porteria(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from miembros where conjunto_id = c and user_id = auth.uid() and rol = 'porteria')
         and conjunto_vigente(c) $$;

create or replace function public.es_operacion(c uuid) returns boolean   -- administración o portería
language sql stable security definer set search_path = public as $$
  select es_admin(c) or es_porteria(c) $$;

create policy uni_porteria on public.unidades for select using (es_porteria(conjunto_id));
create policy zonas_porteria on public.reservas for select using (es_porteria(conjunto_id));

-- ---------- Reportes de situaciones con fotos ----------
create table public.reportes (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity,
  conjunto_id uuid not null references public.conjuntos on delete cascade,
  unidad_id uuid references public.unidades on delete set null,
  autor uuid default auth.uid(),
  origen text not null default 'Residente' check (origen in ('Residente','Portería','Administración')),
  categoria text not null default 'Otro' check (categoria in ('Daño','Seguridad','Aseo','Convivencia','Mascotas','Parqueadero','Otro')),
  titulo text not null,
  descripcion text,
  ubicacion text,
  urgente boolean not null default false,
  fotos text[] not null default '{}' check (cardinality(fotos) <= 4),
  estado text not null default 'Nuevo' check (estado in ('Nuevo','En revisión','Resuelto')),
  respuesta text,
  orden_id uuid references public.ordenes on delete set null,
  created_at timestamptz not null default now(),
  resuelto_at timestamptz
);
alter table public.reportes enable row level security;
create policy rep_ver on public.reportes for select using (es_gestion(conjunto_id) or es_porteria(conjunto_id) or autor = auth.uid());
create policy rep_crear on public.reportes for insert with check (
  es_miembro(conjunto_id) and autor = auth.uid() and estado = 'Nuevo' and respuesta is null and orden_id is null
  and (unidad_id is null or unidad_id = mi_unidad(conjunto_id) or es_operacion(conjunto_id)));
create policy rep_admin on public.reportes for update using (es_admin(conjunto_id)) with check (es_admin(conjunto_id));

-- ---------- Portería: visitas, paquetes y minuta ----------
create table public.visitas (
  id uuid primary key default gen_random_uuid(),
  conjunto_id uuid not null references public.conjuntos on delete cascade,
  unidad_id uuid not null references public.unidades on delete cascade,
  nombre text not null,
  tipo text not null default 'Visita' check (tipo in ('Visita','Domicilio','Servicio','Proveedor')),
  placa text,
  nota text,
  fecha_esperada date,
  estado text not null default 'Esperando' check (estado in ('Preautorizada','Esperando','Autorizada','Rechazada','Ingresó','Salió')),
  creado_por uuid default auth.uid(),
  respondido_por uuid,
  entrada_at timestamptz,
  salida_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.visitas enable row level security;
create policy vis_ver on public.visitas for select using (es_operacion(conjunto_id) or es_gestion(conjunto_id) or unidad_id = mi_unidad(conjunto_id));
create policy vis_crear on public.visitas for insert with check (
  es_operacion(conjunto_id) or (unidad_id = mi_unidad(conjunto_id) and estado = 'Preautorizada'));
create policy vis_operar on public.visitas for update using (es_operacion(conjunto_id)) with check (es_operacion(conjunto_id));
create policy vis_cancelar on public.visitas for delete using (es_operacion(conjunto_id) or (unidad_id = mi_unidad(conjunto_id) and estado = 'Preautorizada'));

-- El residente responde a una visita que está esperando en portería
create or replace function public.responder_visita(p_id uuid, p_autoriza boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v visitas%rowtype;
begin
  select * into v from visitas where id = p_id;
  if v.id is null or v.unidad_id is distinct from mi_unidad(v.conjunto_id) then raise exception 'Esta visita no es para tu unidad'; end if;
  if v.estado <> 'Esperando' then raise exception 'Esta visita ya fue atendida'; end if;
  update visitas set estado = case when p_autoriza then 'Autorizada' else 'Rechazada' end, respondido_por = auth.uid() where id = p_id;
end $$;

create table public.paquetes (
  id uuid primary key default gen_random_uuid(),
  conjunto_id uuid not null references public.conjuntos on delete cascade,
  unidad_id uuid not null references public.unidades on delete cascade,
  descripcion text not null,
  empresa text,
  foto text,
  estado text not null default 'En portería' check (estado in ('En portería','Entregado')),
  entregado_a text,
  registrado_por uuid default auth.uid(),
  recibido_at timestamptz not null default now(),
  entregado_at timestamptz
);
alter table public.paquetes enable row level security;
create policy paq_ver on public.paquetes for select using (es_operacion(conjunto_id) or es_gestion(conjunto_id) or unidad_id = mi_unidad(conjunto_id));
create policy paq_operar on public.paquetes for all using (es_operacion(conjunto_id)) with check (es_operacion(conjunto_id));

create table public.minuta (
  id uuid primary key default gen_random_uuid(),
  conjunto_id uuid not null references public.conjuntos on delete cascade,
  tipo text not null default 'Novedad' check (tipo in ('Ronda','Novedad','Incidente','Entrega de turno')),
  descripcion text not null,
  foto text,
  urgente boolean not null default false,
  autor uuid default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.minuta enable row level security;
create policy min_ver on public.minuta for select using (es_gestion(conjunto_id) or es_porteria(conjunto_id));
create policy min_crear on public.minuta for insert with check (es_operacion(conjunto_id) and autor = auth.uid());

-- ---------- Fotos en el chat ----------
alter table public.mensajes add column foto text;

-- ---------- Notificaciones ----------
create table public.notificaciones (
  id uuid primary key default gen_random_uuid(),
  conjunto_id uuid not null references public.conjuntos on delete cascade,
  unidad_id uuid references public.unidades on delete cascade,   -- para los residentes de esa unidad
  user_id uuid references auth.users on delete cascade,          -- para una persona
  para_admin boolean not null default false,
  para_porteria boolean not null default false,
  para_todos boolean not null default false,
  titulo text not null,
  cuerpo text,
  tipo text,
  vista text,                                                     -- pantalla de la app a la que lleva
  created_at timestamptz not null default now()
);
create index notificaciones_conjunto on public.notificaciones (conjunto_id, created_at desc);
alter table public.notificaciones enable row level security;
create policy not_ver on public.notificaciones for select using (
  user_id = auth.uid()
  or (unidad_id is not null and unidad_id = mi_unidad(conjunto_id))
  or (para_admin and es_admin(conjunto_id))
  or (para_porteria and es_porteria(conjunto_id))
  or (para_todos and es_miembro(conjunto_id)));

create table public.notif_visto (
  user_id uuid not null references auth.users on delete cascade,
  conjunto_id uuid not null references public.conjuntos on delete cascade,
  visto_at timestamptz not null default now(),
  primary key (user_id, conjunto_id)
);
alter table public.notif_visto enable row level security;
create policy nv_propio on public.notif_visto for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.marcar_notif_vistas(p_conjunto uuid) returns void
language sql security definer set search_path = public as $$
  insert into notif_visto (user_id, conjunto_id, visto_at) values (auth.uid(), p_conjunto, now())
  on conflict (user_id, conjunto_id) do update set visto_at = now() $$;

create or replace function public.notif_sin_ver(p_conjunto uuid) returns bigint
language sql stable security invoker set search_path = public as $$
  select count(*) from notificaciones n
  where n.conjunto_id = p_conjunto
    and n.created_at > coalesce((select visto_at from notif_visto where user_id = auth.uid() and conjunto_id = p_conjunto), '-infinity')
    and coalesce(n.user_id, auth.uid()) = auth.uid() $$;

-- Solo las reglas automáticas crean notificaciones (nadie puede llamarla desde la app)
create or replace function public.notificar(c uuid, p_unidad uuid, p_user uuid, p_admin boolean, p_porteria boolean,
  p_todos boolean, p_titulo text, p_cuerpo text, p_tipo text, p_vista text) returns void
language sql security definer set search_path = public as $$
  insert into notificaciones (conjunto_id, unidad_id, user_id, para_admin, para_porteria, para_todos, titulo, cuerpo, tipo, vista)
  values (c, p_unidad, p_user, p_admin, p_porteria, p_todos, p_titulo, p_cuerpo, p_tipo, p_vista) $$;
revoke execute on function public.notificar(uuid, uuid, uuid, boolean, boolean, boolean, text, text, text, text) from public, anon, authenticated;

create or replace function public.cod_unidad(u uuid) returns text
language sql stable security definer set search_path = public as $$ select codigo from unidades where id = u $$;

create or replace function public.tg_paquete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform notificar(new.conjunto_id, new.unidad_id, null, false, false, false, 'Llegó un paquete para ti',
    new.descripcion || coalesce(' · ' || new.empresa, '') || '. Recógelo en portería.', 'paquete', 'mispaquetes');
  return new;
end $$;
create trigger paquetes_aviso after insert on public.paquetes for each row execute function public.tg_paquete();

create or replace function public.tg_visita() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.estado = 'Esperando' then
    perform notificar(new.conjunto_id, new.unidad_id, null, false, false, false, 'Tienes una visita en portería',
      new.nombre || ' (' || new.tipo || ') te está buscando. ¿Lo autorizas?', 'visita', 'misvisitas');
  elsif tg_op = 'INSERT' and new.estado = 'Preautorizada' then
    perform notificar(new.conjunto_id, null, null, false, true, false, 'Visita preautorizada',
      new.nombre || ' para ' || cod_unidad(new.unidad_id) || coalesce(' el ' || to_char(new.fecha_esperada, 'DD/MM'), ''), 'visita', 'visitas');
  elsif tg_op = 'UPDATE' and new.estado is distinct from old.estado then
    if new.estado in ('Autorizada','Rechazada') then
      perform notificar(new.conjunto_id, null, null, false, true, false,
        cod_unidad(new.unidad_id) || case when new.estado = 'Autorizada' then ' autorizó' else ' rechazó' end || ' la visita',
        new.nombre, 'visita', 'visitas');
    elsif new.estado = 'Ingresó' then
      perform notificar(new.conjunto_id, new.unidad_id, null, false, false, false, 'Tu visita ingresó', new.nombre || ' ya entró al conjunto.', 'visita', 'misvisitas');
    end if;
  end if;
  return new;
end $$;
create trigger visitas_aviso after insert or update on public.visitas for each row execute function public.tg_visita();

create or replace function public.tg_reporte() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform notificar(new.conjunto_id, null, null, true, (new.categoria = 'Seguridad' or new.urgente), false,
      case when new.urgente then 'URGENTE: ' else 'Nuevo reporte: ' end || new.titulo,
      new.categoria || coalesce(' · ' || new.ubicacion, '') || coalesce(' · ' || cod_unidad(new.unidad_id), ''), 'reporte', 'reportes');
  elsif new.estado is distinct from old.estado or new.respuesta is distinct from old.respuesta then
    perform notificar(new.conjunto_id, null, new.autor, false, false, false,
      'Tu reporte #' || new.numero || ': ' || new.estado, coalesce(new.respuesta, new.titulo), 'reporte', 'misreportes');
  end if;
  return new;
end $$;
create trigger reportes_aviso after insert or update on public.reportes for each row execute function public.tg_reporte();

create or replace function public.tg_minuta() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.urgente or new.tipo = 'Incidente' then
    perform notificar(new.conjunto_id, null, null, true, false, false, 'Portería: ' || new.tipo || case when new.urgente then ' urgente' else '' end,
      left(new.descripcion, 200), 'minuta', 'minuta');
  end if;
  return new;
end $$;
create trigger minuta_aviso after insert on public.minuta for each row execute function public.tg_minuta();

create or replace function public.tg_circular() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform notificar(new.conjunto_id, null, null, false, false, true, 'Nueva circular: ' || new.titulo, left(new.cuerpo, 200), 'circular', 'info');
  return new;
end $$;
create trigger circulares_aviso after insert on public.circulares for each row execute function public.tg_circular();

-- ---------- Archivos: quién ve cada foto ----------
drop policy soportes_ver on storage.objects;
create policy soportes_ver on storage.objects for select to authenticated using (
  bucket_id = 'soportes' and (
    owner_id = auth.uid()::text
    or public.es_gestion(((storage.foldername(name))[1])::uuid)
    or public.es_porteria(((storage.foldername(name))[1])::uuid)
    or exists (select 1 from public.paquetes p where p.foto = name and p.unidad_id = public.mi_unidad(p.conjunto_id))
    or exists (select 1 from public.mensajes m where m.foto = name and m.unidad_id = public.mi_unidad(m.conjunto_id))));

-- ---------- Tablero consolidado con reportes ----------
drop function public.resumen_portafolio();
create or replace function public.resumen_portafolio()
returns table (conjunto_id uuid, nombre text, ciudad text, rol text, unidades bigint,
  cargado_mes numeric, recaudado_mes numeric, mora numeric, unidades_mora bigint,
  ordenes_abiertas bigint, ordenes_altas bigint, pqrs_abiertas bigint, chats_sin_leer bigint,
  pagos_por_revisar bigint, mant_vencidos bigint, mant_proximos bigint,
  docs_por_vencer bigint, garantias_por_vencer bigint, activos_malos bigint, vigente boolean, vigente_hasta date,
  reportes_nuevos bigint, reportes_urgentes bigint)
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
    (select k.vigente_hasta from cuentas k where k.id = c.cuenta_id),
    (select count(*) from reportes r where r.conjunto_id = c.id and r.estado = 'Nuevo'),
    (select count(*) from reportes r where r.conjunto_id = c.id and r.estado <> 'Resuelto' and r.urgente)
  from conjuntos c
  join miembros m on m.conjunto_id = c.id and m.user_id = auth.uid() and m.rol in ('admin','consejo')
  group by c.id, c.nombre, c.ciudad
  order by c.nombre $$;
revoke execute on function public.resumen_portafolio() from anon;
revoke execute on function public.responder_visita(uuid, boolean) from anon;
revoke execute on function public.marcar_notif_vistas(uuid) from anon;
revoke execute on function public.notif_sin_ver(uuid) from anon;

-- ---------- Tiempo real ----------
alter publication supabase_realtime add table public.notificaciones;
alter publication supabase_realtime add table public.visitas;
alter publication supabase_realtime add table public.paquetes;
alter publication supabase_realtime add table public.reportes;
