/* =====================================================================
   SYAPH360 · Programa de mantenimiento y control operativo
   Agenda, ficha de ejecución (llegada, ingreso, antes, durante,
   liberación), áreas, proveedores, cuadro de mando, rol proveedor y NFC.
   Depende de app.js, modulos.js y porteria.js.
   ===================================================================== */

Object.assign(ICONS, {
  agenda: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M7 14h3M7 17h6"/>',
  areas: '<path d="M3 21V9l9-6 9 6v12"/><path d="M9 21v-6h6v6M3 13h18"/>',
  proveedor: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6 1.7 0 3.2.7 4.3 1.8"/><path d="M15 14l2 2 4-4"/>',
  tablero: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
  nfc: '<path d="M6 8a8 8 0 010 8M10 6a12 12 0 010 12M14 4a16 16 0 010 16"/>',
  pagenda: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M7 14h3M7 17h6"/>',
  miproveedor: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6 1.7 0 3.2.7 4.3 1.8"/><path d="M15 14l2 2 4-4"/>',
  notificaciones: '<path d="M6 16V11a6 6 0 0112 0v5l2 2H4z"/><path d="M10 20a2 2 0 004 0"/>'
});
TABS.proveedor = [['pagenda', 'Mis trabajos'], ['miproveedor', 'Mi empresa'], ['notificaciones', 'Avisos']];
VISTAS_VIVAS.push('agenda', 'ejec', 'pagenda', 'mant');

const PV = () => ROL() === 'proveedor';
const chipEj = { 'Programado': 'info', 'En portería': 'warn', 'Ingreso aprobado': 'warn', 'En curso': 'info', 'Liberado': 'ok', 'No realizado': 'bad', 'Cancelado': '' };
const PENDIENTES = ['Programado', 'En portería', 'Ingreso aprobado', 'En curso'];
const TIPOS_PDOC = ['Seguridad social (PILA)', 'ARL', 'Trabajo en alturas', 'RUT', 'Cámara de comercio', 'Póliza de responsabilidad civil', 'Control operativo', 'Otro'];
const anioActual = () => Number(HOY().slice(0, 4));

/* ---------- datos de apoyo ---------- */
S.areas = [];
async function cargarAreas() { if (!S.ctx) return; const r = await sb.from('areas').select('*').eq('conjunto_id', C()).order('orden').order('nombre'); S.areas = r.data || []; }
const _setCtx3 = setCtx;
setCtx = function (ctx) { _setCtx3(ctx); if (ctx && ctx.rol !== 'residente') cargarAreas(); };
const pilaVigente = (docs, pid) => docs.filter(d => d.proveedor_id === pid && d.tipo === 'Seguridad social (PILA)' && d.vence && d.vence >= HOY()).sort((a, b) => b.vence.localeCompare(a.vence))[0];
const chipPila = (docs, pid) => { if (!pid) return '<span class="chip info">Personal interno</span>'; const p = pilaVigente(docs, pid); return p ? `<span class="chip ok">Seg. social al día hasta ${fecha(p.vence)}</span>` : '<span class="chip bad">Seguridad social vencida o sin cargar</span>'; };

/* ---------- módulo de mantenimiento: navegación interna ---------- */
const _mantViejo = V.mant;
const SECC_MANT = [['agenda', 'Agenda'], ['areas', 'Por área'], ['plan', 'Plan'], ['danos', 'Daños'], ['proveedores', 'Proveedores'], ['tablero', 'Cuadro de mando']];
V.mant = async () => {
  const t = S.sub.t || 'agenda';
  const chips = `<div class="qr tabsmant">${SECC_MANT.map(([k, l]) => `<button class="btn sm ${t === k ? '' : 'ghost'}" data-act="sub" data-k="t" data-v="${k}">${l}</button>`).join('')}</div>`;
  let body;
  if (t === 'plan' || t === 'danos') {
    const guard = S.sub.t; S.sub.t = t === 'plan' ? 'preventivo' : 'correctivo';
    let h = await _mantViejo(); S.sub.t = guard;
    h = h.replace('<h2>Mantenimientos</h2>', '');
    const i = h.indexOf('<div class="seg"'); if (i >= 0) { const j = h.indexOf('</div>', i); h = h.slice(0, i) + h.slice(j + 6); }
    body = h;
  } else body = await (V['m_' + t] || V.m_agenda)();
  return `<div class="stack"><h2>Mantenimiento</h2>${chips}${body}</div>`;
};

/* ---------- agenda ---------- */
const filaEjec = e => { const atras = e.fecha_programada < HOY() && PENDIENTES.includes(e.estado); return `<button class="item chatrow" data-act="abrirEjec" data-id="${e.id}">
  <div class="ico datebox ${atras ? 'atras' : ''}"><b>${pd(e.fecha_programada).getDate()}</b><span>${pd(e.fecha_programada).toLocaleDateString('es-CO', { month: 'short' }).replace('.', '')}</span></div>
  <div class="grow"><div class="row"><h3>${esc(e.titulo)}</h3><span class="chip ${atras ? 'bad' : chipEj[e.estado]}">${atras ? 'Atrasado' : e.estado}</span></div>
  <div class="sub">${esc((e.activos || {}).nombre || 'Sin equipo')}${(e.proveedores || {}).nombre ? ' · ' + esc(e.proveedores.nombre) : ''}${e.hora ? ' · ' + esc(e.hora) : ''} · ${esc(e.tipo)}</div></div></button>`; };

