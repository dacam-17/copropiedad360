/* =====================================================================
   SYAPH360 · Carga masiva de unidades (Excel o CSV)
   Código personalizado, tipo de inmueble, coeficiente y datos del
   propietario: cédula, nombres, apellidos, teléfono y correo.
   Una sola planilla puede traer unidades de varios conjuntos.
   ===================================================================== */

const TIPOS_INMUEBLE = ['Apartamento', 'Casa', 'Local', 'Oficina', 'Consultorio', 'Parqueadero', 'Depósito', 'Bodega', 'Lote', 'Otro'];
const sinTilde = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const COLS_CARGA = [
  ['conjunto', ['conjunto', 'conjunto residencial', 'copropiedad', 'edificio']],
  ['codigo', ['codigo', 'codigo unidad', 'unidad', 'inmueble', 'apto', 'apartamento']],
  ['tipo', ['tipo', 'tipo de inmueble', 'tipo inmueble', 'clase']],
  ['coeficiente', ['coeficiente', 'coef', 'coef.', 'coeficiente %', '%']],
  ['documento', ['cedula', 'documento', 'cc', 'c.c.', 'nit', 'identificacion', 'cedula propietario']],
  ['nombres', ['nombres', 'nombre', 'nombre propietario']],
  ['apellidos', ['apellidos', 'apellido']],
  ['telefono', ['telefono', 'celular', 'movil', 'tel', 'tel.', 'whatsapp']],
  ['email', ['correo', 'email', 'e-mail', 'correo electronico', 'mail']],
  ['referencia', ['referencia', 'referencia de pago', 'referencia bancaria']]
];
const ORDEN_SIN_ENCABEZADO = ['codigo', 'tipo', 'coeficiente', 'documento', 'nombres', 'apellidos', 'telefono', 'email', 'referencia'];
let CARGA = null;   // { filas, errores, avisos, nombreArchivo }

/* ---------- lectura de archivos ---------- */
function cargarScript(src) {
  return new Promise((ok, mal) => { if (document.querySelector(`script[src="${src}"]`) && window.XLSX) return ok(); const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => mal(new Error('No pude abrir el lector de Excel. Guarda el archivo como CSV e inténtalo de nuevo.')); document.head.appendChild(s); });
}
function partirCSV(texto) {
  const lineas = texto.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  if (!lineas.length) return [];
  const sep = lineas[0].includes('\t') ? '\t' : lineas[0].includes(';') ? ';' : ',';
  return lineas.map(l => {
    const out = []; let cur = '', dentro = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (ch === '"') { if (dentro && l[i + 1] === '"') { cur += '"'; i++; } else dentro = !dentro; }
      else if (ch === sep && !dentro) { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur); return out.map(s => s.trim());
  });
}
async function leerArchivo(file) {
  if (/\.(xlsx|xls|ods)$/i.test(file.name)) {
    await cargarScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const hoja = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(hoja, { header: 1, raw: false, defval: '' }).map(r => r.map(c => String(c).trim())).filter(r => r.some(Boolean));
  }
  return partirCSV(await file.text());
}

