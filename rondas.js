/* =====================================================================
   SYAPH360 · Pisos y rondas con NFC
   Cada piso o pasillo tiene una etiqueta NFC. El personal la escanea,
   marca lo realizado y los residentes del piso reciben el aviso.
   Depende de app.js, modulos.js, porteria.js y mantenimiento.js.
   ===================================================================== */

Object.assign(ICONS, {
  rondas: '<path d="M6 8a8 8 0 010 8M10 6a12 12 0 010 12M14 4a16 16 0 010 16"/><circle cx="19" cy="12" r="2"/>',
  mipiso: '<path d="M4 21V5a2 2 0 012-2h12a2 2 0 012 2v16"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M10 21v-4h4v4"/>',
  punto: '<path d="M6 8a8 8 0 010 8M10 6a12 12 0 010 12M14 4a16 16 0 010 16"/>'
});
TABS.operario = [['rondas', 'Mis rondas'], ['reportar', 'Reportar'], ['notificaciones', 'Avisos']];
VISTAS_VIVAS.push('punto', 'rondas', 'mipiso');
SECC_MANT.splice(1, 0, ['rondas', 'Pisos y rondas']);

const DIAS = [[1, 'L'], [2, 'M'], [3, 'X'], [4, 'J'], [5, 'V'], [6, 'S'], [7, 'D']];
const hoyDow = () => { const d = new Date().getDay(); return d === 0 ? 7 : d; };
const COLS_PUNTO = 'id, conjunto_id, nombre, torre, piso, descripcion, orden';
const esPersonal = () => ['admin', 'porteria', 'operario', 'proveedor'].includes(ROL());
const horaCorta = t => t ? new Date('2000-01-01T' + t).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' }) : '';
const urlPunto = (id, token) => location.origin + location.pathname + '#punto-' + id + (token ? '-' + token : '');
const diasTexto = d => d.length === 7 ? 'Todos los días' : d.length === 6 && !d.includes(7) ? 'Lunes a sábado' : d.length === 5 && !d.includes(6) && !d.includes(7) ? 'Lunes a viernes' : DIAS.filter(([n]) => d.includes(n)).map(([, l]) => l).join(' ');

// Estado de hoy de una rutina
function estadoRutina(r, regs) {
  const reg = regs.find(g => g.rutina_id === r.id && g.fecha === HOY());
  if (reg) return { k: 'ok', t: 'Hecho ' + hora(reg.hecho_at), reg };
  if (!r.dias.includes(hoyDow())) return { k: '', t: 'No toca hoy' };
  const ahora = new Date().toTimeString().slice(0, 5);
  if (r.hora_limite && r.hora_limite.slice(0, 5) < ahora) return { k: 'bad', t: 'Atrasado (límite ' + horaCorta(r.hora_limite) + ')' };
  return { k: 'warn', t: r.hora_limite ? 'Pendiente · antes de ' + horaCorta(r.hora_limite) : 'Pendiente' };
}

async function datosRondas(filtroPunto) {
  let qp = sb.from('puntos').select(COLS_PUNTO).eq('conjunto_id', C()).order('orden').order('nombre');
  let qr = sb.from('rutinas').select('*').eq('conjunto_id', C()).eq('activa', true).order('hora_limite');
  let qg = sb.from('rutina_registros').select('*').eq('conjunto_id', C()).gte('fecha', addDays(HOY(), -14)).order('hecho_at', { ascending: false });
  if (filtroPunto) { qp = qp.eq('id', filtroPunto); qr = qr.eq('punto_id', filtroPunto); qg = qg.eq('punto_id', filtroPunto); }
  const [puntos, rutinas, regs] = await Promise.all([q(qp), q(qr), q(qg)]);
  return { puntos, rutinas, regs };
}