V.m_agenda = async () => {
  const [ej, acts, provs] = await Promise.all([
    q(sb.from('ejecuciones').select('*, activos(nombre, codigo), proveedores(nombre)').eq('conjunto_id', C()).gte('fecha_programada', addDays(HOY(), -30)).lte('fecha_programada', addDays(HOY(), 90)).order('fecha_programada').order('hora')),
    W() ? q(sb.from('activos').select('id, codigo, nombre').eq('conjunto_id', C()).order('codigo')) : Promise.resolve([]),
    W() ? q(sb.from('proveedores').select('id, nombre').eq('conjunto_id', C()).eq('activo', true).order('nombre')) : Promise.resolve([])
  ]);
  const hoy = HOY(), sem = addDays(hoy, 7);
  const atr = ej.filter(e => e.fecha_programada < hoy && PENDIENTES.includes(e.estado));
  const deHoy = ej.filter(e => e.fecha_programada === hoy && e.estado !== 'Cancelado');
  const semana = ej.filter(e => e.fecha_programada > hoy && e.fecha_programada <= sem && e.estado !== 'Cancelado');
  const despues = ej.filter(e => e.fecha_programada > sem && e.estado !== 'Cancelado');
  const hechos = ej.filter(e => e.fecha_programada < hoy && !PENDIENTES.includes(e.estado)).reverse().slice(0, 10);
  const grupo = (t, l, vacio) => `<div class="card"><h2>${t}${l.length ? ` <span class="sub">(${l.length})</span>` : ''}</h2><div class="list" style="margin-top:6px">${l.map(filaEjec).join('') || `<div class="sub" style="padding-top:6px">${vacio}</div>`}</div></div>`;
  return `${W() ? `<div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn sm" data-act="generarAgenda">Generar agenda desde el plan (3 meses)</button></div>
  <details class="card"><summary><b>+ Programar un mantenimiento</b></summary><form class="form mt" data-form="programar">
    <div><label>Qué se va a hacer</label><input name="titulo" required placeholder="Ej. Lavado de tanques"></div>
    <div class="two"><div><label>Equipo</label><select name="activo"><option value="">Sin equipo específico</option>${acts.map(a => `<option value="${a.id}">${esc(a.codigo)} · ${esc(a.nombre)}</option>`).join('')}</select></div>
    <div><label>Proveedor</label><select name="proveedor"><option value="">Personal interno</option>${provs.map(p => `<option value="${p.id}">${esc(p.nombre)}</option>`).join('')}</select></div></div>
    <div class="two"><div><label>Fecha</label><input name="fecha" type="date" value="${HOY()}" required></div><div><label>Hora</label><input name="hora" type="time"></div></div>
    <div class="two"><div><label>Tipo</label><select name="tipo"><option>Preventivo</option><option>Predictivo</option><option>Correctivo</option></select></div><div><label>Costo estimado</label><input name="costo" type="number" min="0" step="1000"></div></div>
    <button class="btn" type="submit">Programar</button></form></details>` : ''}
  ${atr.length ? grupo('Atrasados', atr, '') : ''}
  ${grupo('Hoy', deHoy, 'No hay mantenimientos programados para hoy.')}
  ${grupo('Próximos 7 días', semana, 'Nada programado esta semana.')}
  ${grupo('Más adelante', despues, W() ? 'Genera la agenda desde el plan para ver lo que viene.' : 'Nada programado.')}
  ${hechos.length ? grupo('Recientes', hechos, '') : ''}`;
};

