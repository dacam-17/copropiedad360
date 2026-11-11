/* =====================================================================
   SYAPH360 · Identidad del conjunto y cuentas de cobro
   Logo, contacto, representante legal, revisor fiscal, auxiliar
   administrativo, datos bancarios y cuenta de cobro imprimible.
   ===================================================================== */

Object.assign(ICONS, { cobro: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>' });
const COLS_ID = 'id, nombre, nit, ciudad, direccion, logo, telefono, email, rep_legal, rep_legal_doc, revisor_fiscal, revisor_tp, revisor_email, auxiliar, auxiliar_telefono, auxiliar_email, banco, tipo_cuenta, numero_cuenta, titular_cuenta, convenio, referencia_formato, nota_cobro';
const referenciaDe = (u, conj) => u.referencia || String(conj.referencia_formato || '{codigo}').replace(/\{codigo\}/g, u.codigo).replace(/\{numero\}/g, String(u.codigo).replace(/\D/g, ''));

/* ---------- logo en el encabezado ---------- */
S.logoUrl = null;
async function cargarLogo() {
  S.logoUrl = null; pintarLogo();
  if (!S.ctx) return;
  const c = await sb.from('conjuntos').select('logo').eq('id', C()).maybeSingle();
  if (c.data && c.data.logo) { const u = await sb.storage.from('soportes').createSignedUrl(c.data.logo, 3600 * 12); S.logoUrl = u.data ? u.data.signedUrl : null; }
  pintarLogo();
}
function pintarLogo() {
  let img = $('hlogo');
  if (!img) { img = document.createElement('img'); img.id = 'hlogo'; img.alt = 'Logo del conjunto'; img.className = 'hlogo'; const t = $('top'); if (t) t.prepend(img); }
  const mostrar = S.logoUrl && S.ctx && !['portafolio', 'plataforma', 'solicitud', 'contextos'].includes(S.view);
  img.hidden = !mostrar; if (mostrar && img.src !== S.logoUrl) img.src = S.logoUrl;
}
const _setCtx4 = setCtx;
setCtx = function (ctx) { _setCtx4(ctx); cargarLogo(); };
const _header3 = header;
header = function () { _header3(); pintarLogo(); };

/* ---------- ajustes: identidad y datos de cobro ---------- */
const _config = V.config;
V.config = async () => {
  let html = await _config();
  if (!W()) return html;
  const c = await q(sb.from('conjuntos').select(COLS_ID).eq('id', C()).single());
  const v = k => esc(c[k] || '');
  const ej = { codigo: 'T1-701', referencia: null };
  const form = `<details class="card" ${c.banco ? '' : 'open'}><summary><b>Identidad y datos de cobro</b> <span class="sub">(logo, responsables, banco)</span></summary>
  <form class="form mt" data-form="identidad">
    <h3>Logo y contacto</h3>
    <div class="row" style="gap:12px;justify-content:flex-start"><div id="logoPrev" class="logoprev">${c.logo ? '' : 'Sin logo'}</div><div style="flex:1;min-width:0"><label>Logo (PNG o JPG, idealmente cuadrado)</label><input name="logo" type="file" accept="image/png,image/jpeg,image/webp"></div></div>
    <div class="two"><div><label>Teléfono de la administración</label><input name="telefono" type="tel" value="${v('telefono')}"></div><div><label>Correo de la administración</label><input name="email" type="email" value="${v('email')}"></div></div>
    <h3>Representante legal</h3>
    <div class="two"><div><label>Nombre</label><input name="rep_legal" value="${v('rep_legal')}"></div><div><label>Documento (opcional)</label><input name="rep_legal_doc" value="${v('rep_legal_doc')}" placeholder="C.C."></div></div>
    <h3>Revisor fiscal</h3>
    <div class="two"><div><label>Nombre</label><input name="revisor_fiscal" value="${v('revisor_fiscal')}"></div><div><label>Tarjeta profesional</label><input name="revisor_tp" value="${v('revisor_tp')}" placeholder="T.P."></div></div>
    <div><label>Correo del revisor fiscal</label><input name="revisor_email" type="email" value="${v('revisor_email')}"></div>
    <h3>Auxiliar administrativo</h3>
    <div class="two"><div><label>Nombre</label><input name="auxiliar" value="${v('auxiliar')}"></div><div><label>Teléfono</label><input name="auxiliar_telefono" type="tel" value="${v('auxiliar_telefono')}"></div></div>
    <div><label>Correo</label><input name="auxiliar_email" type="email" value="${v('auxiliar_email')}"></div>
    <h3>Datos para el pago (salen en la cuenta de cobro)</h3>
    <div class="two"><div><label>Banco</label><input name="banco" value="${v('banco')}" placeholder="Bancolombia"></div><div><label>Tipo de cuenta</label><select name="tipo_cuenta">${['Ahorros', 'Corriente'].map(t => `<option ${c.tipo_cuenta === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div></div>
    <div class="two"><div><label>Número de cuenta</label><input name="numero_cuenta" value="${v('numero_cuenta')}"></div><div><label>Titular</label><input name="titular_cuenta" value="${v('titular_cuenta') || esc(c.nombre)}"></div></div>
    <div class="two"><div><label>Convenio de recaudo (opcional)</label><input name="convenio" value="${v('convenio')}"></div><div><label>Formato de la referencia de pago</label><input name="referencia_formato" value="${v('referencia_formato') || '{codigo}'}"></div></div>
    <p class="sub" style="margin:0">En el formato, <b>{codigo}</b> se reemplaza por el código de la unidad y <b>{numero}</b> por sus dígitos. Ejemplo: con "{numero}", la unidad ${ej.codigo} paga con la referencia <b>${referenciaDe(ej, { referencia_formato: '{numero}' })}</b>.</p>
    <div><label>Nota al pie de la cuenta de cobro</label><textarea name="nota_cobro" rows="2" placeholder="Ej. Después de la fecha límite se liquidan intereses de mora a la tasa máxima legal.">${v('nota_cobro')}</textarea></div>
    <button class="btn" type="submit">Guardar</button></form></details>`;
  const ancla = '<details class="card" ';
  const i = html.indexOf(ancla, html.indexOf('Datos generales'));
  return i > 0 ? html.slice(0, i) + form + html.slice(i) : html + form;
};
AFTER.config = async () => {
  const el = $('logoPrev'); if (!el) return;
  const c = await sb.from('conjuntos').select('logo').eq('id', C()).maybeSingle();
  if (c.data && c.data.logo) { const u = await sb.storage.from('soportes').createSignedUrl(c.data.logo, 3600); if (u.data) el.innerHTML = `<img src="${u.data.signedUrl}" alt="Logo">`; }
};

/* ---------- cuenta de cobro ---------- */
async function datosCobro(unidadId) {
  const per = mesActual();
  let qu = sb.from('unidades').select('id, codigo, propietario, coeficiente, referencia').eq('conjunto_id', C()).order('codigo');
  let qs = sb.from('v_saldos').select('unidad_id, saldo').eq('conjunto_id', C());
  let qc = sb.from('cargos').select('unidad_id, concepto, valor, vence, periodo').eq('conjunto_id', C()).eq('periodo', per);
  if (unidadId) { qu = qu.eq('id', unidadId); qs = qs.eq('unidad_id', unidadId); qc = qc.eq('unidad_id', unidadId); }
  const [conj, unis, saldos, cargos] = await Promise.all([q(sb.from('conjuntos').select(COLS_ID).eq('id', C()).single()), q(qu), q(qs), q(qc)]);
  let logo = null;
  if (conj.logo) { const u = await sb.storage.from('soportes').createSignedUrl(conj.logo, 3600); logo = u.data ? u.data.signedUrl : null; }
  return { per, conj, unis, saldos, cargos, logo };
}
function hojaCobro(u, d) {
  const { conj, per, logo } = d;
  const mes = d.cargos.filter(c => c.unidad_id === u.id);
  const totalMes = mes.reduce((s, c) => s + Number(c.valor), 0);
  const saldo = Number((d.saldos.find(s => s.unidad_id === u.id) || {}).saldo || 0);
  const anterior = saldo - totalMes;
  const vence = mes.length ? mes.map(c => c.vence).sort()[0] : null;
  const nombreMes = pd(per).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
  const contacto = [conj.telefono && 'Tel. ' + esc(conj.telefono), conj.email && esc(conj.email)].filter(Boolean).join(' · ');
  return `<section class="hoja">
    <header class="hoja-top">${logo ? `<img src="${logo}" alt="Logo" class="hoja-logo">` : ''}<div class="grow"><h2>${esc(conj.nombre)}</h2><div>${conj.nit ? 'NIT ' + esc(conj.nit) : ''}${conj.direccion ? ' · ' + esc(conj.direccion) : ''}${conj.ciudad ? ' · ' + esc(conj.ciudad) : ''}</div>${contacto ? `<div>${contacto}</div>` : ''}</div>
      <div class="hoja-num"><b>CUENTA DE COBRO</b><span>N.º ${per.slice(0, 7).replace('-', '')}-${esc(u.codigo)}</span><span>${fecha(HOY())}</span></div></header>
    <div class="hoja-dest"><div><span>Unidad</span><b>${esc(u.codigo)}</b></div><div><span>Propietario</span><b>${esc(u.propietario || '—')}</b></div><div><span>Coeficiente</span><b>${Number(u.coeficiente || 0).toLocaleString('es-CO', { maximumFractionDigits: 4 })}%</b></div><div><span>Periodo</span><b>${nombreMes}</b></div></div>
    <table class="hoja-tabla"><thead><tr><th>Concepto</th><th>Valor</th></tr></thead><tbody>
      ${anterior !== 0 ? `<tr><td>${anterior > 0 ? 'Saldo anterior pendiente' : 'Saldo a favor'}</td><td>${fmt(anterior)}</td></tr>` : ''}
      ${mes.map(c => `<tr><td>${esc(c.concepto)} · ${nombreMes}</td><td>${fmt(c.valor)}</td></tr>`).join('') || '<tr><td>Sin cargos liquidados este mes</td><td>$0</td></tr>'}
      <tr class="tot"><td>TOTAL A PAGAR</td><td>${fmt(Math.max(saldo, 0))}</td></tr></tbody></table>
    ${vence ? `<div class="hoja-vence">Fecha límite de pago: <b>${fecha(vence)}</b></div>` : ''}
    <div class="hoja-pago"><b>Datos para el pago</b>
      ${conj.banco ? `<div>${esc(conj.banco)} · Cuenta ${esc(conj.tipo_cuenta || '').toLowerCase()} <b>${esc(conj.numero_cuenta || '')}</b>${conj.titular_cuenta ? ' · a nombre de ' + esc(conj.titular_cuenta) : ''}</div>` : '<div>La administración aún no ha registrado la cuenta bancaria.</div>'}
      ${conj.convenio ? `<div>Convenio de recaudo: <b>${esc(conj.convenio)}</b></div>` : ''}
      <div>Referencia de pago: <b class="ref">${esc(referenciaDe(u, conj))}</b></div>
      <div class="sub">Después de pagar, sube el comprobante en la app (Pagos → Reportar un pago).</div></div>
    ${conj.nota_cobro ? `<p class="hoja-nota">${nl(conj.nota_cobro)}</p>` : ''}
    <footer class="hoja-firmas">
      ${conj.rep_legal ? `<div><b>${esc(conj.rep_legal)}</b><span>Representante legal${conj.rep_legal_doc ? ' · ' + esc(conj.rep_legal_doc) : ''}</span></div>` : ''}
      ${conj.revisor_fiscal ? `<div><b>${esc(conj.revisor_fiscal)}</b><span>Revisor fiscal${conj.revisor_tp ? ' · T.P. ' + esc(conj.revisor_tp) : ''}</span></div>` : ''}
      ${conj.auxiliar ? `<div><b>${esc(conj.auxiliar)}</b><span>Auxiliar administrativo${conj.auxiliar_telefono ? ' · ' + esc(conj.auxiliar_telefono) : ''}${conj.auxiliar_email ? ' · ' + esc(conj.auxiliar_email) : ''}</span></div>` : ''}
    </footer>
    <div class="hoja-pie">Documento de cobro de expensas comunes de propiedad horizontal. No es factura electrónica de venta.</div>
  </section>`;
}
V.cobro = async () => {
  const unidad = R() ? U() : S.sub.unidad;
  const d = await datosCobro(unidad);
  const unis = R() ? d.unis : (S.sub.solo ? d.unis.filter(u => Number((d.saldos.find(s => s.unidad_id === u.id) || {}).saldo || 0) > 0) : d.unis);
  return `<div class="stack"><div class="row noprint" style="gap:8px;flex-wrap:wrap"><button class="btn sm ghost" data-act="tab" data-v="${R() ? 'pagos' : 'cartera'}">‹ Volver</button>
    <button class="btn sm" data-act="imprimir">Imprimir o guardar PDF</button>
    ${!R() && !unidad ? `<button class="btn sm ghost" data-act="sub" data-k="solo" data-v="${S.sub.solo ? '' : '1'}" data-keep="1">${S.sub.solo ? 'Ver todas las unidades' : 'Solo unidades con saldo'}</button>` : ''}</div>
    ${!R() && !unidad ? `<div class="card sub noprint">${unis.length} cuentas de cobro de ${pd(d.per).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })}. Al imprimir, cada unidad sale en su propia hoja.</div>` : ''}
    ${unis.map(u => hojaCobro(u, d)).join('') || '<div class="card">No hay unidades para mostrar.</div>'}</div>`;
};

/* ---------- accesos: residente en Pagos, administración en Cartera ---------- */
const _pagos = V.pagos;
V.pagos = async () => {
  const [html, conj, uni] = await Promise.all([_pagos(), q(sb.from('conjuntos').select(COLS_ID).eq('id', C()).single()), q(sb.from('unidades').select('codigo, referencia').eq('id', U()).maybeSingle())]);
  const banco = conj.banco ? `<div class="card stack" style="gap:6px"><h3>Dónde pagar</h3>
    <div>${esc(conj.banco)} · Cuenta ${esc(conj.tipo_cuenta || '').toLowerCase()} <b style="user-select:all">${esc(conj.numero_cuenta || '')}</b></div>
    ${conj.titular_cuenta ? `<div class="sub">A nombre de ${esc(conj.titular_cuenta)}${conj.nit ? ' · NIT ' + esc(conj.nit) : ''}</div>` : ''}
    ${conj.convenio ? `<div>Convenio: <b style="user-select:all">${esc(conj.convenio)}</b></div>` : ''}
    <div>Tu referencia de pago: <b style="user-select:all">${esc(referenciaDe(uni || {}, conj))}</b></div>
    <button class="btn sm ghost" data-act="tab" data-v="cobro" style="align-self:flex-start">Ver mi cuenta de cobro</button></div>`
    : `<button class="btn ghost" data-act="tab" data-v="cobro">Ver mi cuenta de cobro</button>`;
  const i = html.indexOf('<form class="card form" data-form="reportarPago">');
  return i > 0 ? html.slice(0, i) + banco + html.slice(i) : html + banco;
};
const _cartera = V.cartera;
V.cartera = async () => {
  const html = await _cartera();
  const btn = `<div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn sm" data-act="ir" data-v="cobro">${svg('cobro').replace('<svg', '<svg width="16" height="16" style="vertical-align:-3px"')} Cuentas de cobro del mes</button></div>`;
  return html.replace('<div class="stack">', '<div class="stack">' + btn);
};

/* ---------- guardar ---------- */
Object.assign(FORM, {
  identidad: async (f, form) => {
    const logo = form.logo.files[0] ? await subir(form.logo.files[0], 'logo') : null;
    const datos = {};
    ['telefono', 'email', 'rep_legal', 'rep_legal_doc', 'revisor_fiscal', 'revisor_tp', 'revisor_email', 'auxiliar', 'auxiliar_telefono', 'auxiliar_email', 'banco', 'tipo_cuenta', 'numero_cuenta', 'titular_cuenta', 'convenio', 'nota_cobro'].forEach(k => datos[k] = (f[k] || '').trim() || null);
    datos.referencia_formato = (f.referencia_formato || '').trim() || '{codigo}';
    if (logo) datos.logo = logo;
    await q(sb.from('conjuntos').update(datos).eq('id', C()));
    if (logo) cargarLogo();
    toast('Datos guardados. Ya salen en las cuentas de cobro.'); render();
  }
});
