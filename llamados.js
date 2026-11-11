/* =====================================================================
   SYAPH360 · Llamados de atención con debido proceso (Ley 675 de 2001)
   Depende de app.js y los módulos anteriores.
   ===================================================================== */

Object.assign(ICONS, {
  llamados: '<path d="M12 3l9 16H3z"/><path d="M12 10v4M12 16.5v.5"/>',
  misllamados: '<path d="M4 4h16v13H8l-4 4z"/><path d="M12 8v3M12 13.5v.5"/>'
});
VISTAS_VIVAS.push('llamados', 'llamado', 'misllamados');

const CAT_LL = ['Ruido', 'Mascotas', 'Parqueadero', 'Basuras', 'Obras', 'Zonas comunes', 'Convivencia', 'Seguridad', 'Otro'];
const chipLl = { 'Enviado': 'warn', 'Leído': 'info', 'Con descargos': 'warn', 'Decidido': 'ok', 'Impugnado': 'bad', 'Cerrado': '' };
const venceDescargos = l => { const d = l.created_at ? new Date(l.created_at) : new Date(); d.setDate(d.getDate() + (Number(l.plazo_dias) || 5)); return d; };
const enPlazo = l => new Date() <= venceDescargos(l);

function cartaLlamado(l, conj, uni) {
  const fechaCarta = new Date(l.created_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
  const vence = venceDescargos(l).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
  const intro = l.tipo === 'Proceso sancionatorio'
    ? 'Por medio de la presente le informamos la apertura de un proceso sancionatorio por los hechos que se describen a continuación, en los términos del reglamento de propiedad horizontal y la Ley 675 de 2001.'
    : l.tipo === 'Requerimiento'
      ? 'Por medio de la presente le requerimos por escrito para que se ajuste a las normas de convivencia de la copropiedad, en relación con los hechos que se describen a continuación.'
      : 'Por medio de la presente le hacemos un llamado de atención respetuoso en relación con los hechos que se describen a continuación.';
  return `<div class="carta">
    <div class="sub">${esc(conj.ciudad || '')}${conj.ciudad ? ', ' : ''}${fechaCarta}</div>
    <p><b>Señores<br>Propietarios y residentes<br>Unidad ${esc(uni.codigo || '')}</b><br>${esc(conj.nombre || '')}</p>
    <p><b>Asunto:</b> ${esc(l.tipo)} n.º ${l.numero} · ${esc(l.categoria)}</p>
    <p>Respetados señores:</p>
    <p>${intro}</p>
    <p><b>Hechos${l.fecha_hechos ? ' (' + fecha(l.fecha_hechos) + ')' : ''}:</b> ${nl(l.hechos)}</p>
    ${l.norma ? `<p><b>Norma que se incumple:</b> ${esc(l.norma)}</p>` : ''}
    <p>${l.tipo === 'Proceso sancionatorio' ? 'Usted tiene derecho a presentar sus descargos y las pruebas que considere' : 'Le solicitamos corregir esta situación. Si no está de acuerdo, puede presentar sus descargos'} hasta el <b>${vence}</b> (${l.plazo_dias} días), desde esta misma aplicación.${l.tipo === 'Proceso sancionatorio' ? ' La decisión la tomará el órgano competente según el reglamento, y de imponerse una sanción podrá impugnarla dentro del mes siguiente a su comunicación.' : ''}</p>
    <p>Cordialmente,</p>
    <p><b>Administración</b><br>${esc(conj.nombre || '')}</p></div>`;
}

/* ---------- administración ---------- */
V.llamados = async () => {
  const f = S.sub.f || 'abiertos';
  const [lista, unis, reps] = await Promise.all([
    q(sb.from('llamados').select('*, unidades(codigo, propietario)').eq('conjunto_id', C()).order('created_at', { ascending: false }).limit(200)),
    W() ? q(sb.from('unidades').select('id, codigo, propietario').eq('conjunto_id', C()).order('codigo')) : Promise.resolve([]),
    W() ? q(sb.from('reportes').select('id, numero, titulo, categoria, descripcion, fotos, created_at').eq('conjunto_id', C()).in('categoria', ['Convivencia', 'Mascotas', 'Parqueadero', 'Aseo', 'Seguridad', 'Daño', 'Otro']).order('created_at', { ascending: false }).limit(20)) : Promise.resolve([])
  ]);
  const abiertos = lista.filter(l => !['Decidido', 'Cerrado'].includes(l.estado) || l.estado === 'Impugnado');
  const porDecidir = lista.filter(l => !l.decision && (l.descargos_at || !enPlazo(l)));
  const anio = HOY().slice(0, 4);
  const multas = lista.filter(l => l.decision === 'Multa' && (l.decision_at || '').startsWith(anio)).reduce((s, l) => s + Number(l.multa_valor || 0), 0);
  const conteo = {}; lista.filter(l => l.created_at >= addDays(HOY(), -365)).forEach(l => { const k = (l.unidades || {}).codigo; conteo[k] = (conteo[k] || 0) + 1; });
  const reinc = Object.entries(conteo).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const vis = f === 'abiertos' ? abiertos : f === 'decidir' ? porDecidir : lista;
  const prevDe = id => lista.filter(l => l.unidad_id === id).length;
  return `<div class="stack"><h2>Llamados de atención</h2>
  <div class="kpis">
    <div class="kpi"><div class="v">${abiertos.length}</div><div class="l">Casos abiertos</div></div>
    <div class="kpi"><div class="v" style="color:${porDecidir.length ? 'var(--warn)' : 'inherit'}">${porDecidir.length}</div><div class="l">Listos para decidir (con descargos o plazo vencido)</div></div>
    <div class="kpi"><div class="v">${lista.filter(l => (l.created_at || '').startsWith(anio)).length}</div><div class="l">Llamados en ${anio}</div></div>
    <div class="kpi"><div class="v">${millones(multas)}</div><div class="l">Multas impuestas en ${anio}</div></div>
  </div>
  ${reinc.length ? `<div class="card"><h3>Reincidencia (últimos 12 meses)</h3><div class="row" style="justify-content:flex-start;gap:6px;flex-wrap:wrap;margin-top:6px">${reinc.map(([u, n]) => `<span class="chip bad">${esc(u)} · ${n}</span>`).join('')}</div></div>` : ''}
  ${W() ? `<details class="card" ${S.sub.nuevo ? 'open' : ''}><summary><b>+ Nuevo llamado de atención</b></summary><form class="form mt" data-form="llamado">
    <div class="two"><div><label>Unidad</label><select name="unidad" required><option value="">Escoge…</option>${unis.map(u => `<option value="${u.id}" ${S.sub.unidad === u.id ? 'selected' : ''}>${esc(u.codigo)}${u.propietario ? ' · ' + esc(u.propietario) : ''}${prevDe(u.id) ? ` (${prevDe(u.id)} previo${prevDe(u.id) > 1 ? 's' : ''})` : ''}</option>`).join('')}</select></div>
    <div><label>Tipo</label><select name="tipo" data-chg="tipoLlamado"><option ${S.sub.tipo === 'Llamado de atención' ? 'selected' : ''}>Llamado de atención</option><option ${S.sub.tipo === 'Requerimiento' ? 'selected' : ''}>Requerimiento</option><option ${S.sub.tipo === 'Proceso sancionatorio' ? 'selected' : ''}>Proceso sancionatorio</option></select></div></div>
    <div class="two"><div><label>Motivo</label><select name="categoria">${CAT_LL.map(c => `<option ${S.sub.categoria === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div><div><label>Fecha de los hechos</label><input name="fecha_hechos" type="date" max="${HOY()}" value="${S.sub.fecha || ''}"></div></div>
    ${reps.length ? `<div><label>Tomar los hechos de un reporte (opcional)</label><select name="reporte"><option value="">Ninguno</option>${reps.map(r => `<option value="${r.id}">#${r.numero} · ${esc(r.titulo)} · ${fecha(r.created_at)}</option>`).join('')}</select></div>` : ''}
    <div><label>Hechos</label><textarea name="hechos" rows="4" placeholder="Qué pasó, cuándo y dónde, de forma objetiva" >${esc(S.sub.hechos || '')}</textarea></div>
    <div><label>Norma que se incumple</label><input name="norma" placeholder="Ej. Art. 25 del manual de convivencia: horario de ruido" value="${esc(S.sub.norma || '')}"></div>
    <div class="two"><div><label>Plazo para corregir o descargos (días)</label><input name="plazo" type="number" min="1" max="60" value="5" required></div><div><label>Evidencias (fotos)</label><input name="fotos" type="file" accept="image/*" multiple></div></div>
    <p class="sub" style="margin:0">Para imponer una multa o una restricción, primero debe existir un llamado o requerimiento escrito con plazo, y luego se abre el proceso sancionatorio (art. 59 y 60, Ley 675). Ajusta los plazos a tu reglamento.</p>
    <button class="btn" type="submit">Enviar a la unidad</button></form></details>` : ''}
  <div class="seg" role="group" aria-label="Filtro">${[['abiertos', 'Abiertos'], ['decidir', 'Por decidir'], ['todos', 'Todos']].map(([k, l]) => `<button data-act="sub" data-k="f" data-v="${k}" aria-pressed="${f === k}">${l}</button>`).join('')}</div>
  ${vis.map(l => `<button class="card navcard" data-act="sub2" data-view="llamado" data-id="${l.id}" style="align-items:flex-start"><div class="ico">${esc(((l.unidades || {}).codigo || '?').slice(-3))}</div><div class="grow">
    <div class="row"><h3>${esc(l.tipo)} #${l.numero} · ${esc((l.unidades || {}).codigo)}</h3><span class="chip ${chipLl[l.estado]}">${l.decision || l.estado}</span></div>
    <div class="sub">${esc(l.categoria)} · ${fecha(l.created_at)} · ${l.leido_at ? 'leído ' + fecha(l.leido_at) : 'sin leer'}${l.descargos_at ? ' · con descargos' : !l.decision ? (enPlazo(l) ? ' · plazo hasta ' + fecha(venceDescargos(l).toISOString()) : ' · plazo vencido') : ''}</div>
    <div class="sub ell" style="margin-top:2px">${esc(l.hechos)}</div></div></button>`).join('') || '<div class="card sub">No hay llamados en este filtro.</div>'}
  <div class="card sub">Esta guía sigue la Ley 675 de 2001. Antes de sancionar, revisa que el procedimiento y el órgano competente coincidan con el reglamento de tu copropiedad; ante dudas, consulta con un abogado.</div></div>`;
};

V.llamado = async () => {
  const l = await q(sb.from('llamados').select('*, unidades(codigo, propietario)').eq('id', S.sub.id).maybeSingle());
  if (!l) return '<div class="card">No encontramos este llamado.</div>';
  const [conj, cuota] = await Promise.all([
    q(sb.from('conjuntos').select('nombre, ciudad').eq('id', l.conjunto_id).maybeSingle()),
    W() && !l.decision ? q(sb.from('v_saldos').select('cuota').eq('unidad_id', l.unidad_id).maybeSingle()) : Promise.resolve(null)
  ]);
  const sancion = ['Multa', 'Restricción de uso'].includes(l.decision);
  const puedeImpugnar = R() && sancion && !l.impugnacion_at && l.decision_at && (new Date() - new Date(l.decision_at)) < 30 * 864e5;
  const tope = cuota && cuota.cuota ? 2 * Number(cuota.cuota) : null;
  const paso = (ok, t, d) => pasoHTML(ok, t, d);
  return `<div class="stack">
  <button class="btn sm ghost" data-act="tab" data-v="${R() ? 'misllamados' : 'llamados'}" style="align-self:flex-start">‹ Volver</button>
  <div class="card stack" style="gap:6px"><div class="row"><span class="mono" style="color:var(--muted)">${esc(l.tipo)} #${l.numero}</span><span class="chip ${chipLl[l.estado]}">${l.decision || l.estado}</span></div>
    ${!R() ? `<h2>${esc((l.unidades || {}).codigo)}${(l.unidades || {}).propietario ? ' · ' + esc(l.unidades.propietario) : ''}</h2>` : ''}</div>
  <div class="card">${cartaLlamado(l, conj || {}, l.unidades || {})}${fotosHTML(l.evidencias)}</div>
  <div class="card"><h2>Seguimiento</h2><div class="pasos">
    ${paso(true, 'Enviado a la unidad', fechaHora(l.created_at))}
    ${paso(!!l.leido_at, 'Leído por la unidad', l.leido_at ? fechaHora(l.leido_at) : 'Aún no lo han abierto')}
    ${paso(!!l.descargos_at, 'Descargos', l.descargos_at ? fechaHora(l.descargos_at) : (enPlazo(l) ? 'Plazo hasta ' + fecha(venceDescargos(l).toISOString()) : 'No presentó descargos'))}
    ${paso(!!l.decision, 'Decisión', l.decision ? `${l.decision} · ${esc(l.organo || '')}${l.acta ? ', acta ' + esc(l.acta) : ''} · ${fechaHora(l.decision_at)}` : '')}
    ${sancion ? paso(!!l.impugnacion_at, 'Impugnación', l.impugnacion_at ? fechaHora(l.impugnacion_at) : 'Hasta un mes después de la decisión') : ''}
  </div></div>
  ${l.descargos ? `<div class="card"><h2>Descargos de la unidad</h2><p style="margin:6px 0 0">${nl(l.descargos)}</p>${fotosHTML(l.descargos_fotos)}</div>` : ''}
  ${l.decision ? `<div class="card stack" style="gap:6px"><h2>Decisión: ${esc(l.decision)}</h2>${l.decision_texto ? `<p style="margin:0">${nl(l.decision_texto)}</p>` : ''}
    ${l.decision === 'Multa' ? `<div class="alert">Multa de <b>${fmt(l.multa_valor)}</b>, cargada al estado de cuenta de la unidad.</div>` : ''}
    ${l.decision === 'Restricción de uso' ? `<div class="alert">Restricción: <b>${esc(l.restriccion || 'zonas comunes no esenciales')}</b> hasta el ${fecha(l.restriccion_hasta)}. Las reservas de la unidad quedan bloqueadas en ese periodo.</div>` : ''}
    ${l.impugnacion ? `<div class="resp"><b>Impugnación:</b> ${nl(l.impugnacion)}</div>` : ''}</div>` : ''}
  ${R() && !l.decision ? `<form class="card form" data-form="descargos" data-id="${l.id}"><h2>${l.descargos ? 'Actualizar mis descargos' : 'Presentar descargos'}</h2>
    <p class="sub" style="margin:0">Cuenta tu versión de los hechos y adjunta pruebas si las tienes. ${enPlazo(l) ? 'Tienes plazo hasta el ' + fecha(venceDescargos(l).toISOString()) + '.' : 'El plazo ya venció, pero aún puedes enviarlos mientras no haya decisión.'}</p>
    <textarea name="texto" rows="4" required>${esc(l.descargos || '')}</textarea><div><label>Pruebas (fotos)</label><input name="fotos" type="file" accept="image/*" multiple></div>
    <button class="btn" type="submit">Enviar descargos</button></form>` : ''}
  ${puedeImpugnar ? `<form class="card form" data-form="impugnar" data-id="${l.id}"><h2>Impugnar la sanción</h2><p class="sub" style="margin:0">Tienes hasta el ${fecha(new Date(new Date(l.decision_at).getTime() + 30 * 864e5).toISOString())} (art. 62, Ley 675).</p><textarea name="texto" rows="4" required placeholder="Motivos por los que no estás de acuerdo"></textarea><button class="btn" type="submit">Enviar impugnación</button></form>` : ''}
  ${W() && !l.decision ? `<form class="card form" data-form="decidir" data-id="${l.id}"><h2>Registrar decisión</h2>
    ${!l.descargos_at && enPlazo(l) ? `<div class="alert">La unidad tiene plazo para descargos hasta el ${fecha(venceDescargos(l).toISOString())}. Puedes archivar o mantener el llamado, pero una sanción solo se decide cuando venza el plazo o lleguen los descargos.</div>` : ''}
    <div class="two"><div><label>Decisión</label><select name="decision" required data-chg="decisionLl"><option>Archivado</option><option>Se mantiene el llamado</option>${l.tipo === 'Proceso sancionatorio' ? '<option>Multa</option><option>Restricción de uso</option>' : ''}</select></div>
    <div><label>Quién decide</label><select name="organo"><option>Administración</option><option>Consejo de administración</option><option>Asamblea general</option></select></div></div>
    <div class="two"><div><label>Número de acta</label><input name="acta" placeholder="Obligatorio para sanciones"></div><div><label>Valor de la multa</label><input name="multa" type="number" min="0" step="1000" placeholder="${tope ? 'Máximo ' + fmt(tope) : ''}"></div></div>
    <div class="two"><div><label>Restricción (zonas no esenciales)</label><input name="restriccion" placeholder="Salón social, BBQ, piscina"></div><div><label>Restricción hasta</label><input name="hasta" type="date" min="${HOY()}"></div></div>
    <div><label>Explicación de la decisión</label><textarea name="texto" rows="3" required placeholder="Lo que se analizó y por qué se decide así"></textarea></div>
    ${l.tipo !== 'Proceso sancionatorio' ? '<p class="sub" style="margin:0">Si la conducta persiste, abre un proceso sancionatorio para poder multar o restringir.</p>' : `<p class="sub" style="margin:0">Las multas no pueden superar 2 cuotas mensuales cada una ni 10 en total (art. 59). Solo las impone la asamblea, o el consejo si el reglamento lo faculta (art. 60).</p>`}
    <button class="btn" type="submit">Registrar decisión y notificar</button></form>
    ${l.tipo !== 'Proceso sancionatorio' ? `<button class="btn ghost" data-act="abrirProceso" data-id="${l.id}">Abrir proceso sancionatorio por estos hechos</button>` : ''}` : ''}
  ${W() && l.decision && l.estado !== 'Cerrado' ? `<button class="btn ghost" data-act="cerrarLlamado" data-id="${l.id}" data-confirm="¿Cerrar el caso?" style="align-self:flex-start">Cerrar el caso</button>` : ''}
  </div>`;
};
AFTER.llamado = () => { if (R()) sb.rpc('acusar_llamado', { p_id: S.sub.id }); };

/* ---------- residente ---------- */
V.misllamados = async () => {
  const lista = await q(sb.from('llamados').select('*').eq('unidad_id', U()).order('created_at', { ascending: false }));
  return `<div class="stack"><h2>Comunicaciones de la administración</h2>${lista.map(l => `<button class="card navcard" data-act="sub2" data-view="llamado" data-id="${l.id}"><div class="ico">${svg('misllamados')}</div><div class="grow">
    <div class="row"><h3>${esc(l.tipo)} #${l.numero}</h3><span class="chip ${l.leido_at ? chipLl[l.estado] : 'warn'}">${l.leido_at ? (l.decision || l.estado) : 'Sin leer'}</span></div>
    <div class="sub">${esc(l.categoria)} · ${fecha(l.created_at)}${!l.decision && !l.descargos_at ? ' · plazo hasta ' + fecha(venceDescargos(l).toISOString()) : ''}</div></div></button>`).join('') || '<div class="card sub">No tienes llamados de atención. ¡Gracias por tu buena convivencia!</div>'}</div>`;
};

/* ---------- ganchos ---------- */
const _mas3 = V.mas;
V.mas = async () => (await _mas3()).replace('<h2>Más</h2>', `<h2>Más</h2><button class="card navcard" data-act="tab" data-v="llamados"><div class="ico">${svg('llamados')}</div><div class="grow"><h3>Llamados de atención</h3><div class="sub">Requerimientos, descargos y sanciones con debido proceso</div></div><span class="sub">›</span></button>`);
const _rmas3 = V.rmas;
V.rmas = async () => (await _rmas3()).replace('<h2>Más</h2>', `<h2>Más</h2><button class="card navcard" data-act="tab" data-v="misllamados"><div class="ico">${svg('misllamados')}</div><div class="grow"><h3>Comunicaciones y llamados</h3><div class="sub">Llamados de atención de la administración y tus descargos</div></div><span class="sub">›</span></button>`);
const _rinicio2 = V.rinicio;
V.rinicio = async () => {
  const sinLeer = await q(sb.from('llamados').select('id, tipo, numero').eq('unidad_id', U()).is('leido_at', null));
  return sinLeer.map(l => `<div class="alert alert-bad"><b>Tienes un ${esc(l.tipo.toLowerCase())} de la administración (#${l.numero}).</b> <button class="btn sm" data-act="sub2" data-view="llamado" data-id="${l.id}" style="margin-top:6px">Leer</button></div>`).join('') + await _rinicio2();
};

/* ---------- acciones y formularios ---------- */
Object.assign(ACT, {
  abrirProceso: async d => {
    const l = await q(sb.from('llamados').select('*').eq('id', d.id).single());
    go('llamados', { nuevo: true, unidad: l.unidad_id, tipo: 'Proceso sancionatorio', categoria: l.categoria, hechos: 'Persistencia de los hechos del ' + l.tipo.toLowerCase() + ' #' + l.numero + ' (' + fecha(l.created_at) + '): ' + l.hechos, norma: l.norma || '' });
  },
  cerrarLlamado: async d => { await q(sb.from('llamados').update({ estado: 'Cerrado' }).eq('id', d.id)); toast('Caso cerrado'); render(); }
});
Object.assign(CHG, { tipoLlamado: () => { }, decisionLl: () => { } });
Object.assign(FORM, {
  llamado: async (f, form) => {
    let hechos = (f.hechos || '').trim(), evid = [];
    if (f.reporte) { const r = await q(sb.from('reportes').select('titulo, descripcion, fotos').eq('id', f.reporte).single()); if (!hechos) hechos = r.titulo + (r.descripcion ? '. ' + r.descripcion : ''); evid = r.fotos || []; }
    if (!hechos) throw new Error('Describe los hechos.');
    evid = evid.concat(await subirVarias(form.fotos.files, 'llamados', 6));
    const l = await q(sb.from('llamados').insert({ conjunto_id: C(), unidad_id: f.unidad, tipo: f.tipo, categoria: f.categoria, fecha_hechos: f.fecha_hechos || null, hechos, norma: f.norma || null, plazo_dias: Number(f.plazo) || 5, evidencias: evid, reporte_id: f.reporte || null }).select('id, numero').single());
    toast(`${f.tipo} #${l.numero} enviado. La unidad ya recibió el aviso.`, 4000); go('llamado', { id: l.id });
  },
  descargos: async (f, form) => {
    const fotos = await subirVarias(form.fotos.files, 'llamados', 4);
    await q(sb.rpc('descargos_llamado', { p_id: form.dataset.id, p_texto: f.texto, p_fotos: fotos }));
    toast('Descargos enviados a la administración'); render();
  },
  impugnar: async (f, form) => { await q(sb.rpc('impugnar_llamado', { p_id: form.dataset.id, p_texto: f.texto })); toast('Impugnación enviada'); render(); },
  decidir: async (f, form) => {
    const cambios = { decision: f.decision, organo: f.organo, acta: f.acta || null, decision_texto: f.texto };
    if (f.decision === 'Multa') cambios.multa_valor = Number(f.multa) || 0;
    if (f.decision === 'Restricción de uso') { cambios.restriccion = f.restriccion || 'Zonas comunes no esenciales'; cambios.restriccion_hasta = f.hasta || null; }
    await q(sb.from('llamados').update(cambios).eq('id', form.dataset.id));
    toast('Decisión registrada y notificada a la unidad'); render();
  }
});