/* ---------- ficha de una ejecución ---------- */
const pasoHTML = (ok, titulo, detalle) => `<div class="paso ${ok ? 'hecho' : ''}"><span class="punto">${ok ? '✓' : ''}</span><div><b>${titulo}</b>${detalle ? `<div class="sub">${detalle}</div>` : ''}</div></div>`;
V.ejec = async () => {
  const e = await q(sb.from('ejecuciones').select('*, activos(id, nombre, codigo, ubicacion, estado), proveedores(id, nombre, telefono, especialidad)').eq('id', S.sub.id).maybeSingle());
  if (!e) return '<div class="card">No encontramos este mantenimiento o no tienes acceso.</div>';
  const docs = e.proveedor_id ? await q(sb.from('proveedor_docs').select('*').eq('proveedor_id', e.proveedor_id).order('created_at', { ascending: false })) : [];
  const ctrl = docs.filter(d => d.ejecucion_id === e.id);
  const hab = !e.proveedor_id || !!pilaVigente(docs, e.proveedor_id);
  const puedeTrabajar = W() || (PV() && e.proveedor_id === S.ctx.proveedor_id);
  const puedePorteria = OP();
  const pend = PENDIENTES.includes(e.estado);
  const a = e.activos || {}, p = e.proveedores || {};
  const subirFotos = (campo, titulo) => `<form class="form" data-form="fotosEjec" data-id="${e.id}" data-campo="${campo}"><label>${titulo}</label><div class="row" style="gap:8px"><input name="fotos" type="file" accept="image/*" multiple required style="flex:1;min-width:0"><button class="btn sm" type="submit">Subir</button></div></form>`;
  let acciones = '';
  if (e.estado === 'Programado') {
    acciones += puedePorteria && e.proveedor_id ? `<button class="btn" data-act="ejecEstado" data-id="${e.id}" data-v="En portería">El proveedor llegó a portería</button>` : '';
    if (puedeTrabajar && !e.proveedor_id) acciones += subirFotos('fotos_antes', 'Fotos ANTES de empezar') + (e.fotos_antes.length ? `<button class="btn" data-act="ejecEstado" data-id="${e.id}" data-v="En curso">Empezar trabajo</button>` : '');
  }
  if (e.estado === 'En portería' && puedePorteria) {
    acciones += hab ? `<button class="btn" data-act="ejecEstado" data-id="${e.id}" data-v="Ingreso aprobado">Aprobar ingreso</button>`
      : W() ? `<div class="alert alert-bad">La seguridad social del proveedor no está vigente. Si apruebas, queda registrado que lo autorizó la administración.</div><button class="btn danger" data-act="ejecEstado" data-id="${e.id}" data-v="Ingreso aprobado" data-confirm="¿Aprobar sin seguridad social vigente?">Aprobar de todas formas</button>`
      : `<div class="alert alert-bad">Seguridad social vencida: no puede ingresar hasta que la administración lo autorice. Ya le llegó el aviso.</div>`;
  }
  if (e.estado === 'Ingreso aprobado' && puedeTrabajar) acciones += subirFotos('fotos_antes', 'Fotos ANTES de empezar') + (e.fotos_antes.length ? `<button class="btn" data-act="ejecEstado" data-id="${e.id}" data-v="En curso">Empezar trabajo</button>` : '<div class="sub">Sube al menos una foto del equipo antes de empezar.</div>');
  if (e.estado === 'En curso' && puedeTrabajar) acciones += subirFotos('fotos_durante', 'Fotos DURANTE el trabajo') + subirFotos('fotos_despues', 'Fotos DESPUÉS (equipo terminado)') + (e.fotos_despues.length ? `<form class="form card" data-form="liberar" data-id="${e.id}" style="background:var(--bg)"><h3>Liberación del equipo</h3>
      <div><label>Qué se hizo</label><textarea name="observaciones" rows="3" required></textarea></div>
      <div><label>Novedades encontradas</label><textarea name="novedades" rows="2" placeholder="Desgaste, ruidos, piezas en mal estado…"></textarea></div>
      <div class="two"><div><label>Estado en que queda el equipo</label><select name="equipo_estado">${ESTADOS_ACT.map(s => `<option ${a.estado === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div><div><label>Técnico responsable</label><input name="tecnico" value="${esc(e.tecnico || '')}"></div></div>
      <h3 style="margin-top:4px">Alerta preventiva (opcional)</h3>
      <div><label>Próximo cambio o reparación</label><input name="proximo_cambio" placeholder="Ej. Cambiar sello mecánico"></div>
      <div class="two"><div><label>Para cuándo</label><input name="proximo_cambio_fecha" type="date"></div><div><label>Costo estimado</label><input name="proximo_cambio_costo" type="number" min="0" step="1000"></div></div>
      ${W() ? `<div><label>Costo real de este mantenimiento</label><input name="costo" type="number" min="0" step="1000" value="${Number(e.costo_estimado) || ''}"></div>` : ''}
      <button class="btn" type="submit">Liberar equipo</button></form>` : '<div class="sub">Sube fotos del DESPUÉS para poder liberar el equipo.</div>');
  if (W() && pend) acciones += `<details class="mt"><summary><b>Reprogramar o marcar como no realizado</b></summary>
      <form class="form mt" data-form="reprogramar" data-id="${e.id}"><div class="two"><div><label>Nueva fecha</label><input name="fecha" type="date" value="${e.fecha_programada}" required></div><div><label>Hora</label><input name="hora" type="time" value="${esc(e.hora || '')}"></div></div><button class="btn sm ghost" type="submit">Reprogramar</button></form>
      <form class="form mt" data-form="noRealizado" data-id="${e.id}"><div><label>Motivo</label><input name="motivo" required placeholder="Ej. el proveedor no llegó"></div><button class="btn sm danger" type="submit">Marcar no realizado</button></form></details>`;
  const ev = (l, f) => f && f.length ? `<div><div class="sub" style="margin-top:6px"><b>${l}</b> (${f.length})</div>${fotosHTML(f)}</div>` : '';
  return `<div class="stack">
  <button class="btn sm ghost" data-act="volverEjec" style="align-self:flex-start">‹ Volver</button>
  <div class="card stack" style="gap:8px">
    <div class="row"><span class="mono" style="color:var(--muted)">MT-${String(e.numero).padStart(4, '0')} · ${esc(e.tipo)}</span><span class="chip ${chipEj[e.estado]}">${e.estado}</span></div>
    <h2>${esc(e.titulo)}</h2>
    <div class="sub">${fecha(e.fecha_programada)}${e.hora ? ' · ' + esc(e.hora) : ''}${a.nombre ? ` · ${esc(a.nombre)} (${esc(a.codigo)})` : ''}${a.ubicacion ? ' · ' + esc(a.ubicacion) : ''}</div>
    ${a.id && !PV() && !P() ? `<button class="btn sm ghost" data-act="sub2" data-view="activo" data-id="${a.id}" style="align-self:flex-start">Ver hoja de vida del equipo</button>` : ''}
    <div class="row" style="justify-content:flex-start;gap:8px;flex-wrap:wrap"><b>${esc(p.nombre || 'Personal interno')}</b>${chipPila(docs, e.proveedor_id)}</div>
    ${p.telefono && !PV() ? `<div class="sub">Tel. <span style="user-select:all">${esc(p.telefono)}</span></div>` : ''}
    ${!PV() && Number(e.costo_estimado) ? `<div class="sub">Costo estimado ${fmt(e.costo_estimado)}${e.costo != null ? ' · costo real ' + fmt(e.costo) : ''}</div>` : ''}
  </div>
  <div class="card"><h2>Control operativo</h2><div class="pasos">
    ${e.proveedor_id ? pasoHTML(!!e.llegada_at, 'Llegada a portería', e.llegada_at ? fechaHora(e.llegada_at) : 'Portería la registra al llegar') : ''}
    ${e.proveedor_id ? pasoHTML(!!e.ingreso_at, 'Ingreso aprobado', e.ingreso_at ? fechaHora(e.ingreso_at) : (hab ? 'Seguridad social al día' : 'Requiere autorización de la administración')) : ''}
    ${pasoHTML(e.fotos_antes.length > 0, 'Registro fotográfico ANTES', e.fotos_antes.length ? e.fotos_antes.length + ' foto(s)' : '')}
    ${pasoHTML(!!e.inicio_at, 'Trabajo en curso', e.inicio_at ? 'Desde ' + fechaHora(e.inicio_at) + (e.fotos_durante.length ? ' · ' + e.fotos_durante.length + ' foto(s) durante' : '') : '')}
    ${pasoHTML(e.estado === 'Liberado', 'Liberación del equipo', e.liberado_at ? fechaHora(e.liberado_at) + (e.tecnico ? ' · ' + esc(e.tecnico) : '') : '')}
  </div></div>
  ${acciones ? `<div class="card stack" style="gap:10px">${acciones}</div>` : ''}
  ${e.estado === 'No realizado' ? `<div class="alert alert-bad"><b>No se realizó.</b> ${esc(e.motivo_no_realizado || '')}</div>` : ''}
  ${(e.fotos_antes.length || e.fotos_durante.length || e.fotos_despues.length) ? `<div class="card"><h2>Evidencias</h2>${ev('Antes', e.fotos_antes)}${ev('Durante', e.fotos_durante)}${ev('Después', e.fotos_despues)}</div>` : ''}
  ${e.estado === 'Liberado' ? `<div class="card stack" style="gap:6px"><h2>Informe de liberación</h2>
    ${e.observaciones ? `<p style="margin:0"><b>Qué se hizo:</b> ${nl(e.observaciones)}</p>` : ''}
    ${e.novedades ? `<p style="margin:0"><b>Novedades:</b> ${nl(e.novedades)}</p>` : ''}
    ${e.equipo_estado ? `<p style="margin:0"><b>Estado del equipo:</b> <span class="chip ${chipAct[e.equipo_estado]}">${e.equipo_estado}</span></p>` : ''}
    ${e.proximo_cambio ? `<div class="alert"><b>Alerta preventiva:</b> ${esc(e.proximo_cambio)}${e.proximo_cambio_fecha ? ' para el ' + fecha(e.proximo_cambio_fecha) : ''}${e.proximo_cambio_costo && !PV() ? ' · estimado ' + fmt(e.proximo_cambio_costo) : ''}</div>` : ''}</div>` : ''}
  ${e.proveedor_id ? `<div class="card"><h2>Controles operativos de este trabajo</h2><div class="list" style="margin-top:4px">${ctrl.map(d => `<div class="item"><div class="grow"><h3>${esc(d.titulo || d.tipo)}</h3><div class="sub">${fechaHora(d.created_at)}</div></div>${d.archivo ? `<button class="btn sm ghost" data-act="archivo" data-path="${esc(d.archivo)}">Ver</button>` : ''}</div>`).join('') || '<div class="sub">Análisis de trabajo seguro (ATS), permiso de alturas, lista de chequeo…</div>'}</div>
    ${puedeTrabajar ? `<form class="form mt" data-form="controlEjec" data-id="${e.id}" data-prov="${e.proveedor_id}"><div class="two"><div><label>Documento</label><input name="titulo" required placeholder="ATS, permiso de alturas…"></div><div><label>Archivo</label><input name="archivo" type="file" accept="application/pdf,image/*" required></div></div><button class="btn sm ghost" type="submit" style="align-self:flex-start">Adjuntar</button></form>` : ''}</div>` : ''}
  </div>`;
};

/* ---------- por área ---------- */
V.m_areas = async () => {
  await cargarAreas();
  const [acts, prox] = await Promise.all([
    q(sb.from('activos').select('id, codigo, nombre, estado, area_id, ubicacion').eq('conjunto_id', C()).order('codigo')),
    q(sb.from('ejecuciones').select('activo_id, fecha_programada').eq('conjunto_id', C()).eq('estado', 'Programado').gte('fecha_programada', HOY()).order('fecha_programada'))
  ]);
  const proxDe = id => (prox.find(x => x.activo_id === id) || {}).fecha_programada;
  const grupos = [...S.areas.map(ar => [ar, acts.filter(a => a.area_id === ar.id)]), [{ nombre: 'Sin área asignada' }, acts.filter(a => !a.area_id)]].filter(([ar, l]) => ar.id || l.length);
  return `${W() ? `<details class="card" ${S.areas.length ? '' : 'open'}><summary><b>+ Agregar área</b></summary><form class="form mt" data-form="area"><div class="two"><div><label>Nombre</label><input name="nombre" required placeholder="Cuarto de bombas, Torre 1, Sótano…"></div><div><label>Descripción</label><input name="descripcion" placeholder="Dónde queda, cómo llegar"></div></div><button class="btn" type="submit">Agregar</button></form>
    <p class="sub" style="margin:8px 0 0">Para ubicar un equipo en un área, edítalo en su ficha del inventario.</p></details>` : ''}
  ${grupos.map(([ar, l]) => `<div class="card"><div class="row"><div class="grow"><h2>${esc(ar.nombre)}</h2>${ar.descripcion ? `<div class="sub">${esc(ar.descripcion)}</div>` : ''}</div><span class="sub">${l.length} equipo${l.length !== 1 ? 's' : ''}</span></div>
    <div class="list" style="margin-top:6px">${l.map(a => `<button class="item chatrow" data-act="sub2" data-view="activo" data-id="${a.id}"><div class="grow"><div class="row"><h3>${esc(a.nombre)}</h3><span class="chip ${chipAct[a.estado]}">${a.estado}</span></div><div class="sub">${esc(a.codigo)}${a.ubicacion ? ' · ' + esc(a.ubicacion) : ''}${proxDe(a.id) ? ' · próximo mantenimiento ' + fecha(proxDe(a.id)) : ''}</div></div></button>`).join('') || '<div class="sub" style="padding-top:6px">Sin equipos en esta área.</div>'}</div>
    ${W() && ar.id && !l.length ? `<button class="btn sm ghost danger-t mt" data-act="borrar" data-tabla="areas" data-id="${ar.id}" data-confirm="¿Borrar área?">Borrar área</button>` : ''}</div>`).join('') || '<div class="card sub">Crea las áreas del conjunto para ubicar fácilmente cada equipo.</div>'}`;
};

/* ---------- proveedores ---------- */
V.m_proveedores = async () => {
  const [provs, docs] = await Promise.all([
    q(sb.from('proveedores').select('*').eq('conjunto_id', C()).order('nombre')),
    q(sb.from('proveedor_docs').select('proveedor_id, tipo, vence').eq('conjunto_id', C()))
  ]);
  return `${W() ? `<details class="card" ${provs.length ? '' : 'open'}><summary><b>+ Agregar proveedor</b></summary><form class="form mt" data-form="proveedor">
    <div class="two"><div><label>Empresa o persona</label><input name="nombre" required></div><div><label>NIT o cédula</label><input name="nit"></div></div>
    <div class="two"><div><label>Especialidad</label><input name="especialidad" placeholder="Ascensores, bombas, fumigación…"></div><div><label>Contacto</label><input name="contacto"></div></div>
    <div class="two"><div><label>Celular</label><input name="telefono" type="tel"></div><div><label>Correo</label><input name="email" type="email"></div></div>
    <button class="btn" type="submit">Agregar</button></form></details>` : ''}
  ${provs.map(p => { const venc = docs.filter(d => d.proveedor_id === p.id && d.vence && d.vence < HOY()).length; return `<button class="card navcard" data-act="sub2" data-view="proveedor" data-id="${p.id}"><div class="ico">${esc(iniciales(p.nombre))}</div><div class="grow">
    <div class="row"><h3>${esc(p.nombre)}</h3>${pilaVigente(docs, p.id) ? '<span class="chip ok">Habilitado</span>' : '<span class="chip bad">No habilitado</span>'}</div>
    <div class="sub">${esc(p.especialidad || '')}${p.telefono ? ' · ' + esc(p.telefono) : ''}${venc ? ` · <b style="color:var(--bad)">${venc} documento(s) vencido(s)</b>` : ''}</div></div></button>`; }).join('') || '<div class="card sub">Registra a los proveedores que hacen mantenimiento en el conjunto.</div>'}
  <div class="card sub">Un proveedor está <b>habilitado</b> cuando tiene la planilla de seguridad social (PILA) vigente. Si no la tiene, portería no puede aprobar su ingreso: solo la administración.</div>`;
};

V.proveedor = async () => {
  const id = S.sub.id || (S.ctx && S.ctx.proveedor_id);
  const [p, docs, ej, invs] = await Promise.all([
    q(sb.from('proveedores').select('*').eq('id', id).maybeSingle()),
    q(sb.from('proveedor_docs').select('*').eq('proveedor_id', id).is('ejecucion_id', null).order('created_at', { ascending: false })),
    q(sb.from('ejecuciones').select('*, activos(nombre, codigo)').eq('proveedor_id', id).order('fecha_programada', { ascending: false }).limit(30)),
    W() ? q(sb.from('invitaciones').select('*').eq('proveedor_id', id)) : Promise.resolve([])
  ]);
  if (!p) return '<div class="card">No encontramos este proveedor.</div>';
  const porTipo = TIPOS_PDOC.filter(t => t !== 'Control operativo').map(t => [t, docs.filter(d => d.tipo === t)]);
  return `<div class="stack">
  ${PV() ? '' : '<button class="btn sm ghost" data-act="tab" data-v="mant" style="align-self:flex-start">‹ Mantenimiento</button>'}
  <div class="card stack" style="gap:6px"><div class="row"><h2>${esc(p.nombre)}</h2>${pilaVigente(docs, p.id) ? '<span class="chip ok">Habilitado</span>' : '<span class="chip bad">No habilitado</span>'}</div>
    <div class="sub">${[p.nit && 'NIT ' + esc(p.nit), esc(p.especialidad || ''), esc(p.contacto || ''), p.telefono && `<span style="user-select:all">${esc(p.telefono)}</span>`, esc(p.email || '')].filter(Boolean).join(' · ')}</div></div>
  <div class="card"><h2>Documentos y seguridad social</h2><div class="list" style="margin-top:4px">
    ${porTipo.map(([t, l]) => { const d = l[0]; const n = d && d.vence ? dias(d.vence) : null; return `<div class="item"><div class="grow"><h3>${t}</h3><div class="sub">${d ? (d.vence ? `<span class="chip ${n < 0 ? 'bad' : n <= 7 ? 'warn' : 'ok'}">${n < 0 ? 'Venció' : 'Vence'} ${fecha(d.vence)}</span>` : 'Sin fecha de vencimiento') + ` · subido ${fecha(d.created_at)}` : 'Sin cargar'}</div></div>${d && d.archivo ? `<button class="btn sm ghost" data-act="archivo" data-path="${esc(d.archivo)}">Ver</button>` : ''}</div>`; }).join('')}
  </div>
  ${W() || PV() ? `<form class="form mt" data-form="docProveedor" data-id="${p.id}" style="border-top:1px solid var(--line);padding-top:10px"><h3>Subir documento</h3>
    <div class="two"><div><label>Tipo</label><select name="tipo">${TIPOS_PDOC.filter(t => t !== 'Control operativo').map(t => `<option>${t}</option>`).join('')}</select></div><div><label>Vence</label><input name="vence" type="date"></div></div>
    <div><label>Archivo</label><input name="archivo" type="file" accept="application/pdf,image/*" required></div>
    <p class="sub" style="margin:0">La planilla PILA se sube cada mes; su vencimiento es el último día del mes que cubre.</p>
    <button class="btn" type="submit">Subir</button></form>` : ''}</div>
  ${W() ? `<div class="card"><h2>Acceso del técnico a la app</h2><p class="sub" style="margin:4px 0 8px">Con acceso propio, el técnico ve sus trabajos, sube las fotos de antes, durante y después, y libera el equipo.</p>
    ${invs.map(i => `<div class="item"><div class="grow"><h3>${esc(i.email)}</h3></div><span class="chip ${i.usada ? 'ok' : 'warn'}">${i.usada ? 'Activo' : 'Invitado'}</span></div>`).join('')}
    <form class="form mt" data-form="invitarTecnico" data-id="${p.id}"><div class="row" style="gap:8px"><input name="email" type="email" required placeholder="correo del técnico" style="flex:1;min-width:0"><button class="btn sm" type="submit">Dar acceso</button></div></form></div>` : ''}
  <div class="card"><h2>Trabajos</h2><div class="list" style="margin-top:6px">${ej.map(filaEjec).join('') || '<div class="sub" style="padding-top:6px">Sin trabajos registrados.</div>'}</div></div></div>`;
};
V.miproveedor = async () => V.proveedor();

/* ---------- agenda del técnico ---------- */
V.pagenda = async () => {
  const ej = await q(sb.from('ejecuciones').select('*, activos(nombre, codigo), proveedores(nombre)').gte('fecha_programada', addDays(HOY(), -30)).lte('fecha_programada', addDays(HOY(), 60)).order('fecha_programada'));
  const hoy = ej.filter(e => e.fecha_programada <= HOY() && PENDIENTES.includes(e.estado));
  const prox = ej.filter(e => e.fecha_programada > HOY() && PENDIENTES.includes(e.estado));
  const hechos = ej.filter(e => !PENDIENTES.includes(e.estado)).reverse();
  const g = (t, l, v) => `<div class="card"><h2>${t}</h2><div class="list" style="margin-top:6px">${l.map(filaEjec).join('') || `<div class="sub" style="padding-top:6px">${v}</div>`}</div></div>`;
  return `<div class="stack"><div class="alert">Al llegar, preséntate en portería. Cuando aprueben tu ingreso, abre el trabajo, sube las fotos de antes, durante y después, y libera el equipo.</div>
  ${g('Hoy y pendientes', hoy, 'No tienes trabajos para hoy.')}${g('Próximos', prox, 'Sin trabajos programados.')}${g('Realizados', hechos, 'Aún no hay trabajos realizados.')}</div>`;
};

/* ---------- cuadro de mando ---------- */
function graficaAcumulada(porMes, presupuesto) {
  const W0 = 340, H0 = 170, L = 52, Rm = 8, T = 12, B = 26, w = W0 - L - Rm, h = H0 - T - B;
  let ac = 0; const acum = porMes.map(v => ac += Number(v || 0));
  const mesHoy = new Date().getMonth();
  const top = Math.max(presupuesto, ac, 1) * 1.08;
  const x = i => L + (i + 0.5) * w / 12, y = v => T + h - v / top * h;
  const ticks = [0, top / 2, top].map(v => Math.round(v / 1e5) * 1e5);
  const pts = acum.slice(0, mesHoy + 1).map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const meses = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
  return `<svg viewBox="0 0 ${W0} ${H0}" class="graf" role="img" aria-label="Gasto acumulado frente al presupuesto anual">
    ${ticks.map(t => `<line x1="${L}" x2="${W0 - Rm}" y1="${y(t)}" y2="${y(t)}" class="g-grid"/><text x="${L - 6}" y="${y(t) + 3}" text-anchor="end" class="g-txt">${t >= 1e6 ? (t / 1e6).toLocaleString('es-CO', { maximumFractionDigits: 1 }) + ' M' : (t / 1e3).toFixed(0) + ' k'}</text>`).join('')}
    ${porMes.map((v, i) => Number(v) ? `<rect x="${x(i) - 7}" y="${y(Number(v))}" width="14" height="${T + h - y(Number(v))}" class="g-bar" rx="2"/>` : '').join('')}
    ${presupuesto ? `<line x1="${L}" x2="${W0 - Rm}" y1="${y(presupuesto)}" y2="${y(presupuesto)}" class="g-ppto"/><text x="${W0 - Rm}" y="${y(presupuesto) - 4}" text-anchor="end" class="g-txt g-ppto-t">Presupuesto ${millones(presupuesto)}</text>` : ''}
    <polyline points="${pts}" class="g-line"/>
    ${mesHoy >= 0 ? `<circle cx="${x(mesHoy)}" cy="${y(acum[mesHoy])}" r="4" class="g-dot"/>` : ''}
    ${meses.map((m, i) => `<text x="${x(i)}" y="${H0 - 8}" text-anchor="middle" class="g-txt">${m}</text>`).join('')}
  </svg>
  <div class="leyenda"><span><i class="lg-line"></i>Gasto acumulado</span><span><i class="lg-bar"></i>Gasto del mes</span>${presupuesto ? '<span><i class="lg-ppto"></i>Presupuesto anual</span>' : ''}</div>`;
}
V.m_tablero = async () => {
  const anio = Number(S.sub.anio || anioActual());
  const [t, cambios] = await Promise.all([
    q(sb.rpc('tablero_mant', { p_conjunto: C(), p_anio: anio })),
    q(sb.from('ejecuciones').select('id, titulo, proximo_cambio, proximo_cambio_fecha, proximo_cambio_costo, activos(nombre)').eq('conjunto_id', C()).not('proximo_cambio_fecha', 'is', null).gte('proximo_cambio_fecha', HOY()).order('proximo_cambio_fecha').limit(15))
  ]);
  if (!t) return '<div class="card">No tienes acceso al cuadro de mando.</div>';
  const ppto = Number(t.presupuesto), gas = Number(t.gastado), disp = ppto - gas;
  const proy = gas + Number(t.comprometido) + Number(t.proximos_cambios);
  const pct = ppto ? Math.round(gas / ppto * 100) : 0;
  const cumpl = t.programados ? Math.round(t.cumplidos / t.programados * 100) : null;
  const eq = t.equipos || {}, maxArea = Math.max(1, ...(t.por_area || []).map(a => Number(a.valor)));
  return `<div class="row"><div class="seg" style="flex:1">${[anio - 1, anio, anio + 1].map(a => `<button data-act="sub" data-k="anio" data-v="${a}" data-keep="1" data-tkeep="1" aria-pressed="${a === anio}">${a}</button>`).join('')}</div></div>
  <div class="kpis">
    <div class="kpi"><div class="v">${millones(ppto)}</div><div class="l">Presupuesto anual de mantenimiento</div></div>
    <div class="kpi"><div class="v">${millones(gas)}</div><div class="l">Gastado (${pct}%)</div><div class="bar" style="margin-top:8px"><span style="width:${Math.min(pct, 100)}%;background:${pct > 100 ? 'var(--bad)' : pct > 85 ? 'var(--warn)' : 'var(--brand)'}"></span></div></div>
    <div class="kpi"><div class="v" style="color:${disp < 0 ? 'var(--bad)' : 'inherit'}">${millones(disp)}</div><div class="l">Disponible</div></div>
    <div class="kpi"><div class="v" style="color:${ppto && proy > ppto ? 'var(--bad)' : 'inherit'}">${millones(proy)}</div><div class="l">Proyección al cierre (gastado + agenda + próximos cambios)</div></div>
  </div>
  ${ppto && proy > ppto ? `<div class="alert alert-bad"><b>La proyección supera el presupuesto en ${millones(proy - ppto)}.</b> Revisa los próximos cambios o lleva el ajuste al consejo.</div>` : ''}
  <div class="card"><h2>Gasto acumulado ${anio}</h2>${graficaAcumulada(t.por_mes || [], ppto)}</div>
  <div class="kpis">
    <div class="kpi"><div class="v">${cumpl === null ? '—' : cumpl + '%'}</div><div class="l">Cumplimiento de la agenda (${t.cumplidos}/${t.programados})</div></div>
    <div class="kpi"><div class="v" style="color:${t.atrasados ? 'var(--bad)' : 'inherit'}">${t.atrasados}</div><div class="l">Mantenimientos atrasados</div></div>
  </div>
  <div class="card"><h2>Gasto por área</h2><div class="stack" style="gap:8px;margin-top:8px">${(t.por_area || []).map(a => `<div><div class="row"><span class="sub" style="color:var(--ink)">${esc(a.area)}</span><span class="mono">${fmt(a.valor)}</span></div><div class="bar" style="height:6px;margin-top:4px"><span style="width:${Number(a.valor) / maxArea * 100}%;background:var(--accent)"></span></div></div>`).join('') || '<div class="sub">Aún no hay gasto registrado este año.</div>'}</div></div>
  <div class="card"><h2>Inventario</h2><div class="mini" style="grid-template-columns:repeat(4,1fr)">${ESTADOS_ACT.map(s => `<span><b>${eq[s] || 0}</b>${s}</span>`).join('')}</div><div class="sub" style="margin-top:8px">${t.equipos_total} equipos · valor registrado ${fmt(t.valor_inventario)}</div></div>
  <div class="card"><h2>Próximos cambios (alertas preventivas)</h2><div class="list" style="margin-top:6px">${cambios.filter(c => c.proximo_cambio && c.proximo_cambio_fecha).map(c => `<button class="item chatrow" data-act="abrirEjec" data-id="${c.id}"><div class="ico datebox"><b>${pd(c.proximo_cambio_fecha).getDate()}</b><span>${pd(c.proximo_cambio_fecha).toLocaleDateString('es-CO', { month: 'short' }).replace('.', '')}</span></div><div class="grow"><h3>${esc(c.proximo_cambio)}</h3><div class="sub">${esc((c.activos || {}).nombre || c.titulo)}</div></div><span class="mono">${c.proximo_cambio_costo ? fmt(c.proximo_cambio_costo) : ''}</span></button>`).join('') || '<div class="sub" style="padding-top:6px">Sin cambios proyectados. Se registran al liberar cada mantenimiento.</div>'}</div></div>
  ${W() ? `<form class="card form" data-form="presupuestoMant"><h3>Presupuesto de mantenimiento ${anio}</h3><div class="row" style="gap:8px"><input name="valor" type="number" min="0" step="100000" value="${ppto || ''}" required style="flex:1;min-width:0" aria-label="Presupuesto anual"><input type="hidden" name="anio" value="${anio}"><button class="btn sm" type="submit">Guardar</button></div><p class="sub" style="margin:0">El aprobado por la asamblea para mantenimiento de este año. El gasto se descuenta solo al liberar mantenimientos y cerrar órdenes con costo.</p></form>` : ''}`;
};

/* ---------- inventario: área, hoja de vida ampliada y NFC ---------- */
const _formActivo = formActivo;
formActivo = function (a, nombre) {
  const sel = `<div><label>Área</label><select name="area"><option value="">Sin área</option>${S.areas.map(ar => `<option value="${ar.id}" ${a.area_id === ar.id ? 'selected' : ''}>${esc(ar.nombre)}</option>`).join('')}</select></div>`;
  return _formActivo(a, nombre).replace('<div><label>Ubicación</label>', sel + '<div><label>Ubicación</label>');
};
const _vActivo = V.activo;
V.activo = async () => {
  let html = await _vActivo();
  const [ej, act] = await Promise.all([
    q(sb.from('ejecuciones').select('*').eq('activo_id', S.sub.id).order('fecha_programada', { ascending: false }).limit(40)),
    q(sb.from('activos').select('area_id').eq('id', S.sub.id).maybeSingle())
  ]);
  const area = act && S.areas.find(a => a.id === act.area_id);
  const lib = ej.filter(e => e.estado === 'Liberado'), prox = ej.filter(e => PENDIENTES.includes(e.estado)).reverse();
  const alertas = ej.filter(e => e.proximo_cambio && e.proximo_cambio_fecha && e.proximo_cambio_fecha >= HOY());
  const gasto = lib.reduce((s, e) => s + Number(e.costo || 0), 0);
  const tarjeta = `<div class="card"><h2>Mantenimientos realizados</h2>
    <div class="mini" style="grid-template-columns:repeat(3,1fr)"><span><b>${lib.length}</b>liberados</span><span><b>${prox.length}</b>programados</span><span><b>${fmt(gasto)}</b>gasto acumulado</span></div>
    ${alertas.map(e => `<div class="alert mt"><b>Próximo cambio:</b> ${esc(e.proximo_cambio)} · ${fecha(e.proximo_cambio_fecha)}${e.proximo_cambio_costo ? ' · ' + fmt(e.proximo_cambio_costo) : ''}</div>`).join('')}
    <div class="list mt">${[...prox.slice(0, 3), ...lib].map(e => `<button class="item chatrow" data-act="abrirEjec" data-id="${e.id}"><div class="grow"><div class="row"><h3>${esc(e.titulo)}</h3><span class="chip ${chipEj[e.estado]}">${e.estado}</span></div><div class="sub">${fecha(e.fecha_programada)}${e.novedades ? ' · ' + esc(e.novedades) : ''}${e.costo ? ' · ' + fmt(e.costo) : ''}</div>${fotosHTML((e.fotos_despues || []).slice(0, 3))}</div></button>`).join('') || '<div class="sub">Sin mantenimientos en la agenda para este equipo.</div>'}</div></div>`;
  const nfc = `<div class="card stack" style="gap:8px"><h2>Etiqueta NFC</h2><p class="sub" style="margin:0">Pega una etiqueta NFC en el equipo. Al acercar el celular se abre esta hoja de vida para la administración y el consejo, la consulta del equipo para los residentes y el trabajo del día para el proveedor.</p>
    ${'NDEFReader' in window ? `<button class="btn" data-act="grabarNFC" data-id="${S.sub.id}" style="align-self:flex-start">Grabar etiqueta NFC</button>` : `<div class="sub">Para grabar desde la app usa Chrome en un celular Android. También puedes grabar este enlace con cualquier app de NFC:</div><div class="mono" style="user-select:all;word-break:break-all">${esc(urlQR(S.sub.id))}</div>`}</div>`;
  if (area) html = html.replace('<div class="two"><div><div class="sub">Marca</div>', `<div class="sub"><b>Área:</b> ${esc(area.nombre)}</div><div class="two"><div><div class="sub">Marca</div>`);
  const ancla = '<div class="card"><div class="row"><h2>Documentos</h2>';
  html = html.includes(ancla) ? html.replace(ancla, tarjeta + ancla) : html + tarjeta;
  return html.replace('<div class="card stack" style="align-items:center;gap:8px"><h2>Código QR</h2>', nfc + '<div class="card stack" style="align-items:center;gap:8px"><h2>Código QR</h2>');
};

/* ---------- consulta del equipo para residentes (QR o NFC) ---------- */
V.activoinfo = async () => {
  const a = await q(sb.rpc('activo_publico', { p_id: S.sub.id }));
  if (!a) return '<div class="card">No encontramos este equipo.</div>';
  const cert = a.certificado_vence;
  return `<div class="stack"><div class="card stack" style="gap:8px"><div class="eyebrow">${esc(a.codigo)}</div><div class="row"><h2>${esc(a.nombre)}</h2><span class="chip ${chipAct[a.estado]}">${a.estado}</span></div>
    <div class="sub">${[a.area, a.ubicacion].filter(Boolean).map(esc).join(' · ')}</div>
    <div class="mini" style="grid-template-columns:repeat(3,1fr)"><span><b>${a.ultimo ? fecha(a.ultimo) : '—'}</b>último mantenimiento</span><span><b>${a.proximo ? fecha(a.proximo) : '—'}</b>próximo</span><span><b>${cert ? fecha(cert) : '—'}</b>certificado vigente hasta</span></div>
    ${cert && cert < HOY() ? '<div class="alert alert-bad">El certificado de este equipo está vencido.</div>' : ''}</div>
    <button class="btn" data-act="reportarEquipo" data-id="${a.id}" data-n="${esc(a.nombre)}" data-c="${esc(a.codigo)}" data-u="${esc(a.ubicacion || a.area || '')}">Reportar un daño de este equipo</button></div>`;
};

const _rutaQR = rutaQR;
rutaQR = async function () {
  const m = /^#activo-([0-9a-f-]{36})$/i.exec(location.hash);
  if (!m) return false;
  const id = m[1];
  const prov = S.ctxs.filter(c => c.rol === 'proveedor');
  if (prov.length) {
    const e = await sb.from('ejecuciones').select('id, conjunto_id').eq('activo_id', id).in('estado', PENDIENTES).order('fecha_programada').limit(1).maybeSingle();
    if (e.data) { const ctx = prov.find(c => c.conjunto_id === e.data.conjunto_id); if (ctx) { history.replaceState(null, '', location.pathname); setCtx(ctx); go('ejec', { id: e.data.id }); return true; } }
  }
  const a = await sb.from('activos').select('id, conjunto_id').eq('id', id).maybeSingle();
  if (a.data && S.ctxs.some(c => c.conjunto_id === a.data.conjunto_id && (c.rol === 'admin' || c.rol === 'consejo'))) return _rutaQR();
  const b = await sb.rpc('activo_publico', { p_id: id });
  if (b.data) {
    const ctx = S.ctxs.find(c => c.conjunto_id === b.data.conjunto_id);
    if (ctx) { history.replaceState(null, '', location.pathname); setCtx(ctx); go('activoinfo', { id }); return true; }
  }
  return _rutaQR();
};

/* ---------- portería: proveedores de mantenimiento del día ---------- */
const _vPorteria = V.porteria;
V.porteria = async () => {
  const [base, ej] = await Promise.all([_vPorteria(), q(sb.from('ejecuciones').select('*, activos(nombre), proveedores(nombre)').eq('conjunto_id', C()).not('proveedor_id', 'is', null).lte('fecha_programada', HOY()).gte('fecha_programada', addDays(HOY(), -1)).in('estado', PENDIENTES).order('hora'))]);
  if (!ej.length) return base;
  const docs = await q(sb.from('proveedor_docs').select('proveedor_id, tipo, vence').in('proveedor_id', [...new Set(ej.map(e => e.proveedor_id))]));
  const card = `<div class="card"><h2>Proveedores de mantenimiento hoy</h2><div class="list" style="margin-top:6px">${ej.map(e => { const hab = !!pilaVigente(docs, e.proveedor_id); return `<div class="item"><div class="grow">
    <div class="row"><h3>${esc((e.proveedores || {}).nombre)}</h3><span class="chip ${chipEj[e.estado]}">${e.estado}</span></div>
    <div class="sub">${esc(e.titulo)}${(e.activos || {}).nombre ? ' · ' + esc(e.activos.nombre) : ''}${e.hora ? ' · ' + esc(e.hora) : ''}</div>
    <div class="row" style="justify-content:flex-start;gap:6px;margin-top:6px;flex-wrap:wrap">${hab ? '<span class="chip ok">Seguridad social al día</span>' : '<span class="chip bad">Seguridad social vencida</span>'}
      ${e.estado === 'Programado' ? `<button class="btn sm" data-act="ejecEstado" data-id="${e.id}" data-v="En portería">Llegó</button>` : ''}
      ${e.estado === 'En portería' && hab ? `<button class="btn sm" data-act="ejecEstado" data-id="${e.id}" data-v="Ingreso aprobado">Aprobar ingreso</button>` : ''}
      ${e.estado === 'En portería' && !hab ? '<span class="sub">Esperando autorización de la administración</span>' : ''}
      <button class="btn sm ghost" data-act="abrirEjec" data-id="${e.id}">Ver</button></div></div></div>`; }).join('')}</div></div>`;
  const i = base.indexOf('<div class="kpis">');
  return i >= 0 ? base.slice(0, i) + card + base.slice(i) : card + base;
};

/* ---------- acciones ---------- */
Object.assign(ACT, {
  abrirEjec: d => go('ejec', { id: d.id, desde: S.view, desdeSub: S.sub }),
  volverEjec: () => { const v = S.sub.desde || (PV() ? 'pagenda' : 'mant'); go(v, S.sub.desdeSub || (v === 'mant' ? { t: 'agenda' } : {})); },
  generarAgenda: async () => { const n = await q(sb.rpc('generar_agenda', { p_conjunto: C(), p_meses: 3 })); toast(n ? `${n} mantenimientos agregados a la agenda` : 'La agenda ya estaba al día'); render(); },
  ejecEstado: async d => {
    await q(sb.from('ejecuciones').update({ estado: d.v }).eq('id', d.id));
    toast({ 'En portería': 'Llegada registrada. La administración recibió el aviso.', 'Ingreso aprobado': 'Ingreso aprobado', 'En curso': 'Trabajo iniciado' }[d.v] || d.v); render();
  },
  grabarNFC: async d => {
    try { const nd = new NDEFReader(); toast('Acerca la etiqueta NFC al celular…', 8000); await nd.write({ records: [{ recordType: 'url', data: urlQR(d.id) }] }); toast('Etiqueta grabada. Pégala en el equipo.'); }
    catch (e) { toast('No se pudo grabar: ' + (e.message || e)); }
  },
  reportarEquipo: d => go('reportar', { cat: 'Daño', activo: d.id, activoNombre: d.n, activoCodigo: d.c, activoUbic: d.u }),
  avanzarOT: async d => {
    const cambios = { estado: d.v, cerrada_at: d.v === 'Cerrada' ? new Date().toISOString() : null };
    if (d.v === 'Cerrada') { const v = window.prompt('Costo de la reparación en pesos (déjalo vacío si no tuvo costo):', ''); if (v === null) return; const n = Number(String(v).replace(/[^\d]/g, '')); if (n) cambios.costo = n; }
    await q(sb.from('ordenes').update(cambios).eq('id', d.id));
    toast('Orden ' + (d.v === 'Cerrada' ? 'cerrada' : 'en curso')); render();
  }
});

/* ---------- formularios ---------- */
Object.assign(FORM, {
  programar: async f => {
    await q(sb.from('ejecuciones').insert({ conjunto_id: C(), titulo: f.titulo, activo_id: f.activo || null, proveedor_id: f.proveedor || null, fecha_programada: f.fecha, hora: f.hora || null, tipo: f.tipo, costo_estimado: Number(f.costo) || 0 }));
    toast('Mantenimiento programado'); render();
  },
  fotosEjec: async (f, form) => {
    const campo = form.dataset.campo;
    const nuevas = await subirVarias(form.fotos.files, 'mantenimiento', 8);
    const e = await q(sb.from('ejecuciones').select(campo).eq('id', form.dataset.id).single());
    await q(sb.from('ejecuciones').update({ [campo]: [...(e[campo] || []), ...nuevas] }).eq('id', form.dataset.id));
    toast(nuevas.length + ' foto(s) subidas'); render();
  },
  liberar: async (f, form) => {
    const cambios = { estado: 'Liberado', observaciones: f.observaciones, novedades: f.novedades || null, equipo_estado: f.equipo_estado, tecnico: f.tecnico || null,
      proximo_cambio: f.proximo_cambio || null, proximo_cambio_fecha: f.proximo_cambio_fecha || null, proximo_cambio_costo: f.proximo_cambio_costo ? Number(f.proximo_cambio_costo) : null };
    if (f.costo !== undefined && f.costo !== '') cambios.costo = Number(f.costo);
    await q(sb.from('ejecuciones').update(cambios).eq('id', form.dataset.id));
    toast('Equipo liberado. La administración recibió el informe.', 4000); render();
  },
  reprogramar: async (f, form) => { await q(sb.from('ejecuciones').update({ fecha_programada: f.fecha, hora: f.hora || null }).eq('id', form.dataset.id)); toast('Reprogramado para el ' + fecha(f.fecha)); render(); },
  noRealizado: async (f, form) => { await q(sb.from('ejecuciones').update({ estado: 'No realizado', motivo_no_realizado: f.motivo }).eq('id', form.dataset.id)); toast('Registrado como no realizado'); render(); },
  controlEjec: async (f, form) => {
    const archivo = await subir(form.archivo.files[0], 'proveedores');
    await q(sb.from('proveedor_docs').insert({ conjunto_id: C(), proveedor_id: form.dataset.prov, ejecucion_id: form.dataset.id, tipo: 'Control operativo', titulo: f.titulo, archivo }));
    toast('Control operativo adjuntado'); render();
  },
  area: async f => { await q(sb.from('areas').insert({ conjunto_id: C(), nombre: f.nombre.trim(), descripcion: f.descripcion || null, orden: S.areas.length })); await cargarAreas(); toast('Área agregada'); render(); },
  proveedor: async f => {
    await q(sb.from('proveedores').insert({ conjunto_id: C(), nombre: f.nombre.trim(), nit: f.nit || null, especialidad: f.especialidad || null, contacto: f.contacto || null, telefono: f.telefono || null, email: f.email ? f.email.trim().toLowerCase() : null }));
    toast('Proveedor agregado. Sube su seguridad social para habilitarlo.'); render();
  },
  docProveedor: async (f, form) => {
    const archivo = await subir(form.archivo.files[0], 'proveedores');
    await q(sb.from('proveedor_docs').insert({ conjunto_id: C(), proveedor_id: form.dataset.id, tipo: f.tipo, vence: f.vence || null, archivo }));
    toast('Documento subido'); render();
  },
  invitarTecnico: async (f, form) => {
    await q(sb.from('invitaciones').insert({ conjunto_id: C(), email: f.email.trim().toLowerCase(), rol: 'proveedor', proveedor_id: form.dataset.id }));
    toast('Acceso creado. El técnico entra creando su cuenta con ese correo.'); render();
  },
  presupuestoMant: async f => { await q(sb.from('presupuestos_mant').upsert({ conjunto_id: C(), anio: Number(f.anio), valor: Number(f.valor) }, { onConflict: 'conjunto_id,anio' })); toast('Presupuesto guardado'); render(); },
  activo: async (f, form) => {
    const foto = await subir(form.foto.files[0], 'activos');
    await q(sb.from('activos').insert({ ...datosActivo(f), area_id: f.area || null, conjunto_id: C(), foto }));
    toast('Activo agregado'); render();
  },
  editarActivo: async (f, form) => {
    const foto = await subir(form.foto.files[0], 'activos');
    const datos = { ...datosActivo(f), area_id: f.area || null }; if (foto) datos.foto = foto;
    await q(sb.from('activos').update(datos).eq('id', form.dataset.id));
    toast('Cambios guardados'); render();
  },
  reporte: (() => { const base = FORM.reporte; return async (f, form) => {
    if (!S.sub.activo) return base(f, form);
    const fotos = await subirVarias(form.fotos.files, 'reportes', 4);
    const r = await q(sb.from('reportes').insert({ conjunto_id: C(), unidad_id: R() ? U() : null, origen: R() ? 'Residente' : P() ? 'Portería' : 'Administración', categoria: f.categoria, titulo: f.titulo + ' · ' + S.sub.activoNombre + ' (' + S.sub.activoCodigo + ')', ubicacion: f.ubicacion || S.sub.activoUbic || null, descripcion: f.descripcion || null, urgente: !!f.urgente, fotos }).select('numero').single());
    toast('Reporte #' + r.numero + ' enviado.'); S.sub = {}; render();
  }; })()
});

const _vReportar = V.reportar;
V.reportar = async () => (S.sub.activo ? `<div class="alert"><b>Equipo:</b> ${esc(S.sub.activoNombre)} <span class="mono">(${esc(S.sub.activoCodigo)})</span>${S.sub.activoUbic ? ' · ' + esc(S.sub.activoUbic) : ''}</div>` : '') + await _vReportar();
AFTER.reportar = () => { if (S.sub.activo) { const u = $('rp-u'); if (u && !u.value) u.value = S.sub.activoUbic || ''; } };
