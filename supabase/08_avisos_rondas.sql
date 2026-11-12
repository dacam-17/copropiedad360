-- =====================================================================
--  SYAPH360 · Migración 08 · Constancia de avisos en las rondas
--  Cada registro guarda a cuántos apartamentos se les avisó, para que la
--  administración y el operario sepan que el residente fue notificado.
--  Correr una sola vez, después de 01 a 07.
-- =====================================================================

alter table public.rutina_registros add column avisados int;

create or replace function public.marcar_rutina(p_rutina uuid, p_token text, p_foto text, p_nota text) returns json
language plpgsql security definer set search_path = public, auth as $$
declare r rutinas%rowtype; p puntos%rowtype; v_via text; v_quien text; v_reg rutina_registros%rowtype; u record; v_n int := 0;
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
      v_n := v_n + 1;
    end loop;
  end if;
  update rutina_registros set avisados = v_n where id = v_reg.id;
  return json_build_object('id', v_reg.id, 'hecho_at', v_reg.hecho_at, 'via', v_via, 'avisados', v_n, 'notificar', r.notificar);
end $$;