/* ---------- interpretación y validación ---------- */
function interpretar(matriz) {
  if (!matriz.length) throw new Error('El archivo está vacío.');
  const enc = matriz[0].map(sinTilde);
  const mapa = {};
  enc.forEach((h, i) => { const c = COLS_CARGA.find(([, al]) => al.includes(h)); if (c && mapa[c[0]] === undefined) mapa[c[0]] = i; });
  let datos = matriz;
  if (mapa.codigo !== undefined) datos = matriz.slice(1);
  else ORDEN_SIN_ENCABEZADO.forEach((k, i) => mapa[k] = i);
  const val = (r, k) => mapa[k] === undefined ? '' : String(r[mapa[k]] ?? '').trim();

  const admins = S.ctxs.filter(c => c.rol === 'admin');
  const errores = [], avisos = [], vistos = new Set();
  const filas = datos.map((r, i) => {
    const n = i + (datos === matriz ? 1 : 2);
    const f = { fila: n, codigo: val(r, 'codigo').toUpperCase().replace(/\s+/g, ' '), errores: [] };
    const nc = val(r, 'conjunto');
    const ctx = nc ? admins.find(c => sinTilde(c.nombre) === sinTilde(nc)) : S.ctx;
    if (!ctx) f.errores.push(`el conjunto "${nc}" no está entre los que administras`);
    f.conjunto_id = ctx ? ctx.conjunto_id : null; f.conjunto = ctx ? ctx.nombre : nc;
    if (!f.codigo) f.errores.push('falta el código de la unidad');
    const t = val(r, 'tipo');
    f.tipo = t ? (TIPOS_INMUEBLE.find(x => sinTilde(x) === sinTilde(t)) || (sinTilde(t).startsWith('apto') ? 'Apartamento' : sinTilde(t).startsWith('parq') ? 'Parqueadero' : sinTilde(t).startsWith('depo') ? 'Depósito' : null)) : 'Apartamento';
    if (!f.tipo) f.errores.push(`tipo "${t}" no reconocido (usa: ${TIPOS_INMUEBLE.join(', ')})`);
    const co = val(r, 'coeficiente').replace('%', '').replace(/\s/g, '');
    f.coeficiente = co ? Number(co.includes(',') ? co.replace(/\./g, '').replace(',', '.') : co) : 0;
    if (!Number.isFinite(f.coeficiente) || f.coeficiente < 0 || f.coeficiente > 100) f.errores.push(`coeficiente "${co}" inválido`);
    f.doc_propietario = val(r, 'documento').replace(/[^\dA-Za-z-]/g, '') || null;
    f.nombres = val(r, 'nombres') || null; f.apellidos = val(r, 'apellidos') || null;
    f.propietario = [f.nombres, f.apellidos].filter(Boolean).join(' ') || null;
    f.telefono = val(r, 'telefono').replace(/[^\d+]/g, '') || null;
    if (f.telefono && f.telefono.replace(/\D/g, '').length < 7) f.errores.push(`teléfono "${val(r, 'telefono')}" incompleto`);
    f.email = val(r, 'email').toLowerCase() || null;
    if (f.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) f.errores.push(`correo "${f.email}" inválido`);
    f.referencia = val(r, 'referencia') || null;
    const clave = f.conjunto_id + '|' + f.codigo;
    if (f.codigo && vistos.has(clave)) f.errores.push(`el código ${f.codigo} está repetido en el archivo`);
    vistos.add(clave);
    f.errores.forEach(e => errores.push(`Fila ${n}: ${e}`));
    return f;
  }).filter(f => f.codigo || f.errores.length > 1);
  if (!filas.length) throw new Error('No encontré unidades en el archivo.');
  const porConj = {};
  filas.forEach(f => { if (f.conjunto_id) (porConj[f.conjunto_id] = porConj[f.conjunto_id] || { nombre: f.conjunto, coef: 0, n: 0 }), porConj[f.conjunto_id].coef += f.coeficiente, porConj[f.conjunto_id].n++; });
  Object.values(porConj).forEach(c => { if (c.coef > 100.5) avisos.push(`En ${c.nombre} los coeficientes del archivo suman ${c.coef.toLocaleString('es-CO', { maximumFractionDigits: 4 })}: el total del conjunto debe ser 100.`); });
  const sinCorreo = filas.filter(f => !f.email).length;
  if (sinCorreo) avisos.push(`${sinCorreo} unidades sin correo: quedan cargadas, pero sus residentes no reciben acceso hasta que lo agregues.`);
  return { filas, errores, avisos, porConj };
}