/* ---------- administración: pisos y rondas (dentro de Mantenimiento) ---------- */
V.m_rondas = async () => {
  const [{ puntos, rutinas, regs }, cumpl] = await Promise.all([datosRondas(), ROL() === 'admin' || ROL() === 'consejo' ? q(sb.rpc('cumplimiento_rutinas', { p_conjunto: C(), p_dias: 30 })) : Promise.resolve([])]);
  const hoyTot = rutinas.filter(r => r.dias.includes(hoyDow()));
  const hechos = hoyTot.filter(r => regs.some(g => g.rutina_id === r.id && g.fecha === HOY())).length;
  const atras = hoyTot.filter(r => estadoRutina(r, regs).k === 'bad').length;
  const esp = cumpl.reduce((s, c) => s + Number(c.esperados), 0), hec = cumpl.reduce((s, c) => s + Number(c.hechos), 0);
  return `<div class="kpis">
    <div class="kpi"><div class="v">${hechos}/${hoyTot.length}</div><div class="l">Rondas de hoy realizadas</div><div class="bar" style="margin-top:8px"><span style="width:${hoyTot.length ? hechos / hoyTot.length * 100 : 0}%;background:var(--ok)"></span></div></div>
    <div class="kpi"><div class="v" style="color:${atras ? 'var(--bad)' : 'inherit'}">${atras}</div><div class="l">Atrasadas hoy</div></div>
    <div class="kpi"><div class="v">${esp ? Math.round(hec / esp * 100) + '%' : '—'}</div><div class="l">Cumplimiento últimos 30 días</div></div>
    <div class="kpi"><div class="v">${puntos.length}</div><div class="l">Pisos y zonas con etiqueta</div></div>
  </div>
  ${W() ? `<details class="card" ${puntos.length ? '' : 'open'}><summary><b>+ Agregar piso o zona</b></summary><form class="form mt" data-form="punto">
    <div><label>Nombre</label><input name="nombre" required placeholder="Torre 1 · Piso 7"></div>
    <div class="two"><div><label>Torre</label><input name="torre" placeholder="1"></div><div><label>Piso</label><input name="piso" placeholder="7"></div></div>
    <div><label>Apartamentos que reciben el aviso</label><input name="patron" placeholder="Ej. T1-7 (todos los que empiezan así) o T1-701, T1-702"></div>
    <div><label>Descripción</label><input name="descripcion" placeholder="Dónde está pegada la etiqueta"></div>
    <button class="btn" type="submit">Agregar</button></form>
    <p class="sub" style="margin:8px 0 0">Luego abre el piso para agregarle rutinas (aseo, revisión de luces…) y grabar su etiqueta NFC.</p></details>` : ''}
  ${puntos.map(p => { const rs = rutinas.filter(r => r.punto_id === p.id); return `<button class="card navcard" data-act="sub2" data-view="punto" data-id="${p.id}" style="align-items:flex-start"><div class="ico">${svg('mipiso')}</div><div class="grow">
    <h3>${esc(p.nombre)}</h3>
    ${rs.map(r => { const e = estadoRutina(r, regs); const c = cumpl.find(x => x.rutina_id === r.id); return `<div class="row" style="margin-top:6px"><span class="sub" style="color:var(--ink)">${esc(r.nombre)}${c && Number(c.esperados) ? ` <span class="sub">· ${Math.round(c.hechos / c.esperados * 100)}% en 30 días</span>` : ''}</span><span class="chip ${e.k}">${e.t}</span></div>`; }).join('') || '<div class="sub">Sin rutinas. Ábrelo para agregarlas.</div>'}
  </div></button>`; }).join('') || '<div class="card sub">Agrega cada piso o pasillo que quieras controlar con una etiqueta NFC.</div>'}`;
};

