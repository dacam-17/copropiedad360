-- =====================================================================
--  SYAPH360 · Migración 07 · Identidad del conjunto y datos de cobro
--  Logo, contacto, representante legal, revisor fiscal, auxiliar
--  administrativo, datos bancarios para las cuentas de cobro, y tipo de
--  inmueble y datos del propietario para la carga masiva de unidades.
--  Correr una sola vez, después de 01 a 06.
-- =====================================================================

alter table public.conjuntos
  add column logo text,
  add column telefono text,
  add column email text,
  add column rep_legal text,
  add column rep_legal_doc text,
  add column revisor_fiscal text,
  add column revisor_tp text,
  add column revisor_email text,
  add column auxiliar text,
  add column auxiliar_telefono text,
  add column auxiliar_email text,
  add column banco text,
  add column tipo_cuenta text,
  add column numero_cuenta text,
  add column titular_cuenta text,
  add column convenio text,
  add column referencia_formato text not null default '{codigo}',
  add column nota_cobro text;

-- Unidades: tipo de inmueble, datos del propietario y referencia de pago propia
-- (si no tiene referencia propia, se arma con el formato del conjunto)
alter table public.unidades
  add column referencia text,
  add column tipo text not null default 'Apartamento'
    check (tipo in ('Apartamento','Casa','Local','Oficina','Consultorio','Parqueadero','Depósito','Bodega','Lote','Otro')),
  add column doc_propietario text,
  add column nombres text,
  add column apellidos text,
  add column telefono text;
create index unidades_doc on public.unidades (conjunto_id, doc_propietario);

-- Todos los miembros del conjunto ven su logo
create policy soportes_logo on storage.objects for select to authenticated using (
  bucket_id = 'soportes' and exists (select 1 from public.conjuntos c where c.logo = name and public.es_miembro(c.id)));
