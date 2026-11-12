/* =====================================================================
   SYAPH360 · Llamados de atención con debido proceso (Ley 675 de 2001)
   Depende de app.js y los módulos anteriores.
   ===================================================================== */

Object.assign(ICONS, {
  llamados: '<path d="M12 3l9 16H3z"/><path d="M12 10v4M12 16.5v.5"/>',
  misllamados: '<path d="M4 4h16v13H8l-4 4z"/><path d="M12 8v3M12 13.5v.5"/>',
  manual: '<path d="M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3z"/><path d="M5 17a3 3 0 013-3h11M9 8h6"/>'
});
VISTAS_VIVAS.push('llamados', 'llamado', 'misllamados');

const CAT_LL = ['Ruido', 'Mascotas', 'Parqueadero', 'Basuras', 'Obras', 'Zonas comunes', 'Convivencia', 'Seguridad', 'Otro'];
const chipLl = { 'Enviado': 'warn', 'Leído': 'info', 'Con descargos': 'warn', 'Aceptado': 'ok', 'En consejo': 'info', 'Decidido': 'ok', 'Impugnado': 'bad', 'Cerrado': '' };
const GRAVEDAD = ['Leve', 'Grave', 'Gravísima'];
const chipGrav = { 'Leve': 'info', 'Grave': 'warn', 'Gravísima': 'bad' };
const esConsejo = () => ROL() === 'consejo';
let LL_FALTAS = [];
function opcionesFalta(faltas, cat, sel) {
  const fs = cat ? faltas.filter(x => x.categoria === cat) : faltas;
  const otras = cat ? faltas.filter(x => x.categoria !== cat) : [];
  const grupo = (lista, pref) => GRAVEDAD.map(g => { const gs = lista.filter(x => x.gravedad === g); return gs.length ? `<optgroup label="${pref}${g.toLowerCase()}s">${gs.map(x => `<option value="${x.id}" ${sel === x.id ? 'selected' : ''}>${esc(x.articulo)} · ${esc(x.titulo)}</option>`).join('')}</optgroup>` : ''; }).join('');
  return `<option value="">${cat ? (fs.length ? `Escoge la norma de ${cat.toLowerCase()}…` : `El manual no tiene normas de ${cat.toLowerCase()}`) : 'Escoge primero el motivo, o busca aquí la norma…'}</option>`
    + grupo(fs, cat ? cat + ' · faltas ' : 'Faltas ') + (otras.length ? `<optgroup label="── Otras normas del manual ──"></optgroup>` + grupo(otras, 'Otras · faltas ') : '');
}
function borradorHechos(x, f) {
  const cuando = f.fecha_hechos.value ? 'El ' + pd(f.fecha_hechos.value).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }) : 'El día [fecha]';
  const uni = f.unidad.selectedOptions[0] && f.unidad.value ? 'la unidad ' + f.unidad.selectedOptions[0].text.split(' · ')[0].replace(/ \(.*$/, '') : 'la unidad';
  return `${cuando}, aproximadamente a las [hora], se evidenció que ${uni} incurrió en: ${x.titulo.toLowerCase().replace(/\.+$/, "")}. [Describe lo ocurrido: lugar, quién lo reportó y evidencias.] Esta conducta es contraria a lo establecido en el ${x.articulo} del manual de convivencia.`;
}
const venceDescargos = l => { const d = l.created_at ? new Date(l.created_at) : new Date(); d.setDate(d.getDate() + (Number(l.plazo_dias) || 5)); return d; };
const enPlazo = l => new Date() <= venceDescargos(l);