/* ---------- vista de un piso (al escanear la etiqueta o desde la lista) ---------- */
V.punto = async () => {
  const id = S.sub.id, token = S.sub.token;
  const [{ puntos, rutinas, regs }, unis] = await Promise.all([datosRondas(id), q(sb.from('punto_unidades').select('unidad_id, unidades(codigo)').eq('punto_id', id))]);
  const p = puntos[0];
  if (!p) return '<div class="card">No encontramos este piso o no tienes acceso.</div>';
  const personal = esPersonal();
  const conEtiqueta = !!token;
  const fila = r => { const e = estadoRutina(r, regs); const toca = r.dias.includes(hoyDow());
    const puedeMarcar = !e.reg && toca && personal && (conEtiqueta || W());
    return `<div class="card stack" style="gap:8px">
      <div class="row"><div class="grow"><h3>${esc(r.nombre)}</h3><div class="sub">${esc(r.tipo)} · ${diasTexto(r.dias)}${r.hora_limite ? ' · antes de ' + horaCorta(r.hora_limite) : ''}${r.foto_requerida ? ' · exige foto' : ''}</div></div><span class="chip ${e.k}">${e.t}</span></div>
      ${e.reg ? `<div class="sub">Por ${esc(e.reg.quien || 'personal')}${e.reg.via === 'manual' ? ' · registrado por la administración' : ' · en sitio con NFC'}${e.reg.nota ? ' · ' + esc(e.reg.nota) : ''}</div>${fotosHTML(e.reg.foto ? [e.reg.foto] : [])}` : ''}
      ${puedeMarcar ? `<form class="form" data-form="marcarRutina" data-id="${r.id}">
        <div><label>Foto ${r.foto_requerida ? '(obligatoria)' : '(opcional)'}</label><input name="foto" type="file" accept="image/*" capture="environment" ${r.foto_requerida ? 'required' : ''}></div>
        <div><label>Nota (opcional)</label><input name="nota" placeholder="Ej. se cambió un bombillo"></div>
        <button class="btn" type="submit">${conEtiqueta ? 'Marcar como realizado' : 'Registrar manualmente (administración)'}</button></form>` : ''}
      ${!e.reg && toca && personal && !conEtiqueta && !W() ? '<div class="alert">Para registrarlo, acerca el celular a la etiqueta NFC de este piso.</div>' : ''}
      ${W() ? `<div class="row" style="justify-content:flex-end"><button class="btn sm ghost danger-t" data-act="borrar" data-tabla="rutinas" data-id="${r.id}" data-confirm="¿Borrar rutina?">Borrar rutina</button></div>` : ''}
    </div>`; };
  const historial = regs.slice(0, 20);
  return `<div class="stack">
  ${R() ? '' : '<button class="btn sm ghost" data-act="volverPunto" style="align-self:flex-start">‹ Volver</button>'}
  <div class="card"><div class="eyebrow">${conEtiqueta ? 'Etiqueta NFC verificada' : 'Piso o zona'}</div><h2 style="margin-top:2px">${esc(p.nombre)}</h2>${p.descripcion ? `<div class="sub">${esc(p.descripcion)}</div>` : ''}
    ${!R() ? `<div class="sub" style="margin-top:4px">Avisa a: ${unis.map(u => esc((u.unidades || {}).codigo)).join(', ') || 'ningún apartamento asignado'}</div>` : ''}</div>
  ${rutinas.map(fila).join('') || '<div class="card sub">Este piso aún no tiene rutinas.</div>'}
  ${W() ? `<details class="card" ${rutinas.length ? '' : 'open'}><summary><b>+ Agregar rutina</b></summary><form class="form mt" data-form="rutina" data-punto="${p.id}">
    <div class="two"><div><label>Qué se hace</label><input name="nombre" required placeholder="Aseo de pasillo"></div><div><label>Tipo</label><select name="tipo"><option>Aseo</option><option>Mantenimiento</option><option>Ronda</option><option>Otro</option></select></div></div>
    <div><label>Días</label><div class="diasel">${DIAS.map(([n, l]) => `<label><input type="checkbox" name="d${n}" ${n <= 6 ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div></div>
    <div><label>Hora límite (si no se registra antes, te llega una alerta)</label><input name="hora" type="time" value="10:00"></div>
    <label class="check"><input type="checkbox" name="foto"> Exigir foto como evidencia</label>
    <label class="check"><input type="checkbox" name="notificar" checked> Avisar a los residentes del piso cuando se realice</label>
    <button class="btn" type="submit">Agregar rutina</button></form></details>
  <div class="card stack" style="gap:8px"><h2>Etiqueta NFC del piso</h2>
    <p class="sub" style="margin:0">Pega la etiqueta en un sitio visible del pasillo. El personal la escanea para registrar lo realizado y los residentes, para ver cuándo se hizo el último aseo. Solo con esta etiqueta se puede marcar algo como realizado.</p>
    ${'NDEFReader' in window ? `<button class="btn" data-act="grabarNFCPunto" data-id="${p.id}" style="align-self:flex-start">Grabar etiqueta NFC</button>` : '<div class="sub">Para grabar desde la app usa Chrome en un celular Android, o graba este enlace con cualquier app de NFC:</div>'}
    <div class="mono" id="pt-url" style="user-select:all;word-break:break-all;font-size:11px"></div>
    <div id="pt-qr" class="qrbox" style="align-self:center"></div><div class="sub" style="text-align:center">También puedes imprimir este QR como respaldo de la etiqueta.</div></div>
  <details class="card"><summary><b>Apartamentos que reciben el aviso</b> <span class="sub">(${unis.length})</span></summary><form class="form mt" data-form="unidadesPunto" data-id="${p.id}"><input name="patron" value="${esc(unis.map(u => (u.unidades || {}).codigo).join(', '))}"><p class="sub" style="margin:0">Escribe un prefijo (T1-7) o la lista separada por comas. Reemplaza la lista actual.</p><button class="btn sm" type="submit" style="align-self:flex-start">Guardar</button></form></details>
  <button class="btn sm ghost danger-t" data-act="borrarPunto" data-id="${p.id}" data-confirm="¿Borrar piso y sus registros?" style="align-self:flex-start">Borrar este piso</button>` : ''}
  <div class="card"><h2>Últimos registros</h2><div class="list" style="margin-top:6px">${historial.map(g => { const r = rutinas.find(x => x.id === g.rutina_id) || {}; return `<div class="item"><div class="grow"><div class="row"><h3>${esc(r.nombre || 'Rutina')}</h3><span class="sub">${fechaHora(g.hecho_at)}</span></div><div class="sub">${esc(g.quien || '')}${g.via === 'manual' ? ' · manual' : ''}${g.nota ? ' · ' + esc(g.nota) : ''}</div>${fotosHTML(g.foto ? [g.foto] : [])}</div></div>`; }).join('') || '<div class="sub" style="padding-top:6px">Sin registros en las últimas dos semanas.</div>'}</div></div>
  </div>`;
};
AFTER.punto = async () => {
  if (!W() || !$('pt-qr')) return;
  const t = await sb.rpc('token_punto', { p: S.sub.id });
  const url = urlPunto(S.sub.id, t.data);
  if ($('pt-url')) $('pt-url').textContent = url;
  if (window.QRCode) new QRCode($('pt-qr'), { text: url, width: 160, height: 160, correctLevel: QRCode.CorrectLevel.M });
};

/* ---------- rondas del operario ---------- */
V.rondas = async () => {
  const { puntos, rutinas, regs } = await datosRondas();
  const hoyR = rutinas.filter(r => r.dias.includes(hoyDow()));
  const pend = hoyR.filter(r => !regs.some(g => g.rutina_id === r.id && g.fecha === HOY()));
  const orden = { bad: 0, warn: 1, '': 2, ok: 3 };
  return `<div class="stack">
  <div class="card stack alertcard" style="gap:6px"><div class="row"><h2>Rondas de hoy</h2><span class="chip ${pend.length ? 'warn' : 'ok'}">${hoyR.length - pend.length}/${hoyR.length}</span></div>
    <p style="margin:0">En cada piso, <b>acerca el celular a la etiqueta NFC</b>. Se abre la lista de ese piso; toma la foto y marca lo realizado. Los residentes reciben el aviso.</p></div>
  ${puntos.map(p => { const rs = hoyR.filter(r => r.punto_id === p.id).map(r => ({ r, e: estadoRutina(r, regs) })).sort((a, b) => orden[a.e.k] - orden[b.e.k]); if (!rs.length) return ''; return `<div class="card"><h3>${esc(p.nombre)}</h3>${rs.map(({ r, e }) => `<div class="row" style="margin-top:6px"><span class="sub" style="color:var(--ink)">${esc(r.nombre)}</span><span class="chip ${e.k}">${e.t}</span></div>`).join('')}</div>`; }).join('') || '<div class="card sub">No hay rondas programadas para hoy.</div>'}</div>`;
};

/* ---------- residente: mi piso ---------- */
V.mipiso = async () => {
  const pus = await q(sb.from('punto_unidades').select('punto_id').eq('unidad_id', U()));
  if (!pus.length) return '<div class="stack"><h2>Mi piso</h2><div class="card sub">La administración aún no ha configurado el control de aseo y mantenimiento de tu piso.</div></div>';
  const ids = pus.map(x => x.punto_id);
  const [puntos, rutinas, regs] = await Promise.all([
    q(sb.from('puntos').select(COLS_PUNTO).in('id', ids)),
    q(sb.from('rutinas').select('*').in('punto_id', ids).eq('activa', true)),
    q(sb.from('rutina_registros').select('*').in('punto_id', ids).gte('fecha', addDays(HOY(), -14)).order('hecho_at', { ascending: false }))
  ]);
  return `<div class="stack"><h2>Mi piso</h2>${puntos.map(p => `<div class="card stack" style="gap:6px"><h3>${esc(p.nombre)}</h3>
    ${rutinas.filter(r => r.punto_id === p.id).map(r => { const e = estadoRutina(r, regs); const ult = regs.find(g => g.rutina_id === r.id); return `<div class="item"><div class="grow"><div class="row"><h3>${esc(r.nombre)}</h3><span class="chip ${e.k}">${e.t}</span></div>
      <div class="sub">${diasTexto(r.dias)}${r.hora_limite ? ' · antes de ' + horaCorta(r.hora_limite) : ''}${ult && !e.reg ? ' · último: ' + fechaHora(ult.hecho_at) : ''}</div>${e.reg ? fotosHTML(e.reg.foto ? [e.reg.foto] : []) : ''}</div></div>`; }).join('')}
    <button class="btn sm ghost" data-act="reportarPiso" data-n="${esc(p.nombre)}" style="align-self:flex-start">Reportar algo en este piso</button></div>`).join('')}</div>`;
};

/* ---------- ganchos ---------- */
const _rmas2 = V.rmas;
V.rmas = async () => (await _rmas2()).replace('<h2>Más</h2>', `<h2>Más</h2><button class="card navcard" data-act="tab" data-v="mipiso"><div class="ico">${svg('mipiso')}</div><div class="grow"><h3>Mi piso</h3><div class="sub">Cuándo se hizo el aseo y el mantenimiento de tu piso</div></div><span class="sub">›</span></button>`);

const _rutaQR2 = rutaQR;
rutaQR = async function () {
  const m = /^#punto-([0-9a-f-]{36})(?:-([0-9a-f]+))?$/i.exec(location.hash);
  if (!m) return _rutaQR2();
  history.replaceState(null, '', location.pathname);
  const [, id, token] = m;
  const p = await sb.from('puntos').select('id, conjunto_id').eq('id', id).maybeSingle();
  if (!p.data) { toast('Esta etiqueta es de un conjunto al que no tienes acceso.'); return false; }
  const de = S.ctxs.filter(c => c.conjunto_id === p.data.conjunto_id);
  const ctx = ['operario', 'porteria', 'proveedor', 'admin', 'consejo', 'residente'].map(r => de.find(c => c.rol === r)).find(Boolean);
  if (!ctx) return false;
  setCtx(ctx); go('punto', { id, token: ['operario', 'porteria', 'proveedor', 'admin'].includes(ctx.rol) ? token : null });
  return true;
};
// Si la app ya estaba abierta cuando se escanea la etiqueta
window.addEventListener('hashchange', () => { if (S.user && /^#(punto|activo)-/.test(location.hash)) rutaQR(); });

/* ---------- acciones y formularios ---------- */
Object.assign(ACT, {
  grabarNFCPunto: async d => {
    try {
      const t = await q(sb.rpc('token_punto', { p: d.id }));
      const nd = new NDEFReader(); toast('Acerca la etiqueta NFC al celular…', 8000);
      await nd.write({ records: [{ recordType: 'url', data: urlPunto(d.id, t) }] });
      toast('Etiqueta grabada. Pégala en el piso.');
    } catch (e) { toast('No se pudo grabar: ' + (e.message || e)); }
  },
  volverPunto: () => ['admin', 'consejo'].includes(ROL()) ? go('mant', { t: 'rondas' }) : go(inicioDe(S.ctx)),
  borrarPunto: async d => { await q(sb.from('puntos').delete().eq('id', d.id)); toast('Piso borrado'); go('mant', { t: 'rondas' }); },
  reportarPiso: d => go('reportar', { cat: 'Aseo', activoUbic: d.n })
});

async function asignarUnidades(puntoId, patron) {
  const unis = await q(sb.from('unidades').select('id, codigo').eq('conjunto_id', C()));
  const partes = String(patron || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  const elegidas = unis.filter(u => partes.some(pt => u.codigo.toUpperCase() === pt || (partes.length === 1 && u.codigo.toUpperCase().startsWith(pt))));
  await q(sb.from('punto_unidades').delete().eq('punto_id', puntoId));
  if (elegidas.length) await q(sb.from('punto_unidades').insert(elegidas.map(u => ({ punto_id: puntoId, unidad_id: u.id }))));
  return elegidas.length;
}

Object.assign(FORM, {
  punto: async f => {
    const p = await q(sb.from('puntos').insert({ conjunto_id: C(), nombre: f.nombre.trim(), torre: f.torre || null, piso: f.piso || null, descripcion: f.descripcion || null }).select('id').single());
    const n = await asignarUnidades(p.id, f.patron);
    toast(`Piso agregado · ${n} apartamento(s) recibirán los avisos`); go('punto', { id: p.id });
  },
  unidadesPunto: async (f, form) => { const n = await asignarUnidades(form.dataset.id, f.patron); toast(n + ' apartamento(s) asignados'); render(); },
  rutina: async (f, form) => {
    const dias = DIAS.map(([n]) => n).filter(n => f['d' + n]);
    if (!dias.length) throw new Error('Escoge al menos un día.');
    await q(sb.from('rutinas').insert({ conjunto_id: C(), punto_id: form.dataset.punto, nombre: f.nombre, tipo: f.tipo, dias, hora_limite: f.hora || null, foto_requerida: !!f.foto, notificar: !!f.notificar }));
    toast('Rutina agregada'); render();
  },
  marcarRutina: async (f, form) => {
    const foto = await subir(form.foto.files[0], 'rondas');
    await q(sb.rpc('marcar_rutina', { p_rutina: form.dataset.id, p_token: S.sub.token || null, p_foto: foto, p_nota: f.nota || null }));
    toast('Registrado. Los residentes del piso ya recibieron el aviso.', 4000); render();
  }
});