/* ---------- plantilla ---------- */
function plantillaCSV() {
  const enc = ['Conjunto', 'Código', 'Tipo', 'Coeficiente', 'Cédula', 'Nombres', 'Apellidos', 'Teléfono', 'Correo', 'Referencia de pago'];
  const n = S.ctx ? S.ctx.nombre : 'Mi conjunto';
  const ej = [
    [n, 'T1-101', 'Apartamento', '0,52', '1020304050', 'Laura', 'Méndez Gómez', '3001234567', 'laura@correo.com', ''],
    [n, 'T1-102', 'Apartamento', '0,48', '79888777', 'Andrés', 'Ríos', '3109876543', 'andres@correo.com', ''],
    [n, 'L-01', 'Local', '1,20', '900123456', 'Panadería', 'La Esquina SAS', '6015550000', 'local01@correo.com', ''],
    [n, 'P-15', 'Parqueadero', '0,10', '1020304050', 'Laura', 'Méndez Gómez', '3001234567', '', '']
  ];
  const csv = '﻿' + [enc, ...ej].map(r => r.map(c => /[;"\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = 'plantilla-unidades-syaph360.csv'; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* ---------- vista dentro de Ajustes ---------- */
function bloqueCarga() {
  const multi = S.ctxs.filter(c => c.rol === 'admin').length > 1;
  if (CARGA) {
    const { filas, errores, avisos, porConj } = CARGA;
    const buenas = filas.filter(f => !f.errores.length);
    const tipos = {}; buenas.forEach(f => tipos[f.tipo] = (tipos[f.tipo] || 0) + 1);
    return `<div class="stack mt" style="gap:10px">
      <div class="row" style="gap:8px;flex-wrap:wrap;justify-content:flex-start"><b>${esc(CARGA.nombreArchivo)}</b><span class="chip ok">${buenas.length} listas</span>${errores.length ? `<span class="chip bad">${filas.length - buenas.length} con errores</span>` : ''}</div>
      <div class="sub">${Object.values(porConj).map(c => `${esc(c.nombre)}: ${c.n}`).join(' · ')}<br>${Object.entries(tipos).map(([t, n]) => `${n} ${t.toLowerCase()}${n > 1 ? (/[aeiou]$/i.test(t) ? 's' : 'es') : ''}`).join(' · ')}</div>
      ${errores.length ? `<div class="card" style="border-color:var(--bad);background:var(--bad-soft)"><b>Corrige estas filas en tu archivo y vuelve a subirlo</b><ul class="sub" style="margin:6px 0 0;padding-left:18px">${errores.slice(0, 15).map(e => `<li>${esc(e)}</li>`).join('')}${errores.length > 15 ? `<li>… y ${errores.length - 15} más</li>` : ''}</ul></div>` : ''}
      ${avisos.map(a => `<div class="sub">⚠ ${esc(a)}</div>`).join('')}
      <div class="tblwrap"><table class="tbl"><thead><tr><th>Fila</th>${multi ? '<th>Conjunto</th>' : ''}<th>Código</th><th>Tipo</th><th>Coef.</th><th>Propietario</th><th>Cédula</th><th>Teléfono</th><th>Correo</th></tr></thead><tbody>
        ${filas.slice(0, 200).map(f => `<tr ${f.errores.length ? 'style="background:var(--bad-soft)"' : ''}><td>${f.fila}</td>${multi ? `<td>${esc(f.conjunto || '')}</td>` : ''}<td><b>${esc(f.codigo)}</b></td><td>${esc(f.tipo || '?')}</td><td class="mono">${Number.isFinite(f.coeficiente) ? f.coeficiente.toLocaleString('es-CO', { maximumFractionDigits: 4 }) : '?'}</td><td>${esc(f.propietario || '')}</td><td>${esc(f.doc_propietario || '')}</td><td>${esc(f.telefono || '')}</td><td>${esc(f.email || '')}</td></tr>`).join('')}
      </tbody></table></div>${filas.length > 200 ? `<div class="sub">Mostrando 200 de ${filas.length} filas.</div>` : ''}
      <div class="row" style="gap:8px;justify-content:flex-start;flex-wrap:wrap">
        <button class="btn" data-act="cargaConfirmar" ${errores.length || !buenas.length ? 'disabled' : ''}>Cargar ${buenas.length} unidades</button>
        <button class="btn ghost" data-act="cargaCancelar">Cancelar</button></div>
      ${errores.length ? '<div class="sub">Para no dejar la información a medias, la carga se habilita cuando el archivo no tenga errores.</div>' : ''}</div>`;
  }
  return `<div class="stack mt" style="gap:10px">
    <p class="sub" style="margin:0">Sube un Excel o CSV con una unidad por fila. Columnas: ${multi ? '<b>Conjunto</b> (opcional, para cargar varios conjuntos en un solo archivo), ' : ''}<b>Código</b> (el que uses: T1-101, Casa 14, L-03…), <b>Tipo</b> (${TIPOS_INMUEBLE.slice(0, 6).join(', ').toLowerCase()}…), <b>Coeficiente</b>, <b>Cédula</b>, <b>Nombres</b>, <b>Apellidos</b>, <b>Teléfono</b>, <b>Correo</b> y, si quieres, <b>Referencia de pago</b>.</p>
    <div class="row" style="gap:8px;justify-content:flex-start;flex-wrap:wrap"><button class="btn sm ghost" type="button" data-act="cargaPlantilla">Descargar plantilla</button>
      <label class="btn sm" style="cursor:pointer">Subir Excel o CSV<input type="file" accept=".xlsx,.xls,.ods,.csv,.txt" data-chg="cargaArchivo" hidden></label></div>
    <details><summary class="sub">O pega las filas copiadas de Excel</summary><form class="form mt" data-form="cargaPegar"><textarea name="texto" rows="5" placeholder="Código;Tipo;Coeficiente;Cédula;Nombres;Apellidos;Teléfono;Correo&#10;T1-101;Apartamento;0,52;1020304050;Laura;Méndez;3001234567;laura@correo.com"></textarea><button class="btn sm" type="submit">Revisar</button></form></details>
    <p class="sub" style="margin:0">Si el código ya existe en el conjunto, se actualizan sus datos. A cada correo nuevo le llega acceso como residente cuando cree su cuenta con ese mismo correo.</p></div>`;
}

const _config2 = V.config;
V.config = async () => {
  let html = await _config2();
  if (!W()) return html;
  // Reemplaza el cargador antiguo y la tabla por la versión completa
  const ini = html.indexOf('<form class="form mt" data-form="importar">');
  const fin = html.indexOf('</tbody></table></div>', ini);
  if (ini < 0 || fin < 0) return html;
  const [unis, invs] = await Promise.all([
    q(sb.from('unidades').select('*').eq('conjunto_id', C()).order('codigo')),
    q(sb.from('invitaciones').select('unidad_id, usada').eq('conjunto_id', C()).eq('rol', 'residente'))
  ]);
  const filtro = S.sub.tipoU || '';
  const tiposHay = [...new Set(unis.map(u => u.tipo || 'Apartamento'))];
  const vis = filtro ? unis.filter(u => (u.tipo || 'Apartamento') === filtro) : unis;
  const tabla = `${tiposHay.length > 1 ? `<div class="qr tabsmant mt">${['', ...tiposHay].map(t => `<button class="btn sm ${filtro === t ? '' : 'ghost'}" data-act="sub" data-k="tipoU" data-v="${esc(t)}" data-keep="1">${t ? esc(t) + ' · ' + unis.filter(u => (u.tipo || 'Apartamento') === t).length : 'Todas · ' + unis.length}</button>`).join('')}</div>` : ''}
    <div class="tblwrap mt"><table class="tbl"><thead><tr><th>Código</th><th>Tipo</th><th>Coef.</th><th>Propietario</th><th>Cédula</th><th>Teléfono</th><th>Correo</th><th>Acceso</th></tr></thead><tbody>
    ${vis.map(u => { const inv = invs.find(i => i.unidad_id === u.id); return `<tr><td><b>${esc(u.codigo)}</b></td><td>${esc(u.tipo || 'Apartamento')}</td><td class="mono">${Number(u.coeficiente).toLocaleString('es-CO', { maximumFractionDigits: 4 })}</td><td>${esc(u.propietario || '')}</td><td>${esc(u.doc_propietario || '')}</td><td>${u.telefono ? `<a href="tel:${esc(u.telefono)}">${esc(u.telefono)}</a>` : ''}</td><td>${esc(u.email || '')}</td><td>${inv ? (inv.usada ? '<span class="chip ok">Activo</span>' : '<span class="chip warn">Invitado</span>') : '<span class="sub">—</span>'}</td></tr>`; }).join('') || '<tr><td colspan="8" class="sub">Sin unidades.</td></tr>'}`;
  html = html.slice(0, ini) + bloqueCarga() + tabla + html.slice(fin);
  if (CARGA) html = html.replace(/<details class="card" (open)?><summary><b>Unidades<\/b>/, '<details class="card" open><summary><b>Unidades</b>');
  return html;
};

/* ---------- acciones ---------- */
async function prepararCarga(matriz, nombre) {
  try { CARGA = { ...interpretar(matriz), nombreArchivo: nombre }; }
  catch (e) { CARGA = null; toast(e.message, 5000); }
  await render();
  const t = document.querySelector('[data-act="cargaConfirmar"], [data-act="cargaCancelar"]');
  if (t) t.closest('details').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
Object.assign(CHG, {
  cargaArchivo: async el => {
    const f = el.files[0]; if (!f) return;
    try { await prepararCarga(await leerArchivo(f), f.name); } catch (e) { toast(e.message, 5000); }
  }
});
Object.assign(FORM, {
  cargaPegar: async f => prepararCarga(partirCSV(f.texto || ''), 'Filas pegadas')
});
Object.assign(ACT, {
  cargaPlantilla: () => plantillaCSV(),
  cargaCancelar: () => { CARGA = null; render(); },
  cargaConfirmar: async (d, b) => {
    if (!CARGA) return;
    const buenas = CARGA.filas.filter(f => !f.errores.length);
    if (b) { b.disabled = true; b.textContent = 'Cargando…'; }
    let total = 0, invitados = 0; const fallos = [];
    const grupos = {}; buenas.forEach(f => (grupos[f.conjunto_id] = grupos[f.conjunto_id] || []).push(f));
    for (const [cid, fs] of Object.entries(grupos)) {
      try {
        const reg = fs.map(f => ({ conjunto_id: cid, codigo: f.codigo, tipo: f.tipo, coeficiente: f.coeficiente, doc_propietario: f.doc_propietario, nombres: f.nombres, apellidos: f.apellidos, propietario: f.propietario, telefono: f.telefono, email: f.email, ...(f.referencia ? { referencia: f.referencia } : {}) }));
        const unis = [];
        for (let i = 0; i < reg.length; i += 500) unis.push(...await q(sb.from('unidades').upsert(reg.slice(i, i + 500), { onConflict: 'conjunto_id,codigo' }).select('id, codigo, email')));
        const prev = await q(sb.from('invitaciones').select('email, unidad_id').eq('conjunto_id', cid).eq('rol', 'residente'));
        const nuevas = unis.filter(u => u.email && !prev.some(p => p.unidad_id === u.id && p.email.toLowerCase() === u.email))
          .map(u => ({ conjunto_id: cid, email: u.email, rol: 'residente', unidad_id: u.id }));
        if (nuevas.length) await q(sb.from('invitaciones').insert(nuevas));
        total += unis.length; invitados += nuevas.length;
      } catch (e) { fallos.push(`${fs[0].conjunto}: ${e.message}`); }
    }
    CARGA = null;
    if (fallos.length) toast(`Cargadas ${total}. No se pudo: ${fallos.join(' · ')}`, 8000);
    else toast(`${total} unidades cargadas · ${invitados} residentes invitados`, 5000);
    render();
  }
});