function cartaLlamado(l, conj, uni, falta) {
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
    ${falta ? `<p><b>Norma del manual de convivencia que se incumple:</b> ${esc(falta.articulo)} · ${esc(falta.titulo)}${falta.descripcion ? `<br><i>“${nl(falta.descripcion)}”</i>` : ''}</p><p><b>Calificación:</b> falta ${esc((l.gravedad || falta.gravedad || '').toLowerCase())}.${falta.sancion ? ' Sanción prevista en el manual: ' + esc(falta.sancion) + '.' : ''}</p>` : l.norma ? `<p><b>Norma que se incumple:</b> ${esc(l.norma)}</p>` : ''}
    <p>${l.tipo === 'Proceso sancionatorio' ? 'Usted tiene derecho a presentar sus descargos y las pruebas que considere' : 'Le solicitamos corregir esta situación. Puede aceptar la falta y comprometerse a corregirla o, si no está de acuerdo, presentar sus descargos'} hasta el <b>${vence}</b> (${l.plazo_dias} días), desde esta misma aplicación.${l.tipo === 'Proceso sancionatorio' ? ' También puede aceptar la falta y comprometerse a corregirla. La decisión la tomará el consejo de administración o la asamblea, según el reglamento, y de imponerse una sanción podrá impugnarla dentro del mes siguiente a su comunicación.' : ''}</p>
    <p>Cordialmente,</p>
    <p><b>Administración</b><br>${esc(conj.nombre || '')}</p></div>`;
}

/* ---------- administración ---------- */
V.llamados = async () => {
  const f = S.sub.f || 'abiertos';
  const [lista, unis, reps, faltas] = await Promise.all([
    q(sb.from('llamados').select('*, unidades(codigo, propietario)').eq('conjunto_id', C()).order('created_at', { ascending: false }).limit(200)),
    W() ? q(sb.from('unidades').select('id, codigo, propietario').eq('conjunto_id', C()).order('codigo')) : Promise.resolve([]),
    W() ? q(sb.from('reportes').select('id, numero, titulo, categoria, descripcion, fotos, created_at').eq('conjunto_id', C()).in('categoria', ['Convivencia', 'Mascotas', 'Parqueadero', 'Aseo', 'Seguridad', 'Daño', 'Otro']).order('created_at', { ascending: false }).limit(20)) : Promise.resolve([]),
    W() ? q(sb.from('manual_faltas').select('*').eq('conjunto_id', C()).eq('activo', true).order('articulo')) : Promise.resolve([])
  ]);
  LL_FALTAS = faltas;
  const enConsejo = lista.filter(l => l.estado === 'En consejo');
  const abiertos = lista.filter(l => !['Decidido', 'Cerrado'].includes(l.estado) || l.estado === 'Impugnado');
  const porDecidir = lista.filter(l => !l.decision && (l.descargos_at || !enPlazo(l)));
  const anio = HOY().slice(0, 4);
  const multas = lista.filter(l => l.decision === 'Multa' && (l.decision_at || '').startsWith(anio)).reduce((s, l) => s + Number(l.multa_valor || 0), 0);
  const conteo = {}; lista.filter(l => l.created_at >= addDays(HOY(), -365)).forEach(l => { const k = (l.unidades || {}).codigo; conteo[k] = (conteo[k] || 0) + 1; });
  const reinc = Object.entries(conteo).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const vis = f === 'abiertos' ? abiertos : f === 'decidir' ? porDecidir : f === 'consejo' ? enConsejo : lista;
  const prevDe = id => lista.filter(l => l.unidad_id === id).length;
  return `<div class="stack"><div class="row"><h2>Llamados de atención</h2><button class="btn sm ghost" data-act="tab" data-v="manual">${svg('manual').replace('<svg', '<svg width="16" height="16" style="vertical-align:-3px"')} Manual de convivencia</button></div>
  ${esConsejo() && enConsejo.length ? `<div class="alert"><b>${enConsejo.length} ${enConsejo.length === 1 ? 'caso espera' : 'casos esperan'} la decisión del consejo.</b> Ábrelos para revisar los hechos, la respuesta de la unidad y votar.</div>` : ''}
  <div class="kpis">
    <div class="kpi"><div class="v">${abiertos.length}</div><div class="l">Casos abiertos</div></div>
    <div class="kpi"><div class="v" style="color:${porDecidir.length ? 'var(--warn)' : 'inherit'}">${porDecidir.length}</div><div class="l">Listos para decidir (con descargos o plazo vencido)</div></div>
    <div class="kpi"><div class="v">${lista.filter(l => (l.created_at || '').startsWith(anio)).length}</div><div class="l">Llamados en ${anio}</div></div>
    <div class="kpi"><div class="v">${millones(multas)}</div><div class="l">Multas impuestas en ${anio}</div></div>
  </div>
  ${reinc.length ? `<div class="card"><h3>Reincidencia (últimos 12 meses)</h3><div class="row" style="justify-content:flex-start;gap:6px;flex-wrap:wrap;margin-top:6px">${reinc.map(([u, n]) => `<span class="chip bad">${esc(u)} · ${n}</span>`).join('')}</div></div>` : ''}
  ${W() ? `<details class="card" ${S.sub.nuevo ? 'open' : ''}><summary><b>+ Nuevo llamado de atención</b></summary><form class="form mt" data-form="llamado">
    <div class="two"><div><label>Unidad</label><select name="unidad" required data-chg="fechaLl"><option value="">Escoge…</option>${unis.map(u => `<option value="${u.id}" ${S.sub.unidad === u.id ? 'selected' : ''}>${esc(u.codigo)}${u.propietario ? ' · ' + esc(u.propietario) : ''}${prevDe(u.id) ? ` (${prevDe(u.id)} previo${prevDe(u.id) > 1 ? 's' : ''})` : ''}</option>`).join('')}</select></div>
    <div><label>Tipo</label><select name="tipo" data-chg="tipoLlamado"><option ${S.sub.tipo === 'Llamado de atención' ? 'selected' : ''}>Llamado de atención</option><option ${S.sub.tipo === 'Requerimiento' ? 'selected' : ''}>Requerimiento</option><option ${S.sub.tipo === 'Proceso sancionatorio' ? 'selected' : ''}>Proceso sancionatorio</option></select></div></div>
    <div class="two"><div><label>Motivo</label><select name="categoria" required data-chg="motivoLl"><option value="">Escoge…</option>${CAT_LL.map(c => `<option ${S.sub.categoria === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div><div><label>Fecha de los hechos</label><input name="fecha_hechos" type="date" max="${HOY()}" value="${S.sub.fecha || ''}" data-chg="fechaLl"></div></div>
    ${faltas.length ? `<div><label>Norma del manual que se incumple</label><select name="falta" data-chg="faltaLl">${opcionesFalta(faltas, S.sub.categoria, S.sub.falta)}</select>
      <div id="faltaInfo"></div></div>`
      : `<div class="card sub" style="margin:0">Aún no has cargado el manual de convivencia. <button type="button" class="btn sm ghost" data-act="tab" data-v="manual">Cargarlo</button> Así, al escoger el motivo, la app trae sola el artículo que se incumple, su texto y la sanción prevista.</div>`}
    ${reps.length ? `<div><label>Tomar los hechos de un reporte (opcional)</label><select name="reporte"><option value="">Ninguno</option>${reps.map(r => `<option value="${r.id}">#${r.numero} · ${esc(r.titulo)} · ${fecha(r.created_at)}</option>`).join('')}</select></div>` : ''}
    <div><label>Hechos</label><textarea name="hechos" rows="5" placeholder="Qué pasó, cuándo y dónde, de forma objetiva" oninput="this.dataset.auto=''">${esc(S.sub.hechos || '')}</textarea></div>
    <div><label>Norma que se incumple</label><input name="norma" placeholder="Ej. Art. 25 del manual de convivencia: horario de ruido" value="${esc(S.sub.norma || '')}"></div>
    <input type="hidden" name="gravedad" value="">
    <div class="two"><div><label>Plazo para corregir o descargos (días)</label><input name="plazo" type="number" min="1" max="60" value="5" required></div><div><label>Evidencias (fotos)</label><input name="fotos" type="file" accept="image/*" multiple></div></div>
    <p class="sub" style="margin:0">Para imponer una multa o una restricción, primero debe existir un llamado o requerimiento escrito con plazo, y luego se abre el proceso sancionatorio (art. 59 y 60, Ley 675). Ajusta los plazos a tu reglamento.</p>
    <button class="btn" type="submit">Enviar a la unidad</button></form></details>` : ''}
  <div class="seg" role="group" aria-label="Filtro">${[['abiertos', 'Abiertos'], ['decidir', 'Por decidir'], ['consejo', 'En consejo' + (enConsejo.length ? ' · ' + enConsejo.length : '')], ['todos', 'Todos']].map(([k, l]) => `<button data-act="sub" data-k="f" data-v="${k}" aria-pressed="${f === k}">${l}</button>`).join('')}</div>
  ${vis.map(l => `<button class="card navcard" data-act="sub2" data-view="llamado" data-id="${l.id}" style="align-items:flex-start"><div class="ico">${esc(((l.unidades || {}).codigo || '?').slice(-3))}</div><div class="grow">
    <div class="row"><h3>${esc(l.tipo)} #${l.numero} · ${esc((l.unidades || {}).codigo)}</h3><span class="chip ${chipLl[l.estado]}">${l.decision || l.estado}</span></div>
    <div class="sub">${l.gravedad ? `<span class="chip ${chipGrav[l.gravedad]}" style="padding:1px 7px;font-size:11px">${l.gravedad}</span> ` : ''}${esc(l.categoria)} · ${fecha(l.created_at)} · ${l.leido_at ? 'leído ' + fecha(l.leido_at) : 'sin leer'}${l.descargos_at ? (l.acepta ? ' · aceptó la falta' : ' · con descargos') : !l.decision ? (enPlazo(l) ? ' · plazo hasta ' + fecha(venceDescargos(l).toISOString()) : ' · plazo vencido') : ''}</div>
    <div class="sub ell" style="margin-top:2px">${esc(l.hechos)}</div></div></button>`).join('') || '<div class="card sub">No hay llamados en este filtro.</div>'}
  <div class="card sub">Esta guía sigue la Ley 675 de 2001. Antes de sancionar, revisa que el procedimiento y el órgano competente coincidan con el reglamento de tu copropiedad; ante dudas, consulta con un abogado.</div></div>`;
};

V.llamado = async () => {
  const l = await q(sb.from('llamados').select('*, unidades(codigo, propietario)').eq('id', S.sub.id).maybeSingle());
  if (!l) return '<div class="card">No encontramos este llamado.</div>';
  const gest = !R();
  const [conj, cuota, falta, votos, ev] = await Promise.all([
    q(sb.from('conjuntos').select('nombre, ciudad').eq('id', l.conjunto_id).maybeSingle()),
    gest && !l.decision ? q(sb.from('v_saldos').select('cuota').eq('unidad_id', l.unidad_id).maybeSingle()) : Promise.resolve(null),
    l.falta_id ? q(sb.from('manual_faltas').select('*').eq('id', l.falta_id).maybeSingle()) : Promise.resolve(null),
    gest && l.consejo_at ? q(sb.from('llamado_votos').select('*').eq('llamado_id', l.id).order('created_at')) : Promise.resolve([]),
    gest && l.consejo_at ? q(sb.rpc('estado_votacion', { p_id: l.id })) : Promise.resolve(null)
  ]);
  const previos = gest ? await q(sb.from('llamados').select('id, numero, tipo, categoria, decision, created_at').eq('unidad_id', l.unidad_id).neq('id', l.id).order('created_at', { ascending: false }).limit(10)) : [];
  const sancion = ['Multa', 'Restricción de uso'].includes(l.decision);
  const puedeImpugnar = R() && sancion && !l.impugnacion_at && l.decision_at && (new Date() - new Date(l.decision_at)) < 30 * 864e5;
  const tope = cuota && cuota.cuota ? 2 * Number(cuota.cuota) : null;
  const paso = (ok, t, d) => pasoHTML(ok, t, d);
  return `<div class="stack">
  <button class="btn sm ghost" data-act="tab" data-v="${R() ? 'misllamados' : 'llamados'}" style="align-self:flex-start">‹ Volver</button>
  <div class="card stack" style="gap:6px"><div class="row"><span class="mono" style="color:var(--muted)">${esc(l.tipo)} #${l.numero}</span><span class="chip ${chipLl[l.estado]}">${l.decision || l.estado}</span></div>
    ${!R() ? `<h2>${esc((l.unidades || {}).codigo)}${(l.unidades || {}).propietario ? ' · ' + esc(l.unidades.propietario) : ''}</h2>` : ''}</div>
  <div class="card">${cartaLlamado(l, conj || {}, l.unidades || {}, falta)}${fotosHTML(l.evidencias)}</div>
  <div class="card"><h2>Seguimiento</h2><div class="pasos">
    ${paso(true, 'Enviado a la unidad', fechaHora(l.created_at))}
    ${paso(!!l.leido_at, 'Leído por la unidad', l.leido_at ? fechaHora(l.leido_at) : 'Aún no lo han abierto')}
    ${paso(!!l.descargos_at, l.descargos_at ? (l.acepta ? 'Aceptó la falta y se comprometió' : 'Presentó descargos') : 'Respuesta de la unidad', l.descargos_at ? fechaHora(l.descargos_at) : (enPlazo(l) ? 'Plazo hasta ' + fecha(venceDescargos(l).toISOString()) : 'No respondió dentro del plazo'))}
    ${l.consejo_at || (l.organo === 'Consejo de administración') ? paso(!!l.decision, 'Deliberación del consejo', l.consejo_at ? 'Desde ' + fechaHora(l.consejo_at) + (ev ? ` · ${ev.votos} de ${ev.total} votos` : '') : '') : ''}
    ${paso(!!l.decision, 'Decisión', l.decision ? `${l.decision} · ${esc(l.organo || '')}${l.acta ? ', acta ' + esc(l.acta) : ''} · ${fechaHora(l.decision_at)}` : '')}
    ${sancion ? paso(!!l.impugnacion_at, 'Impugnación', l.impugnacion_at ? fechaHora(l.impugnacion_at) : 'Hasta un mes después de la decisión') : ''}
  </div></div>
  ${gest && previos.length ? `<div class="card"><h3>Antecedentes de la unidad</h3><div class="sub" style="margin-top:4px">${previos.map(x => `#${x.numero} ${esc(x.tipo.toLowerCase())} · ${esc(x.categoria.toLowerCase())} · ${fecha(x.created_at)}${x.decision ? ' · ' + esc(x.decision.toLowerCase()) : ''}`).join('<br>')}</div></div>` : ''}
  ${l.acepta && l.compromiso ? `<div class="card"><h2>La unidad aceptó la falta</h2><p style="margin:6px 0 0"><b>Compromiso:</b> ${nl(l.compromiso)}</p>${fotosHTML(l.descargos_fotos)}</div>` : ''}
  ${l.descargos ? `<div class="card"><h2>Descargos de la unidad</h2><p style="margin:6px 0 0">${nl(l.descargos)}</p>${fotosHTML(l.descargos_fotos)}</div>` : ''}
  ${l.decision ? `<div class="card stack" style="gap:6px"><h2>Decisión: ${esc(l.decision)}</h2>${l.decision_texto ? `<p style="margin:0">${nl(l.decision_texto)}</p>` : ''}
    ${l.decision === 'Multa' ? `<div class="alert">Multa de <b>${fmt(l.multa_valor)}</b>, cargada al estado de cuenta de la unidad.</div>` : ''}
    ${l.decision === 'Restricción de uso' ? `<div class="alert">Restricción: <b>${esc(l.restriccion || 'zonas comunes no esenciales')}</b> hasta el ${fecha(l.restriccion_hasta)}. Las reservas de la unidad quedan bloqueadas en ese periodo.</div>` : ''}
    ${l.impugnacion ? `<div class="resp"><b>Impugnación:</b> ${nl(l.impugnacion)}</div>` : ''}</div>` : ''}
  ${R() && !l.decision ? (() => { const modo = S.sub.modo || (l.acepta ? 'acepto' : 'descargos'); return `<form class="card form" data-form="descargos" data-id="${l.id}" data-acepta="${modo === 'acepto' ? '1' : ''}"><h2>${l.descargos_at ? 'Actualizar mi respuesta' : 'Responder a este llamado'}</h2>
    <p class="sub" style="margin:0">${enPlazo(l) ? 'Tienes plazo hasta el ' + fecha(venceDescargos(l).toISOString()) + '.' : 'El plazo ya venció, pero aún puedes responder mientras no haya decisión.'} Tu respuesta le llega a la administración${l.consejo_at ? ' y al consejo' : ''}.</p>
    <div class="seg" role="group" aria-label="Tipo de respuesta"><button type="button" data-act="sub" data-k="modo" data-v="acepto" data-keep="1" aria-pressed="${modo === 'acepto'}">Acepto y me comprometo</button><button type="button" data-act="sub" data-k="modo" data-v="descargos" data-keep="1" aria-pressed="${modo === 'descargos'}">Presento descargos</button></div>
    ${modo === 'acepto' ? `<div><label>Mi compromiso</label><textarea name="texto" rows="3" required placeholder="Ej. Reconozco la falta. A partir de hoy mantendré el volumen bajo después de las 10 p.m.">${esc(l.compromiso || '')}</textarea></div><p class="sub" style="margin:0">Aceptar la falta y corregirla se tiene en cuenta a tu favor al momento de decidir.</p>`
      : `<div><label>Mi versión de los hechos</label><textarea name="texto" rows="4" required placeholder="Cuenta lo que pasó desde tu punto de vista">${esc(l.descargos || '')}</textarea></div>`}
    <div><label>${modo === 'acepto' ? 'Fotos (opcional)' : 'Pruebas (fotos)'}</label><input name="fotos" type="file" accept="image/*" multiple></div>
    <button class="btn" type="submit">${modo === 'acepto' ? 'Enviar aceptación y compromiso' : 'Enviar descargos'}</button></form>`; })() : ''}
  ${puedeImpugnar ? `<form class="card form" data-form="impugnar" data-id="${l.id}"><h2>Impugnar la sanción</h2><p class="sub" style="margin:0">Tienes hasta el ${fecha(new Date(new Date(l.decision_at).getTime() + 30 * 864e5).toISOString())} (art. 62, Ley 675).</p><textarea name="texto" rows="4" required placeholder="Motivos por los que no estás de acuerdo"></textarea><button class="btn" type="submit">Enviar impugnación</button></form>` : ''}
  ${gest && !l.decision ? cardConsejo(l, votos, ev, cuota) : ''}
  ${W() && !l.decision ? `<form class="card form" data-form="decidir" data-id="${l.id}"><h2>${l.consejo_at ? 'Otra decisión (asamblea o administración)' : 'Registrar decisión'}</h2>
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
  return `<div class="stack"><h2>Comunicaciones de la administración</h2><button class="card navcard" data-act="tab" data-v="manual"><div class="ico">${svg('manual')}</div><div class="grow"><h3>Manual de convivencia</h3><div class="sub">Consulta las normas del conjunto</div></div><span class="sub">›</span></button>${lista.map(l => `<button class="card navcard" data-act="sub2" data-view="llamado" data-id="${l.id}"><div class="ico">${svg('misllamados')}</div><div class="grow">
    <div class="row"><h3>${esc(l.tipo)} #${l.numero}</h3><span class="chip ${l.leido_at ? chipLl[l.estado] : 'warn'}">${l.leido_at ? (l.decision || l.estado) : 'Sin leer'}</span></div>
    <div class="sub">${esc(l.categoria)} · ${fecha(l.created_at)}${!l.decision && !l.descargos_at ? ' · plazo hasta ' + fecha(venceDescargos(l).toISOString()) : l.acepta && !l.decision ? ' · aceptaste' : ''}</div></div></button>`).join('') || '<div class="card sub">No tienes llamados de atención. ¡Gracias por tu buena convivencia!</div>'}</div>`;
};

/* ---------- ganchos ---------- */
const _mas3 = V.mas;
V.mas = async () => (await _mas3()).replace('<h2>Más</h2>', `<h2>Más</h2><button class="card navcard" data-act="tab" data-v="llamados"><div class="ico">${svg('llamados')}</div><div class="grow"><h3>Llamados de atención</h3><div class="sub">Requerimientos, descargos y decisión del consejo</div></div><span class="sub">›</span></button><button class="card navcard" data-act="tab" data-v="manual"><div class="ico">${svg('manual')}</div><div class="grow"><h3>Manual de convivencia</h3><div class="sub">Faltas, gravedad y sanciones previstas</div></div><span class="sub">›</span></button>`);
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
Object.assign(CHG, {
  tipoLlamado: () => { }, decisionLl: () => { },
  motivoLl: el => {
    const sel = el.form.falta; if (!sel) return;
    sel.innerHTML = opcionesFalta(LL_FALTAS, el.value, null);
    const fs = LL_FALTAS.filter(x => x.categoria === el.value);
    if (fs.length === 1) sel.value = fs[0].id;
    CHG.faltaLl(sel);
  },
  fechaLl: el => { const f = el.form, x = LL_FALTAS.find(z => z.id === (f.falta && f.falta.value)); if (x && f.hechos.dataset.auto === '1') f.hechos.value = borradorHechos(x, f); },
  faltaLl: el => {
    const form = el.form, info = $('faltaInfo');
    const x = LL_FALTAS.find(z => z.id === el.value);
    if (!x) { form.gravedad.value = ''; if (info) info.innerHTML = ''; return; }
    form.norma.value = `${x.articulo} del manual de convivencia: ${x.titulo}`;
    form.categoria.value = x.categoria; form.plazo.value = x.plazo_dias; form.gravedad.value = x.gravedad;
    if (!form.hechos.value.trim() || form.hechos.dataset.auto === '1') { form.hechos.value = borradorHechos(x, form); form.hechos.dataset.auto = '1'; }
    if (info) info.innerHTML = `<div class="normabox"><div class="row" style="justify-content:flex-start;gap:6px;flex-wrap:wrap"><b>${esc(x.articulo)} · ${esc(x.titulo)}</b><span class="chip ${chipGrav[x.gravedad]}">Falta ${x.gravedad.toLowerCase()}</span></div>
      ${x.descripcion ? `<p>“${nl(x.descripcion)}”</p>` : '<p class="sub">Este artículo no tiene el texto de la norma cargado. Agrégalo en el manual para que salga citado en la carta.</p>'}
      <div class="sub">${x.sancion ? 'Sanción prevista: <b>' + esc(x.sancion) + '</b> · ' : ''}${x.plazo_dias} días para responder</div></div>`;
  }
});
Object.assign(FORM, {
  llamado: async (f, form) => {
    let hechos = (f.hechos || '').trim(), evid = [];
    if (f.reporte) { const r = await q(sb.from('reportes').select('titulo, descripcion, fotos').eq('id', f.reporte).single()); if (!hechos) hechos = r.titulo + (r.descripcion ? '. ' + r.descripcion : ''); evid = r.fotos || []; }
    if (!hechos) throw new Error('Describe los hechos.');
    if (/\[(fecha|hora|Describe)[^\]]*\]/.test(hechos)) throw new Error('Completa en los hechos lo que está entre corchetes [ ] antes de enviar.');
    evid = evid.concat(await subirVarias(form.fotos.files, 'llamados', 6));
    const l = await q(sb.from('llamados').insert({ conjunto_id: C(), unidad_id: f.unidad, tipo: f.tipo, categoria: f.categoria, fecha_hechos: f.fecha_hechos || null, hechos, norma: f.norma || null, falta_id: f.falta || null, gravedad: f.gravedad || null, plazo_dias: Number(f.plazo) || 5, evidencias: evid, reporte_id: f.reporte || null }).select('id, numero').single());
    toast(`${f.tipo} #${l.numero} enviado. La unidad ya recibió el aviso.`, 4000); go('llamado', { id: l.id });
  },
  descargos: async (f, form) => {
    const fotos = await subirVarias(form.fotos.files, 'llamados', 4);
    const acepta = form.dataset.acepta === '1';
    await q(sb.rpc('descargos_llamado', { p_id: form.dataset.id, p_texto: f.texto, p_fotos: fotos, p_acepta: acepta }));
    toast(acepta ? 'Tu aceptación y compromiso llegaron a la administración' : 'Descargos enviados a la administración', 4000); S.sub.modo = null; render();
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

/* =====================================================================
   Decisión del consejo de administración
   ===================================================================== */
function cardConsejo(l, votos, ev, cuota) {
  const listo = l.descargos_at || !enPlazo(l);
  if (!l.consejo_at) {
    if (!W()) return '';
    return `<div class="card stack" style="gap:8px"><h2>Que decida el consejo</h2>
      <p class="sub" style="margin:0">Envía el caso a los miembros del consejo de administración: lo revisan en la app, votan si aplica o no sanción y, con la mayoría, queda registrada la decisión y se le notifica a la unidad.</p>
      ${!listo ? `<div class="alert">La unidad aún está dentro del plazo para responder (hasta el ${fecha(venceDescargos(l).toISOString())}). Puedes enviarlo ya; para votar una sanción el consejo deberá esperar a que responda o venza el plazo.</div>` : ''}
      <button class="btn" data-act="enviarConsejo" data-id="${l.id}" style="align-self:flex-start">Enviar al consejo para decidir</button></div>`;
  }
  const mio = votos.find(v => v.user_id === S.user.id);
  const tope = cuota && cuota.cuota ? 2 * Number(cuota.cuota) : null;
  const mayoriaSi = ev && ev.sanciona >= ev.mayoria, mayoriaNo = ev && ev.no_sanciona >= ev.mayoria;
  const propSi = votos.filter(v => v.voto === 'Sanciona');
  const multaProm = propSi.filter(v => v.multa_valor).length ? Math.round(propSi.filter(v => v.multa_valor).reduce((s, v) => s + Number(v.multa_valor), 0) / propSi.filter(v => v.multa_valor).length / 1000) * 1000 : '';
  const voto = S.sub.voto || (mio ? mio.voto : '');
  return `<div class="card stack" style="gap:10px"><div class="row"><h2>Deliberación del consejo</h2><span class="chip info">${ev ? ev.votos + ' de ' + ev.total : ''} votos</span></div>
    ${ev ? `<div class="votobar"><div class="si" style="width:${ev.total ? 100 * ev.sanciona / ev.total : 0}%"></div><div class="no" style="width:${ev.total ? 100 * ev.no_sanciona / ev.total : 0}%"></div></div>
      <div class="row sub" style="justify-content:flex-start;gap:14px;flex-wrap:wrap"><span><b style="color:var(--bad)">${ev.sanciona}</b> por sancionar</span><span><b style="color:var(--ok)">${ev.no_sanciona}</b> por no sancionar</span><span>Mayoría: ${ev.mayoria} de ${ev.total}</span></div>` : ''}
    ${votos.length ? `<div class="list">${votos.map(v => `<div class="item"><div class="grow"><div class="row"><h3>${esc(v.nombre || 'Consejero')}</h3><span class="chip ${v.voto === 'Sanciona' ? 'bad' : 'ok'}">${esc(v.voto)}</span></div><div class="sub">${esc(v.propuesta || '')}${v.multa_valor ? ' de ' + fmt(v.multa_valor) : ''} · ${fechaHora(v.created_at)}${v.comentario ? '<br>' + nl(v.comentario) : ''}</div></div></div>`).join('')}</div>` : '<div class="sub">Aún no hay votos.</div>'}
    ${esConsejo() && !(mayoriaSi || mayoriaNo) ? `<form class="form" data-form="votoLl" data-id="${l.id}" style="border-top:1px solid var(--line);padding-top:10px"><h3>${mio ? 'Cambiar mi voto' : 'Mi voto'}</h3>
      <div class="seg" role="group" aria-label="Voto"><button type="button" data-act="sub" data-k="voto" data-v="No sanciona" data-keep="1" aria-pressed="${voto === 'No sanciona'}">No sancionar</button><button type="button" data-act="sub" data-k="voto" data-v="Sanciona" data-keep="1" aria-pressed="${voto === 'Sanciona'}" ${l.tipo !== 'Proceso sancionatorio' ? 'disabled title="Requiere proceso sancionatorio"' : ''}>Sancionar</button></div>
      ${l.tipo !== 'Proceso sancionatorio' ? '<p class="sub" style="margin:0">Este caso es un ' + esc(l.tipo.toLowerCase()) + ': el consejo puede mantenerlo o archivarlo. Para sancionar, la administración debe abrir el proceso sancionatorio.</p>' : ''}
      ${voto ? `<input type="hidden" name="voto" value="${esc(voto)}"><div class="two"><div><label>${voto === 'Sanciona' ? 'Sanción que propongo' : 'Propongo'}</label><select name="propuesta">${(voto === 'Sanciona' ? ['Multa', 'Restricción de uso'] : ['Se mantiene el llamado', 'Archivado']).map(o => `<option ${mio && mio.propuesta === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
        ${voto === 'Sanciona' ? `<div><label>Valor de multa propuesto</label><input name="multa" type="number" min="0" step="1000" value="${mio && mio.multa_valor ? mio.multa_valor : ''}" placeholder="${tope ? 'Máx. ' + fmt(tope) : ''}"></div>` : '<div></div>'}</div>
        <div><label>Comentario (lo ven el consejo y la administración)</label><textarea name="comentario" rows="2">${esc(mio && mio.comentario || '')}</textarea></div>
        <button class="btn" type="submit">${mio ? 'Actualizar voto' : 'Votar'}</button>` : ''}</form>` : ''}
    ${(mayoriaSi || mayoriaNo) && (esConsejo() || W()) ? `<form class="form" data-form="decidirConsejo" data-id="${l.id}" style="border-top:1px solid var(--line);padding-top:10px">
      <div class="alert">Hay mayoría: el consejo votó <b>${mayoriaSi ? 'sancionar' : 'no sancionar'}</b>. Registra la decisión para notificarla a la unidad.</div>
      <div class="two"><div><label>Decisión</label><select name="decision">${(mayoriaSi ? ['Multa', 'Restricción de uso'] : ['Se mantiene el llamado', 'Archivado']).map(o => `<option ${ev.propuesta === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
      ${mayoriaSi ? `<div><label>Valor de la multa</label><input name="multa" type="number" min="0" step="1000" value="${multaProm}" placeholder="${tope ? 'Máx. ' + fmt(tope) : ''}"></div>` : '<div></div>'}</div>
      ${mayoriaSi ? `<div class="two"><div><label>Restricción (si aplica)</label><input name="restriccion" placeholder="Salón social, BBQ, piscina"></div><div><label>Restricción hasta</label><input name="hasta" type="date" min="${HOY()}"></div></div>` : ''}
      <div><label>Explicación de la decisión</label><textarea name="texto" rows="3" required placeholder="Lo que el consejo analizó (hechos, respuesta de la unidad, antecedentes) y por qué decide así"></textarea></div>
      <button class="btn" type="submit">Registrar decisión del consejo y notificar</button></form>` : ''}
  </div>`;
}

/* =====================================================================
   Manual de convivencia
   ===================================================================== */
V.manual = async () => {
  const faltas = await q(sb.from('manual_faltas').select('*').eq('conjunto_id', C()).order('articulo'));
  const busca = sinTilde(S.sub.qm || '');
  const vis = faltas.filter(x => (W() || x.activo) && (!busca || sinTilde(x.articulo + ' ' + x.titulo + ' ' + (x.descripcion || '') + ' ' + x.categoria).includes(busca)));
  const volver = R() ? 'misllamados' : 'llamados';
  return `<div class="stack"><button class="btn sm ghost" data-act="tab" data-v="${volver}" style="align-self:flex-start">‹ Volver</button>
  <h2>Manual de convivencia</h2>
  ${W() ? `<details class="card" ${faltas.length ? '' : 'open'}><summary><b>+ Agregar faltas</b></summary>
    <form class="form mt" data-form="faltaNueva">
      <div class="two"><div><label>Artículo o numeral</label><input name="articulo" required placeholder="Art. 25"></div><div><label>Falta</label><input name="titulo" required placeholder="Ruido después de las 10 p.m."></div></div>
      <div><label>Texto de la norma (opcional)</label><textarea name="descripcion" rows="2" placeholder="Copia el texto del manual para que se cite en la carta"></textarea></div>
      <div class="two"><div><label>Categoría</label><select name="categoria">${CAT_LL.map(c => `<option>${c}</option>`).join('')}</select></div><div><label>Gravedad</label><select name="gravedad">${GRAVEDAD.map(g => `<option>${g}</option>`).join('')}</select></div></div>
      <div class="two"><div><label>Sanción que prevé el manual</label><input name="sancion" placeholder="Ej. Multa de hasta 1 cuota"></div><div><label>Días para responder</label><input name="plazo" type="number" min="1" max="60" value="5"></div></div>
      <button class="btn" type="submit">Agregar falta</button></form>
    <details class="mt"><summary class="sub">O pega varias desde Excel</summary><form class="form mt" data-form="faltasPegar">
      <textarea name="texto" rows="5" placeholder="Artículo;Falta;Categoría;Gravedad;Sanción;Días&#10;Art. 25;Ruido después de las 10 p.m.;Ruido;Grave;Multa de hasta 1 cuota;5&#10;Art. 31;Mascota sin traílla en zonas comunes;Mascotas;Leve;Llamado de atención;5"></textarea>
      <p class="sub" style="margin:0">Una falta por línea. Gravedad: leve, grave o gravísima.</p><button class="btn sm" type="submit">Cargar faltas</button></form></details></details>` : ''}
  ${faltas.length > 6 ? `<input type="search" placeholder="Buscar en el manual…" value="${esc(S.sub.qm || '')}" data-chg="buscaManual" aria-label="Buscar en el manual">` : ''}
  ${GRAVEDAD.map(g => { const fs = vis.filter(x => x.gravedad === g); return fs.length ? `<div class="card"><div class="row"><h2>Faltas ${g.toLowerCase()}s</h2><span class="chip ${chipGrav[g]}">${fs.length}</span></div><div class="list" style="margin-top:6px">
    ${fs.map(x => `<div class="item" style="${x.activo ? '' : 'opacity:.55'}"><div class="grow"><div class="row"><h3>${esc(x.articulo)} · ${esc(x.titulo)}</h3><span class="sub">${esc(x.categoria)}</span></div>
      ${x.descripcion ? `<div class="sub" style="margin-top:2px">${nl(x.descripcion)}</div>` : ''}
      <div class="sub" style="margin-top:2px">${x.sancion ? 'Sanción prevista: <b>' + esc(x.sancion) + '</b> · ' : ''}${x.plazo_dias} días para responder</div>
      ${W() ? `<div class="row" style="justify-content:flex-start;gap:6px;margin-top:6px"><button class="btn sm ghost" data-act="llamadoDeFalta" data-id="${x.id}">Hacer llamado</button><button class="btn sm ghost" data-act="faltaActiva" data-id="${x.id}" data-v="${x.activo ? '' : '1'}">${x.activo ? 'Desactivar' : 'Activar'}</button><button class="btn sm ghost danger-t" data-act="borrarFalta" data-id="${x.id}" data-confirm="¿Borrar?">Borrar</button></div>` : ''}</div></div>`).join('')}</div></div>` : ''; }).join('')}
  ${W() && !faltas.length ? `<div class="card stack" style="gap:8px"><h3>¿Empezar con un modelo?</h3><p class="sub" style="margin:0">Cargo ${MANUAL_BASE.length} faltas típicas de los manuales de convivencia en Colombia (ruido, mascotas, parqueaderos, basuras, obras, zonas comunes, convivencia y seguridad) con su texto. Después las ajustas al manual real de tu conjunto: artículos, horarios y sanciones.</p><button class="btn sm" data-act="manualBase" style="align-self:flex-start">Cargar modelo de manual</button></div>` : ''}
  ${!vis.length ? `<div class="card sub">${faltas.length ? 'No hay faltas con esa búsqueda.' : W() ? 'Carga las faltas de tu manual de convivencia. Cada llamado de atención citará el artículo exacto, su gravedad y la sanción prevista.' : 'La administración aún no ha publicado el manual de convivencia en la app. Puedes consultarlo en Documentos.'}</div>` : ''}
  </div>`;
};

const MANUAL_BASE = [
  ['Art. 1', 'Ruido en horario nocturno', 'Ruido', 'Grave', 'Entre las 10:00 p.m. y las 7:00 a.m. de domingo a jueves, y entre las 11:00 p.m. y las 7:00 a.m. los viernes, sábados y vísperas de festivo, está prohibido el uso de equipos de sonido, instrumentos, televisores o cualquier fuente de ruido a un volumen que se perciba fuera de la unidad o perturbe la tranquilidad de los vecinos.', 'Requerimiento escrito; si reincide, multa de hasta 1 cuota ordinaria'],
  ['Art. 2', 'Ruido excesivo en cualquier horario', 'Ruido', 'Leve', 'Los residentes deben mantener en todo momento un volumen moderado en música, televisión, reuniones y actividades dentro de la unidad, de modo que no perturbe la tranquilidad de los demás.', 'Llamado de atención'],
  ['Art. 3', 'Obras y trabajos ruidosos fuera del horario', 'Obras', 'Leve', 'Las obras, reparaciones y trabajos que generen ruido solo pueden realizarse de lunes a viernes de 8:00 a.m. a 5:00 p.m. y los sábados de 8:00 a.m. a 1:00 p.m., previa autorización de la administración. No se permiten domingos ni festivos.', 'Suspensión de la obra y llamado de atención'],
  ['Art. 4', 'Mascota sin traílla o bozal en zonas comunes', 'Mascotas', 'Leve', 'Las mascotas deben transitar por las zonas comunes con traílla y, si se trata de razas potencialmente peligrosas, con bozal, conforme a la Ley 1801 de 2016.', 'Llamado de atención; si reincide, multa'],
  ['Art. 5', 'No recoger los excrementos de la mascota', 'Mascotas', 'Leve', 'El tenedor de la mascota debe recoger de inmediato sus excrementos en las zonas comunes y disponerlos adecuadamente.', 'Llamado de atención; si reincide, multa'],
  ['Art. 6', 'Ruido o molestias causadas por mascotas', 'Mascotas', 'Leve', 'Los tenedores de mascotas deben evitar que los ladridos, olores o comportamiento de los animales perturben la tranquilidad y salubridad de los vecinos.', 'Llamado de atención'],
  ['Art. 7', 'Parqueo en lugar no asignado', 'Parqueadero', 'Leve', 'Cada vehículo debe estacionarse únicamente en el parqueadero asignado a la unidad. Está prohibido ocupar parqueaderos de visitantes, de otras unidades o zonas de circulación.', 'Llamado de atención; si reincide, restricción del parqueadero de visitantes'],
  ['Art. 8', 'Exceso de velocidad o mal uso de vías internas', 'Parqueadero', 'Grave', 'Dentro del conjunto la velocidad máxima es de 10 km/h. Se deben respetar las señales, el sentido de circulación y la prelación del peatón.', 'Requerimiento; si reincide, multa'],
  ['Art. 9', 'Disposición inadecuada de basuras', 'Basuras', 'Leve', 'Las basuras deben depositarse en bolsas cerradas, separadas según el código de colores, en el shut o cuarto de basuras y en los horarios establecidos. No se pueden dejar en pasillos, escaleras ni zonas comunes.', 'Llamado de atención'],
  ['Art. 10', 'Obra sin autorización', 'Obras', 'Grave', 'Toda reforma o modificación en la unidad debe contar con autorización previa de la administración y no puede afectar la estructura, la fachada ni los bienes comunes (art. 5 y 18 de la Ley 675 de 2001).', 'Suspensión de la obra, requerimiento y multa'],
  ['Art. 11', 'Mal uso o daño de zonas comunes', 'Zonas comunes', 'Grave', 'Las zonas comunes deben usarse conforme a su destinación y reglamento. Quien cause daños responde por su reparación, sin perjuicio de la sanción.', 'Pago del daño y multa; restricción de uso de zonas no esenciales'],
  ['Art. 12', 'Incumplimiento del reglamento de piscina, gimnasio o salón social', 'Zonas comunes', 'Leve', 'El uso de piscina, gimnasio, salón social y BBQ debe respetar los horarios, aforos y normas de cada zona publicados por la administración.', 'Llamado de atención; si reincide, restricción de uso'],
  ['Art. 13', 'Irrespeto o agresión a empleados o residentes', 'Convivencia', 'Gravísima', 'Todos los residentes y visitantes deben tratar con respeto al personal de vigilancia, aseo y administración, y a los demás copropietarios. Se prohíben las agresiones verbales o físicas.', 'Multa de hasta 2 cuotas y restricción de zonas sociales'],
  ['Art. 14', 'Ingreso de visitantes sin anuncio o autorización', 'Seguridad', 'Leve', 'Todo visitante debe ser anunciado en portería y autorizado por la unidad que visita. Los residentes son responsables del comportamiento de sus visitantes.', 'Llamado de atención'],
  ['Art. 15', 'Consumo de sustancias o licor en zonas comunes', 'Convivencia', 'Grave', 'Está prohibido el consumo de sustancias psicoactivas en las zonas comunes, y el de bebidas alcohólicas fuera de los espacios y horarios autorizados por la administración.', 'Requerimiento; si reincide, multa'],
  ['Art. 16', 'Objetos en fachadas, ventanas o balcones', 'Convivencia', 'Leve', 'No se permite colgar ropa, avisos, tapetes u objetos en ventanas, balcones o fachadas, ni modificar su color o diseño (art. 18, Ley 675 de 2001).', 'Llamado de atención']
];
Object.assign(ACT, {
  manualBase: async () => {
    await q(sb.from('manual_faltas').upsert(MANUAL_BASE.map(([articulo, titulo, categoria, gravedad, descripcion, sancion]) => ({ conjunto_id: C(), articulo, titulo, categoria, gravedad, descripcion, sancion, plazo_dias: gravedad === 'Gravísima' ? 3 : 5 })), { onConflict: 'conjunto_id,articulo,titulo' }));
    toast('Modelo cargado. Ajusta artículos, horarios y sanciones a tu manual real.', 5000); render();
  },
  enviarConsejo: async d => {
    const n = await q(sb.rpc('enviar_consejo', { p_id: d.id }));
    toast(`Caso enviado a ${n} ${n === 1 ? 'miembro' : 'miembros'} del consejo. Les llegó el aviso para votar.`, 5000); render();
  },
  llamadoDeFalta: d => go('llamados', { nuevo: true, falta: d.id }),
  faltaActiva: async d => { await q(sb.from('manual_faltas').update({ activo: !!d.v }).eq('id', d.id)); render(); },
  borrarFalta: async d => { await q(sb.from('manual_faltas').delete().eq('id', d.id)); toast('Falta borrada'); render(); }
});
Object.assign(CHG, { buscaManual: el => { S.sub.qm = el.value; render(); } });
Object.assign(FORM, {
  votoLl: async (f, form) => {
    const r = await q(sb.rpc('votar_llamado', { p_id: form.dataset.id, p_voto: f.voto, p_propuesta: f.propuesta, p_multa: Number(f.multa) || null, p_comentario: f.comentario || null }));
    toast(r && r.votos ? `Voto registrado · ${r.votos} de ${r.total} miembros han votado` : 'Voto registrado', 4000); S.sub.voto = null; render();
  },
  decidirConsejo: async (f, form) => {
    await q(sb.rpc('decidir_consejo', { p_id: form.dataset.id, p_decision: f.decision, p_texto: f.texto, p_multa: Number(f.multa) || null, p_restriccion: f.restriccion || null, p_hasta: f.hasta || null }));
    toast('Decisión del consejo registrada y notificada a la unidad', 4500); render();
  },
  faltaNueva: async f => {
    await q(sb.from('manual_faltas').insert({ conjunto_id: C(), articulo: f.articulo.trim(), titulo: f.titulo.trim(), descripcion: f.descripcion || null, categoria: f.categoria, gravedad: f.gravedad, sancion: f.sancion || null, plazo_dias: Number(f.plazo) || 5 }));
    toast('Falta agregada al manual'); render();
  },
  faltasPegar: async f => {
    const filas = partirCSV(f.texto || '').filter(r => r[0] && !/^art[ií]culo$/i.test(r[0].trim()));
    if (!filas.length) throw new Error('No encontré faltas en el texto.');
    const grav = g => GRAVEDAD.find(x => sinTilde(x) === sinTilde(g)) || 'Leve';
    const cat = c => CAT_LL.find(x => sinTilde(x) === sinTilde(c)) || 'Convivencia';
    const reg = filas.map(r => ({ conjunto_id: C(), articulo: r[0], titulo: r[1] || r[0], categoria: cat(r[2]), gravedad: grav(r[3]), sancion: r[4] || null, plazo_dias: Math.min(60, Math.max(1, Number(r[5]) || 5)) }));
    await q(sb.from('manual_faltas').upsert(reg, { onConflict: 'conjunto_id,articulo,titulo' }));
    toast(`${reg.length} faltas cargadas al manual`); render();
  }
});

/* Al abrir el formulario desde una falta del manual, se precargan sus datos */
const _afterLl = AFTER.llamados;
AFTER.llamados = async () => { if (_afterLl) await _afterLl(); const el = document.querySelector('select[name="falta"]'); if (el && el.value) CHG.faltaLl(el); else { const m = document.querySelector('form[data-form="llamado"] select[name="categoria"]'); if (m && m.value) CHG.motivoLl(m); } };
