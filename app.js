/* =====================================================================
   SYAPH360 - Al día · App piloto
   Interfaz de una sola página conectada a Supabase (base de datos,
   usuarios, archivos y chat en tiempo real).
   ===================================================================== */

const CFG = window.C360 || {};
const RECUPERACION = /type=recovery/.test(location.hash);   // enlace de "olvidé mi contraseña"
const CONFIG_OK = CFG.SUPABASE_URL && !CFG.SUPABASE_URL.includes('TU-PROYECTO');
const sb = CONFIG_OK ? supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY) : null;

/* ---------- utilidades ---------- */
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => '$' + Math.round(Number(n) || 0).toLocaleString('es-CO');
const millones = n => '$' + ((Number(n) || 0) / 1e6).toLocaleString('es-CO', { maximumFractionDigits: 1 }) + ' M';
const isoLocal = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const HOY = () => isoLocal(new Date());
const pd = s => new Date(String(s).slice(0, 10) + 'T00:00:00');
const dias = s => Math.round((pd(s) - pd(HOY())) / 864e5);
const fecha = s => s ? pd(s).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const fechaHora = s => s ? new Date(s).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';
const hora = s => new Date(s).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });
const addMonths = (s, n) => { const d = pd(s); d.setMonth(d.getMonth() + n); return isoLocal(d); };
const addDays = (s, n) => { const d = pd(s); d.setDate(d.getDate() + n); return isoLocal(d); };
const mesActual = () => HOY().slice(0, 7) + '-01';
const nl = s => esc(s).replace(/\n/g, '<br>');
const iniciales = s => String(s || '?').split(/[\s-]+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();

function traducir(e) {
  const m = (e && e.message) || String(e);
  if (m.includes('reservas_unica')) return 'Ese horario ya fue reservado. Escoge otro.';
  if (e && e.code === '23505') return 'Ese registro ya existe.';
  if ((e && e.code === '42501') || m.includes('row-level security')) return 'No tienes permiso para hacer esto en este conjunto.';
  if (m.includes('Invalid login')) return 'Correo o contraseña incorrectos.';
  if (m.includes('Email not confirmed')) return 'Confirma tu correo: te enviamos un enlace cuando te registraste.';
  if (m.includes('Password should be')) return 'La contraseña debe tener al menos 6 caracteres.';
  if (m.includes('already registered')) return 'Ese correo ya tiene cuenta. Inicia sesión.';
  if (m.includes('Failed to fetch')) return 'No hay conexión con el servidor. Revisa tu internet.';
  return m;
}
async function q(p) { const r = await p; if (r.error) throw r.error; return r.data; }
function toast(t, ms = 2600) { const e = $('toast'); e.textContent = t; e.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => e.hidden = true, ms); }

const ICONS = {
  inicio: '<path d="M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z"/>',
  cartera: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h4"/>',
  mant: '<path d="M14.7 6.3a4 4 0 00-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 005.4-5.4l-2.5 2.5-2.5-.5-.5-2.5z"/>',
  pqrs: '<path d="M4 5h16v11H8l-4 4z"/><path d="M8 9h8M8 12h5"/>',
  asamblea: '<circle cx="8" cy="9" r="3"/><circle cx="16" cy="9" r="3"/><path d="M2 20c0-3 3-5 6-5s6 2 6 5M12 20c0-3 2-5 4-5s6 2 6 5"/>',
  reservas: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M8 15l2.5 2.5L16 13"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/><path d="M9 10.5h.01M12 10.5h.01M15 10.5h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  mas: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  config: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  dano: '<path d="M12 3l9 16H3z"/><path d="M12 10v4M12 16.5v.5"/>'
};
const svg = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[k] || ICONS.mas}</svg>`;
const chipEstado = { 'Reportada': 'warn', 'En curso': 'info', 'Cerrada': 'ok', 'Abierta': 'warn', 'Respondida': 'ok', 'Confirmada': 'ok', 'Pendiente depósito': 'warn', 'Cancelada': 'bad', 'pendiente': 'warn', 'aprobado': 'ok', 'rechazado': 'bad' };
const chipPrio = { 'Alta': 'bad', 'Media': 'warn', 'Baja': 'info' };
const etiquetaPago = { pendiente: 'En revisión', aprobado: 'Aprobado', rechazado: 'Rechazado' };

/* ---------- estado ---------- */
const S = { user: null, ctxs: [], ctx: null, view: 'cargando', sub: {}, unread: 0, canal: null, token: 0 };
const C = () => S.ctx && S.ctx.conjunto_id;
const U = () => S.ctx && S.ctx.unidad_id;
const ROL = () => S.ctx && S.ctx.rol;
const W = () => ROL() === 'admin' && S.ctx.vigente !== false;                 // puede escribir como administración
const R = () => ROL() === 'residente';
const gestiona = () => S.ctxs.some(c => c.rol === 'admin' || c.rol === 'consejo');
const inicioDe = c => c.rol === 'residente' ? 'rinicio' : c.rol === 'porteria' ? 'porteria' : 'inicio';

const TABS = {
  admin: [['inicio', 'Inicio'], ['cartera', 'Cartera'], ['mant', 'Mantenim.'], ['chat', 'Chat'], ['mas', 'Más']],
  consejo: [['inicio', 'Inicio'], ['cartera', 'Cartera'], ['mant', 'Mantenim.'], ['reservas', 'Reservas'], ['mas', 'Más']],
  residente: [['rinicio', 'Inicio'], ['pagos', 'Pagos'], ['reservas', 'Reservas'], ['chat', 'Chat'], ['rmas', 'Más']]
};
const SIN_NAV = ['login', 'cargando', 'sinacceso', 'nuevo', 'contextos', 'clave', 'portafolio', 'config_falta'];

/* ---------- navegación ---------- */
function go(view, sub) { S.view = view; S.sub = sub || {}; render(); window.scrollTo(0, 0); }

function header() {
  const top = $('top'), sinHeader = ['login', 'cargando', 'config_falta', 'clave'].includes(S.view);
  top.hidden = sinHeader;
  if (sinHeader) return;
  const enPortafolio = S.view === 'portafolio' || !S.ctx || ['sinacceso', 'nuevo', 'contextos'].includes(S.view);
  $('htitle').textContent = enPortafolio ? (S.view === 'contextos' ? 'Mis accesos' : 'Mis conjuntos') : S.ctx.nombre;
  $('hsub').textContent = enPortafolio ? (S.user ? S.user.email : '')
    : R() ? `Apto ${S.ctx.unidad_codigo || ''} · Residente` : `${S.ctx.ciudad || ''}${S.ctx.ciudad ? ' · ' : ''}${ROL() === 'admin' ? 'Administración' : ROL() === 'porteria' ? 'Portería' : 'Consejo de administración'}`;
  const cb = $('conjBtn');
  cb.hidden = !(gestiona() && S.ctx && !enPortafolio);
  cb.innerHTML = `▦ Todos mis conjuntos`;
  $('roleBtn').textContent = 'Cuenta ⇄';
}

function nav() {
  const show = S.ctx && !SIN_NAV.includes(S.view);
  $('navWrap').hidden = !show;
  if (!show) return;
  const tabs = TABS[ROL()];
  const enMas = ['mas', 'rmas'];
  const deMas = { admin: ['reservas', 'pqrs', 'asamblea', 'info', 'config', 'inventario', 'activo', 'qrs', 'documentos', 'reportes', 'reportar', 'bitacora', 'notificaciones'], consejo: ['pqrs', 'asamblea', 'info', 'inventario', 'activo', 'qrs', 'documentos', 'reportes', 'reportar', 'bitacora', 'notificaciones'], residente: ['rpqrs', 'rdano', 'asamblea', 'info', 'documentos', 'reportar', 'misreportes', 'misvisitas', 'mispaquetes', 'notificaciones'], porteria: ['reportar', 'notificaciones'] }[ROL()] || [];
  $('nav').innerHTML = tabs.map(([k, l]) => {
    const cur = S.view === k || (enMas.includes(k) && deMas.includes(S.view));
    const ico = k === 'rinicio' ? 'inicio' : k === 'pagos' ? 'cartera' : k === 'rmas' ? 'mas' : k;
    return `<button data-act="tab" data-v="${k}" aria-current="${cur}">${k === 'chat' && S.unread ? `<span class="nbadge">${S.unread}</span>` : ''}${svg(ico)}${l}</button>`;
  }).join('');
}

async function render() {
  header(); nav();
  const fn = V[S.view];
  const t = ++S.token;
  const app = $('app');
  if (!fn) { app.innerHTML = ''; return; }
  if (!app.innerHTML || S.view !== app.dataset.view) app.innerHTML = '<div class="loading">Cargando…</div>';
  app.dataset.view = S.view;
  try {
    const html = await fn();
    if (t !== S.token) return;
    app.innerHTML = `<div class="view">${html}</div>`;
    if (AFTER[S.view]) AFTER[S.view]();
    if (window.despuesDeRender) window.despuesDeRender();
  } catch (e) {
    console.error(e);
    if (t !== S.token) return;
    app.innerHTML = `<div class="card"><h3>No se pudo cargar esta sección</h3><p class="sub">${esc(traducir(e))}</p><button class="btn sm" data-act="recargar">Intentar de nuevo</button></div>`;
  }
}

/* ---------- sesión y accesos ---------- */
async function cargarAccesos() {
  try { await sb.rpc('reclamar_invitaciones'); } catch (e) { /* sin invitaciones */ }
  const rows = await q(sb.from('miembros').select('rol, unidad_id, conjunto_id, conjuntos(id, nombre, ciudad)').eq('user_id', S.user.id));
  const uids = rows.filter(r => r.unidad_id).map(r => r.unidad_id);
  const unis = uids.length ? await q(sb.from('unidades').select('id, codigo').in('id', uids)) : [];
  S.ctxs = rows.filter(r => r.conjuntos).map(r => ({
    conjunto_id: r.conjunto_id, rol: r.rol, unidad_id: r.unidad_id,
    nombre: r.conjuntos.nombre, ciudad: r.conjuntos.ciudad,
    unidad_codigo: (unis.find(u => u.id === r.unidad_id) || {}).codigo
  })).filter(c => c.rol !== 'residente' || c.unidad_id)
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}

async function inicioSesion() {
  await cargarAccesos();
  if (typeof rutaQR === 'function' && await rutaQR()) return;
  if (!S.ctxs.length) return go(S.plat && S.plat.dueno ? 'plataforma' : 'sinacceso');
  if (gestiona()) { S.ctx = null; return go('portafolio'); }
  setCtx(S.ctxs[0]); go(inicioDe(S.ctxs[0]));
}

function setCtx(ctx) {
  S.ctx = ctx;
  try { localStorage.setItem('c360_ctx', ctx ? ctx.conjunto_id + '|' + ctx.rol : ''); } catch (e) { }
  suscribirChat();
  refrescarNoLeidos();
}

function suscribirChat() {
  if (S.canal) { sb.removeChannel(S.canal); S.canal = null; }
  if (!S.ctx || ROL() === 'consejo' || ROL() === 'porteria') return;
  S.canal = sb.channel('chat-' + C())
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes', filter: 'conjunto_id=eq.' + C() }, () => {
      if (S.view === 'chat') render(); else refrescarNoLeidos();
    }).subscribe();
}

async function refrescarNoLeidos() {
  if (!S.ctx || ROL() === 'consejo' || ROL() === 'porteria') { S.unread = 0; nav(); return; }
  let p = sb.from('mensajes').select('id', { count: 'exact', head: true }).eq('conjunto_id', C()).eq('leido', false);
  p = R() ? p.eq('de_admin', true).eq('unidad_id', U()) : p.eq('de_admin', false);
  const r = await p;
  S.unread = r.count || 0; nav();
}

/* ---------- subir archivos ---------- */
async function subir(file, carpeta) {
  if (!file || !file.size) return null;
  if (file.size > 8 * 1024 * 1024) throw new Error('El archivo pesa más de 8 MB. Toma una foto más liviana o un PDF más pequeño.');
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  const path = `${C()}/${carpeta}/${crypto.randomUUID()}.${ext}`;
  await q(sb.storage.from('soportes').upload(path, file, { contentType: file.type || undefined }));
  return path;
}
async function abrirArchivo(path) {
  const w = window.open('', '_blank');
  const { data, error } = await sb.storage.from('soportes').createSignedUrl(path, 300);
  if (error) { if (w) w.close(); return toast(traducir(error)); }
  if (w) w.location = data.signedUrl; else location.href = data.signedUrl;
}

/* =====================================================================
   VISTAS
   ===================================================================== */
const V = {};
const AFTER = {};

V.cargando = async () => '<div class="loading">Cargando…</div>';

V.config_falta = async () => `<div class="card stack" style="margin-top:20px"><h2>Falta conectar la base de datos</h2>
  <p>Abre el archivo <b>config.js</b> y pega la URL y la clave pública (anon key) de tu proyecto de Supabase. Los pasos están en la guía de instalación.</p></div>`;

/* ---------- ingreso ---------- */
V.login = async () => {
  const m = S.sub.modo || 'entrar';
  const tabs = `<div class="seg" role="group" aria-label="Acceso">${[['entrar', 'Iniciar sesión'], ['registro', 'Crear cuenta']].map(([k, l]) => `<button data-act="modo" data-v="${k}" aria-pressed="${m === k}">${l}</button>`).join('')}</div>`;
  let f = '';
  if (m === 'entrar') f = `<form class="form" data-form="login">
      <div><label for="l-e">Correo</label><input id="l-e" name="email" type="email" autocomplete="email" required></div>
      <div><label for="l-p">Contraseña</label><input id="l-p" name="pass" type="password" autocomplete="current-password" required></div>
      <button class="btn" type="submit">Entrar</button>
      <button class="linkbtn" type="button" data-act="modo" data-v="recuperar">Olvidé mi contraseña</button></form>`;
  else if (m === 'registro') f = `<form class="form" data-form="registro">
      <div><label for="r-n">Nombre completo</label><input id="r-n" name="nombre" autocomplete="name" required></div>
      <div><label for="r-e">Correo</label><input id="r-e" name="email" type="email" autocomplete="email" required></div>
      <div><label for="r-p">Contraseña (mínimo 6 caracteres)</label><input id="r-p" name="pass" type="password" minlength="6" autocomplete="new-password" required></div>
      <p class="sub" style="margin:0">Si eres residente, usa el mismo correo que registraste en la administración de tu conjunto.</p>
      <label class="check"><input type="checkbox" name="datos" required> Autorizo el tratamiento de mis datos personales según la política de la copropiedad (Ley 1581 de 2012).</label>
      <button class="btn" type="submit">Crear cuenta</button></form>`;
  else f = `<form class="form" data-form="recuperar">
      <div><label for="rc-e">Correo de tu cuenta</label><input id="rc-e" name="email" type="email" required></div>
      <button class="btn" type="submit">Enviarme el enlace</button>
      <button class="linkbtn" type="button" data-act="modo" data-v="entrar">Volver</button></form>`;
  return `<div class="login"><div class="brand"><div class="logo">${svg('inicio')}</div><div><div class="eyebrow">Tu conjunto, en orden</div><h1>SYAPH360 <span class="tag">Al día</span></h1></div></div>
    <div class="card stack">${m !== 'recuperar' ? tabs : '<h2>Recuperar contraseña</h2>'}${f}</div></div>`;
};

V.clave = async () => `<div class="login"><div class="card stack"><h2>Nueva contraseña</h2>
  <form class="form" data-form="clave"><div><label for="nc-p">Escribe tu nueva contraseña</label><input id="nc-p" name="pass" type="password" minlength="6" required></div>
  <button class="btn" type="submit">Guardar</button></form></div></div>`;

V.sinacceso = async () => `<div class="stack">
  <div class="card stack"><h2>Aún no tienes un conjunto asignado</h2>
  <p><b>Si eres residente:</b> pide a la administración de tu conjunto que registre tu correo <b>${esc(S.user.email)}</b> en tu apartamento. Cuando lo hagan, toca el botón de abajo.</p>
  <button class="btn ghost" data-act="reintentar">Ya me registraron, revisar de nuevo</button></div>
  <div class="card stack"><p><b>Si administras copropiedades:</b> solicita tu acceso. Cuando confirmemos el pago, podrás crear tus conjuntos.</p>
  <button class="btn" data-act="ir" data-v="nuevo">Soy administrador</button></div>
  <button class="linkbtn" data-act="salir">Cerrar sesión</button></div>`;

V.nuevo = async () => `<div class="stack"><h2>Nuevo conjunto</h2>
  <form class="card form" data-form="nuevoConj">
    <div><label for="nc-n">Nombre de la copropiedad</label><input id="nc-n" name="nombre" required placeholder="Ej. Conjunto Residencial Altos del Retiro"></div>
    <div class="two"><div><label for="nc-nit">NIT</label><input id="nc-nit" name="nit"></div><div><label for="nc-c">Ciudad</label><input id="nc-c" name="ciudad"></div></div>
    <div><label for="nc-p">Presupuesto mensual de cuotas ordinarias</label><input id="nc-p" name="pres" type="number" min="0" step="1000" placeholder="Total que se recauda al mes"></div>
    <p class="sub" style="margin:0">Con ese total y el coeficiente de cada unidad, la app liquida la cuota de cada apartamento.</p>
    <button class="btn" type="submit">Crear conjunto</button></form>
  ${S.ctxs.length ? '<button class="linkbtn" data-act="volver">Cancelar</button>' : ''}</div>`;

V.contextos = async () => {
  const g = S.ctxs.filter(c => c.rol !== 'residente'), r = S.ctxs.filter(c => c.rol === 'residente');
  const fila = c => `<button class="card navcard" data-act="entrar" data-id="${c.conjunto_id}" data-rol="${c.rol}"><div class="ico">${iniciales(c.nombre)}</div><div class="grow"><h3>${esc(c.nombre)}</h3><div class="sub">${c.rol === 'admin' ? 'Administración' : c.rol === 'consejo' ? 'Consejo' : c.rol === 'porteria' ? 'Portería' : 'Residente · ' + esc(c.unidad_codigo)}</div></div><span class="sub">›</span></button>`;
  return `<div class="stack">
    ${g.length ? `<button class="btn" data-act="ir" data-v="portafolio">▦ Panel de todos mis conjuntos</button>` : ''}
    ${g.length ? `<h3>Conjuntos que gestiono</h3>${g.map(fila).join('')}` : ''}
    ${r.length ? `<h3>Donde vivo</h3>${r.map(fila).join('')}` : ''}
    <button class="btn ghost" data-act="ir" data-v="nuevo">+ Crear un conjunto nuevo</button>
    <button class="linkbtn" data-act="salir">Cerrar sesión (${esc(S.user.email)})</button></div>`;
};

/* ---------- panel consolidado ---------- */
const salud = s => {
  const pct = s.cargado_mes > 0 ? s.recaudado_mes / s.cargado_mes : 1;
  const p = Number(s.mant_vencidos) * 2 + (pct < .8 ? 3 : pct < .9 ? 1 : 0) + Number(s.ordenes_altas) + (s.pqrs_abiertas > 3 ? 1 : 0);
  return p >= 5 ? ['Requiere atención', 'bad'] : p >= 2 ? ['Seguimiento', 'warn'] : ['En orden', 'ok'];
};

V.portafolio = async () => {
  const [rows, agenda] = await Promise.all([
    q(sb.rpc('resumen_portafolio')),
    q(sb.from('mant_plan').select('activo, proveedor, proximo, conjunto_id').gte('proximo', HOY()).lte('proximo', addDays(HOY(), 21)).order('proximo').limit(8))
  ]);
  if (!rows.length) return V.sinacceso();
  const n = k => rows.reduce((a, r) => a + Number(r[k] || 0), 0);
  const cargado = n('cargado_mes'), rec = n('recaudado_mes');
  const pct = cargado ? Math.round(rec / cargado * 100) : 0;
  const nom = id => (rows.find(r => r.conjunto_id === id) || {}).nombre || '';
  const alertas = [];
  rows.forEach(r => {
    if (r.mant_vencidos > 0) alertas.push({ r, sev: 'bad', go: 'mant', t: `${r.mant_vencidos} mantenimiento${r.mant_vencidos > 1 ? 's' : ''} vencido${r.mant_vencidos > 1 ? 's' : ''}` });
    if (r.ordenes_altas > 0) alertas.push({ r, sev: 'bad', go: 'mant', t: `${r.ordenes_altas} daño${r.ordenes_altas > 1 ? 's' : ''} de prioridad alta sin cerrar` });
    if (r.pagos_por_revisar > 0) alertas.push({ r, sev: 'warn', go: 'cartera', t: `${r.pagos_por_revisar} comprobante${r.pagos_por_revisar > 1 ? 's' : ''} de pago por revisar` });
    if (r.cargado_mes > 0 && r.recaudado_mes / r.cargado_mes < .8) alertas.push({ r, sev: 'warn', go: 'cartera', t: `Recaudo del mes en ${Math.round(r.recaudado_mes / r.cargado_mes * 100)}%` });
    if (r.chats_sin_leer > 0 && r.rol === 'admin') alertas.push({ r, sev: 'warn', go: 'chat', t: `${r.chats_sin_leer} mensaje${r.chats_sin_leer > 1 ? 's' : ''} de chat sin leer` });
    if (r.pqrs_abiertas > 0) alertas.push({ r, sev: 'info', go: 'pqrs', t: `${r.pqrs_abiertas} PQRS esperando respuesta` });
    if (r.reportes_urgentes > 0) alertas.push({ r, sev: 'bad', go: 'reportes', t: `${r.reportes_urgentes} reporte(s) urgente(s) sin resolver` });
    if (r.reportes_nuevos > 0) alertas.push({ r, sev: 'warn', go: 'reportes', t: `${r.reportes_nuevos} reporte(s) nuevos de residentes o portería` });
    if (r.vigente === false) alertas.push({ r, sev: 'bad', go: 'inicio', t: 'Suscripción vencida: el conjunto está en solo lectura' });
    if (r.activos_malos > 0) alertas.push({ r, sev: 'bad', go: 'inventario', t: `${r.activos_malos} equipo(s) en mal estado o fuera de servicio` });
    if (r.docs_por_vencer > 0) alertas.push({ r, sev: 'warn', go: 'documentos', t: `${r.docs_por_vencer} documento(s) vencidos o por vencer (pólizas, certificados)` });
    if (r.garantias_por_vencer > 0) alertas.push({ r, sev: 'info', go: 'inventario', t: `${r.garantias_por_vencer} garantía(s) de equipos vencen este mes` });
    if (Number(r.unidades) === 0) alertas.push({ r, sev: 'info', go: 'config', t: 'Falta cargar las unidades del conjunto' });
  });
  const ord = { bad: 0, warn: 1, info: 2 };
  alertas.sort((a, b) => ord[a.sev] - ord[b.sev]);
  return `<div class="stack">
  <div class="kpis">
    <div class="kpi"><div class="v">${pct}%</div><div class="l">Recaudo consolidado del mes</div><div class="bar" style="margin-top:8px"><span style="width:${Math.min(pct, 100)}%"></span></div></div>
    <div class="kpi"><div class="v">${millones(n('mora'))}</div><div class="l">Cartera pendiente (${n('unidades_mora')} unidades)</div></div>
    <div class="kpi"><div class="v">${n('ordenes_abiertas')}</div><div class="l">Órdenes de trabajo abiertas</div></div>
    <div class="kpi"><div class="v">${n('pqrs_abiertas')} · ${n('chats_sin_leer')}</div><div class="l">PQRS abiertas · chats sin leer</div></div>
  </div>
  <div class="card"><div class="row"><h2>Prioridades de hoy</h2><span class="chip ${alertas.some(a => a.sev === 'bad') ? 'bad' : 'ok'}">${alertas.length}</span></div><div class="list" style="margin-top:6px">
    ${alertas.slice(0, 8).map(a => `<button class="item chatrow" data-act="entrar" data-id="${a.r.conjunto_id}" data-rol="${a.r.rol}" data-go="${a.r.rol === 'consejo' && a.go === 'chat' ? 'inicio' : a.go}"><span class="sev ${a.sev}"></span><div class="grow"><h3>${esc(a.r.nombre)}</h3><div class="sub">${a.t}</div></div><span class="sub">›</span></button>`).join('') || '<div class="sub" style="padding-top:6px">Todo al día en tus conjuntos.</div>'}
  </div></div>
  <div class="row"><h2>Mis conjuntos</h2><button class="btn sm ghost" data-act="ir" data-v="nuevo">+ Agregar</button></div>
  ${rows.map(r => { const [sl, sc] = salud(r); const p = r.cargado_mes > 0 ? r.recaudado_mes / r.cargado_mes : 0; return `<button class="card conjcard" data-act="entrar" data-id="${r.conjunto_id}" data-rol="${r.rol}" data-go="inicio">
    <div class="row"><div class="grow"><h3>${esc(r.nombre)}</h3><div class="sub">${esc(r.ciudad || '')}${r.ciudad ? ' · ' : ''}${r.unidades} unidades${r.rol === 'consejo' ? ' · Consejo' : ''}</div></div><span class="chip ${sc}">${sl}</span></div>
    <div class="row" style="margin-top:10px"><span class="sub">Recaudo del mes</span><b class="mono">${r.cargado_mes > 0 ? Math.round(p * 100) + '%' : 'Sin liquidar'}</b></div>
    <div class="bar" style="margin-top:4px"><span style="width:${Math.min(p * 100, 100)}%;background:${p < .8 ? 'var(--bad)' : p < .9 ? 'var(--warn)' : 'var(--ok)'}"></span></div>
    <div class="mini"><span><b>${r.mant_vencidos}</b> mant. vencidos</span><span><b>${r.ordenes_abiertas}</b> órdenes</span><span><b>${r.pqrs_abiertas}</b> PQRS</span><span><b>${r.chats_sin_leer}</b> chats</span></div>
  </button>`; }).join('')}
  <div class="card"><h2>Agenda de mantenimientos · próximos 21 días</h2><div class="list" style="margin-top:6px">
    ${agenda.map(a => `<div class="item"><div class="ico datebox"><b>${pd(a.proximo).getDate()}</b><span>${pd(a.proximo).toLocaleDateString('es-CO', { month: 'short' }).replace('.', '')}</span></div><div class="grow"><h3>${esc(a.activo)}</h3><div class="sub">${esc(nom(a.conjunto_id))}${a.proveedor ? ' · ' + esc(a.proveedor) : ''}</div></div></div>`).join('') || '<div class="sub" style="padding-top:6px">No hay mantenimientos programados en las próximas tres semanas.</div>'}
  </div></div></div>`;
};

/* ---------- inicio de administración ---------- */
V.inicio = async () => {
  const [res, circ, reservas] = await Promise.all([
    q(sb.rpc('resumen_portafolio')),
    q(sb.from('circulares').select('*').eq('conjunto_id', C()).order('fijada', { ascending: false }).order('created_at', { ascending: false }).limit(3)),
    q(sb.from('reservas').select('fecha, horario, estado, zonas(nombre), unidades(codigo)').eq('conjunto_id', C()).gte('fecha', HOY()).neq('estado', 'Cancelada').order('fecha').limit(5))
  ]);
  const r = res.find(x => x.conjunto_id === C()) || {};
  const pct = r.cargado_mes > 0 ? Math.round(r.recaudado_mes / r.cargado_mes * 100) : null;
  const pasos = [
    [Number(r.unidades) > 0, 'Carga las unidades con su coeficiente y correo', 'config'],
    [Number(r.cargado_mes) > 0, 'Liquida las cuotas del mes', 'cartera'],
    [reservas.length > 0 || circ.length > 0, 'Publica una circular o crea las zonas comunes', 'info'],
  ];
  const onboarding = pasos.some(p => !p[0]) && W();
  const quick = [['cartera', 'Cartera', 'cartera'], ['mant', 'Mantenim.', 'mant'], ['reservas', 'Reservas', 'reservas'], ['chat', 'Chat', 'chat'], ['pqrs', 'PQRS', 'pqrs'], ['asamblea', 'Asamblea', 'asamblea'], ['info', 'Circulares', 'info'], ['config', 'Ajustes', 'config']]
    .filter(([k]) => W() || !['chat', 'config'].includes(k));
  return `<div class="stack">
  ${onboarding ? `<div class="card stack" style="gap:8px"><h2>Para arrancar</h2>${pasos.map(([ok, t, v]) => `<button class="item chatrow" data-act="tab" data-v="${v}"><span class="chip ${ok ? 'ok' : 'warn'}">${ok ? 'Listo' : 'Pendiente'}</span><div class="grow">${t}</div><span class="sub">›</span></button>`).join('')}</div>` : ''}
  <div class="quick">${quick.map(([k, l, v]) => `<button data-act="tab" data-v="${v}">${svg(k)}${l}${k === 'chat' && S.unread ? `<span class="nbadge" style="right:8px">${S.unread}</span>` : ''}</button>`).join('')}</div>
  <div class="kpis">
    <div class="kpi"><div class="v">${pct === null ? '—' : pct + '%'}</div><div class="l">Recaudo del mes</div><div class="bar" style="margin-top:8px"><span style="width:${Math.min(pct || 0, 100)}%"></span></div></div>
    <div class="kpi"><div class="v">${millones(r.mora)}</div><div class="l">Cartera pendiente (${r.unidades_mora || 0} unidades)</div></div>
    <div class="kpi"><div class="v">${r.ordenes_abiertas || 0}</div><div class="l">Órdenes de trabajo abiertas</div></div>
    <div class="kpi"><div class="v">${r.pqrs_abiertas || 0}</div><div class="l">PQRS sin responder</div></div>
  </div>
  ${(r.mant_vencidos > 0 || r.pagos_por_revisar > 0) ? `<div class="alert"><b>Atención:</b> ${[r.mant_vencidos > 0 ? `${r.mant_vencidos} mantenimiento(s) vencido(s)` : '', r.pagos_por_revisar > 0 ? `${r.pagos_por_revisar} comprobante(s) de pago por revisar` : ''].filter(Boolean).join(' · ')}.</div>` : ''}
  <div class="card"><div class="row"><h2>Próximas reservas</h2><button class="btn sm ghost" data-act="tab" data-v="reservas">Ver todas</button></div><div class="list" style="margin-top:6px">
    ${reservas.map(x => `<div class="item"><div class="ico">${esc((x.zonas || {}).nombre || '?')[0]}</div><div class="grow"><h3>${esc((x.zonas || {}).nombre)}</h3><div class="sub">${fecha(x.fecha)} · ${esc(x.horario)} · ${esc((x.unidades || {}).codigo)}</div></div><span class="chip ${chipEstado[x.estado]}">${x.estado}</span></div>`).join('') || '<div class="sub" style="padding-top:6px">No hay reservas próximas.</div>'}
  </div></div>
  <div class="card"><div class="row"><h2>Últimas circulares</h2><button class="btn sm ghost" data-act="tab" data-v="info">Ver todas</button></div><div class="list" style="margin-top:6px">
    ${circ.map(c => `<div class="item"><div class="grow"><h3>${c.fijada ? '📌 ' : ''}${esc(c.titulo)}</h3><div class="sub">${esc(c.categoria)} · ${fecha(c.created_at)}</div></div></div>`).join('') || '<div class="sub" style="padding-top:6px">Aún no has publicado circulares.</div>'}
  </div></div></div>`;
};

/* ---------- cartera (administración) ---------- */
V.cartera = async () => {
  const per = mesActual();
  const [cargos, aprob, pend, saldos, unidades] = await Promise.all([
    q(sb.from('cargos').select('valor').eq('conjunto_id', C()).eq('periodo', per)),
    q(sb.from('pagos').select('valor').eq('conjunto_id', C()).eq('estado', 'aprobado').gte('fecha_pago', per)),
    q(sb.from('pagos').select('*, unidades(codigo, propietario)').eq('conjunto_id', C()).eq('estado', 'pendiente').order('created_at')),
    q(sb.from('v_saldos').select('*').eq('conjunto_id', C()).gt('saldo', 0).order('saldo', { ascending: false })),
    W() ? q(sb.from('unidades').select('id, codigo').eq('conjunto_id', C()).order('codigo')) : Promise.resolve([])
  ]);
  const cargado = cargos.reduce((a, b) => a + Number(b.valor), 0), rec = aprob.reduce((a, b) => a + Number(b.valor), 0);
  const moraTot = saldos.reduce((a, b) => a + Number(b.saldo), 0);
  const mesNombre = pd(per).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
  return `<div class="stack">
  <div class="card"><div class="eyebrow">${mesNombre}</div>
    ${cargado ? `<div class="row" style="margin-top:4px"><h2>${fmt(rec)}</h2><span class="sub">de ${fmt(cargado)} liquidados</span></div>
    <div class="bar" style="margin-top:10px"><span style="width:${Math.min(rec / cargado * 100, 100)}%"></span></div>` : `<p style="margin:6px 0 0">Aún no se han liquidado las cuotas de este mes.</p>`}
    ${W() ? `<details class="mt" ${cargado ? '' : 'open'}><summary>Liquidar cuotas del mes</summary>
      <form class="form mt" data-form="generar"><div class="two"><div><label for="g-m">Mes</label><input id="g-m" name="mes" type="month" value="${HOY().slice(0, 7)}" required></div>
      <div><label for="g-v">Fecha límite de pago</label><input id="g-v" name="vence" type="date" value="${HOY().slice(0, 7)}-10" required></div></div>
      <p class="sub" style="margin:0">Se reparte el presupuesto mensual según el coeficiente de cada unidad. Si ya existe la cuota de ese mes para una unidad, no se duplica.</p>
      <button class="btn" type="submit">Liquidar</button></form></details>` : ''}
  </div>
  <div class="card"><div class="row"><h2>Comprobantes por revisar</h2><span class="chip ${pend.length ? 'warn' : 'ok'}">${pend.length}</span></div><div class="list" style="margin-top:6px">
    ${pend.map(p => `<div class="item"><div class="grow"><h3>${esc((p.unidades || {}).codigo)} · ${fmt(p.valor)}</h3><div class="sub">${esc(p.medio || 'Sin medio')} · pagado el ${fecha(p.fecha_pago)}${p.nota ? ' · ' + esc(p.nota) : ''}</div>
      <div class="row" style="justify-content:flex-start;gap:6px;margin-top:6px;flex-wrap:wrap">${p.comprobante ? `<button class="btn sm ghost" data-act="archivo" data-path="${esc(p.comprobante)}">Ver soporte</button>` : '<span class="sub">Sin soporte adjunto</span>'}
      ${W() ? `<button class="btn sm" data-act="pagoEstado" data-id="${p.id}" data-v="aprobado">Aprobar</button><button class="btn sm danger" data-act="pagoEstado" data-id="${p.id}" data-v="rechazado" data-confirm="¿Rechazar?">Rechazar</button>` : ''}</div></div></div>`).join('') || '<div class="sub" style="padding-top:6px">No hay comprobantes pendientes.</div>'}
  </div></div>
  ${W() ? `<details class="card"><summary><b>Registrar un pago recibido</b> <span class="sub">(consignación, efectivo)</span></summary>
    <form class="form mt" data-form="pagoManual"><div class="two"><div><label for="pm-u">Unidad</label><select id="pm-u" name="unidad" required>${unidades.map(u => `<option value="${u.id}">${esc(u.codigo)}</option>`).join('')}</select></div>
    <div><label for="pm-v">Valor</label><input id="pm-v" name="valor" type="number" min="1" step="1" required></div></div>
    <div class="two"><div><label for="pm-f">Fecha</label><input id="pm-f" name="fecha" type="date" value="${HOY()}" required></div><div><label for="pm-m">Medio</label><select id="pm-m" name="medio"><option>Consignación</option><option>Transferencia</option><option>Efectivo</option><option>PSE</option><option>Nequi</option></select></div></div>
    <button class="btn" type="submit">Registrar pago</button></form></details>` : ''}
  <div class="card"><div class="row"><h2>Unidades con saldo pendiente</h2><span class="sub">${fmt(moraTot)}</span></div><div class="list" style="margin-top:6px">
    ${saldos.map(s => { const m = s.cuota > 0 ? Math.round(s.saldo / s.cuota) : 0; return `<div class="item"><div class="ico">${m || '·'}</div><div class="grow"><h3>${esc(s.codigo)}</h3><div class="sub">${esc(s.propietario || '')}${s.propietario ? ' · ' : ''}${m ? `≈ ${m} cuota${m > 1 ? 's' : ''}` : 'saldo parcial'}${m >= 3 ? ' · revisar cobro prejurídico' : ''}</div></div>
      <div style="text-align:right"><div class="mono">${fmt(s.saldo)}</div>${W() ? `<button class="btn sm ghost" data-act="chatUnidad" data-id="${s.unidad_id}" style="margin-top:4px">Escribir</button>` : ''}</div></div>`; }).join('') || '<div class="sub" style="padding-top:6px">Todas las unidades están al día.</div>'}
  </div></div></div>`;
};

/* ---------- pagos (residente) ---------- */
V.pagos = async () => {
  const [saldoRow, cargos, pagos] = await Promise.all([
    q(sb.from('v_saldos').select('*').eq('unidad_id', U()).maybeSingle()),
    q(sb.from('cargos').select('*').eq('unidad_id', U()).order('periodo', { ascending: false }).limit(12)),
    q(sb.from('pagos').select('*').eq('unidad_id', U()).order('created_at', { ascending: false }).limit(20))
  ]);
  const saldo = Number((saldoRow || {}).saldo || 0);
  const enRevision = pagos.filter(p => p.estado === 'pendiente').reduce((a, b) => a + Number(b.valor), 0);
  const ultimo = cargos[0];
  return `<div class="stack">
  <div class="card hero-res"><div style="font-size:12.5px;opacity:.85">Saldo de tu unidad ${esc(S.ctx.unidad_codigo)}</div>
    <div class="bigv">${saldo > 0 ? fmt(saldo) : 'Estás al día ✓'}</div>
    ${saldo > 0 && ultimo ? `<div style="font-size:12.5px;opacity:.85">Cuota de ${pd(ultimo.periodo).toLocaleDateString('es-CO', { month: 'long' })}: ${fmt(ultimo.valor)} · fecha límite ${fecha(ultimo.vence)}</div>` : ''}
    ${enRevision ? `<div style="font-size:12.5px;margin-top:6px">Tienes ${fmt(enRevision)} en revisión por la administración.</div>` : ''}
  </div>
  <form class="card form" data-form="reportarPago"><h2>Reportar un pago</h2>
    <p class="sub" style="margin:0">Paga por tu banco, Nequi o en la cuenta del conjunto, y sube aquí el comprobante. La administración lo revisa y lo aplica a tu saldo.</p>
    <div class="two"><div><label for="rp-v">Valor pagado</label><input id="rp-v" name="valor" type="number" min="1" step="1" value="${saldo > 0 ? saldo : ''}" required></div>
    <div><label for="rp-f">Fecha del pago</label><input id="rp-f" name="fecha" type="date" value="${HOY()}" max="${HOY()}" required></div></div>
    <div><label for="rp-m">Medio</label><select id="rp-m" name="medio"><option>Transferencia</option><option>PSE</option><option>Nequi</option><option>Daviplata</option><option>Consignación</option></select></div>
    <div><label for="rp-c">Comprobante (foto o PDF)</label><input id="rp-c" name="archivo" type="file" accept="image/*,application/pdf" required></div>
    <button class="btn" type="submit">Enviar comprobante</button></form>
  <div class="card"><h2>Mis pagos</h2><div class="list" style="margin-top:6px">
    ${pagos.map(p => `<div class="item"><div class="grow"><h3>${fmt(p.valor)}</h3><div class="sub">${fecha(p.fecha_pago)} · ${esc(p.medio || '')}${p.nota ? ' · ' + esc(p.nota) : ''}</div></div><span class="chip ${chipEstado[p.estado]}">${etiquetaPago[p.estado]}</span></div>`).join('') || '<div class="sub" style="padding-top:6px">Aún no has reportado pagos.</div>'}
  </div></div>
  <div class="card"><h2>Cuotas liquidadas</h2><div class="list" style="margin-top:6px">
    ${cargos.map(c => `<div class="item"><div class="grow"><h3>${esc(c.concepto)} · ${pd(c.periodo).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })}</h3><div class="sub">Fecha límite ${fecha(c.vence)}</div></div><span class="mono">${fmt(c.valor)}</span></div>`).join('') || '<div class="sub" style="padding-top:6px">Aún no hay cuotas liquidadas.</div>'}
  </div></div></div>`;
};

/* ---------- mantenimiento ---------- */
const FREQ = { 1: 'Mensual', 2: 'Bimestral', 3: 'Trimestral', 4: 'Cuatrimestral', 6: 'Semestral', 12: 'Anual', 24: 'Cada 2 años' };
const estadoPrev = p => { const n = dias(p.proximo); return n < 0 ? ['Vencido', 'bad', `Venció hace ${-n} día${-n !== 1 ? 's' : ''}`] : n <= 10 ? ['Próximo', 'warn', n === 0 ? 'Hoy' : `En ${n} día${n !== 1 ? 's' : ''}`] : ['Al día', 'ok', `En ${n} días`]; };

V.mant = async () => {
  const t = S.sub.t || 'preventivo';
  const seg = `<div class="seg" role="group" aria-label="Tipo de mantenimiento">${[['preventivo', 'Preventivo'], ['correctivo', 'Daños y órdenes'], ['costos', 'Costos']].map(([k, l]) => `<button data-act="sub" data-k="t" data-v="${k}" aria-pressed="${t === k}">${l}</button>`).join('')}</div>`;
  let body = '';
  if (t === 'preventivo') {
    const [plan, acts] = await Promise.all([q(sb.from('mant_plan').select('*').eq('conjunto_id', C()).order('proximo')), q(sb.from('activos').select('id, codigo, nombre').eq('conjunto_id', C()).order('codigo'))]);
    body = `${W() ? `<details class="card" ${plan.length ? '' : 'open'}><summary><b>+ Agregar al plan</b></summary><form class="form mt" data-form="plan">
      <div><label for="pl-a">Equipo o actividad</label><input id="pl-a" name="activo" required placeholder="Ej. Ascensores, lavado de tanques, extintores"></div>
      <div class="two"><div><label for="pl-f">Frecuencia</label><select id="pl-f" name="freq">${Object.entries(FREQ).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
      <div><label for="pl-p">Próxima fecha</label><input id="pl-p" name="proximo" type="date" value="${HOY()}" required></div></div>
      <div class="two"><div><label for="pl-pr">Proveedor</label><input id="pl-pr" name="proveedor"></div><div><label for="pl-c">Costo por visita</label><input id="pl-c" name="costo" type="number" min="0" step="1000"></div></div>
      <div><label for="pl-ac">Equipo del inventario (opcional)</label><select id="pl-ac" name="activo"><option value="">Ninguno</option>${acts.map(x => `<option value="${x.id}">${esc(x.codigo)} · ${esc(x.nombre)}</option>`).join('')}</select></div>
      <div><label for="pl-n">Nota (certificados, requisitos)</label><input id="pl-n" name="nota"></div>
      <button class="btn" type="submit">Guardar</button></form></details>` : ''}
      ${plan.map(p => { const [e, cl, tx] = estadoPrev(p); return `<div class="card">
        <div class="row"><div class="grow"><h3>${esc(p.activo)}</h3><div class="sub">${FREQ[p.frecuencia_meses] || 'Cada ' + p.frecuencia_meses + ' meses'}${p.proveedor ? ' · ' + esc(p.proveedor) : ''}</div></div><span class="chip ${cl}">${e}</span></div>
        <div class="row" style="margin-top:8px"><span class="sub">Próximo: <b style="color:var(--ink)">${fecha(p.proximo)}</b> · ${tx}</span><span class="mono">${fmt(p.costo)}</span></div>
        ${p.ultimo ? `<div class="sub">Última ejecución: ${fecha(p.ultimo)}</div>` : ''}
        ${p.nota ? `<div class="sub" style="margin-top:6px">${esc(p.nota)}</div>` : ''}
        ${W() ? `<div class="row" style="margin-top:10px;justify-content:flex-end;gap:8px;flex-wrap:wrap"><button class="btn sm ghost danger-t" data-act="borrar" data-tabla="mant_plan" data-id="${p.id}" data-confirm="¿Borrar del plan?">Borrar</button><button class="btn sm ghost" data-act="planOT" data-id="${p.id}">Crear orden</button><button class="btn sm" data-act="ejecutar" data-id="${p.id}" data-f="${p.frecuencia_meses}">Registrar ejecución</button></div>` : ''}
      </div>`; }).join('') || '<div class="card sub">Aún no hay equipos en el plan de mantenimiento preventivo.</div>'}`;
  } else if (t === 'correctivo') {
    const [ords, acts] = await Promise.all([q(sb.from('ordenes').select('*').eq('conjunto_id', C()).order('created_at', { ascending: false }).limit(150)), q(sb.from('activos').select('id, codigo, nombre').eq('conjunto_id', C()).order('codigo'))]);
    const orden = { 'Reportada': 0, 'En curso': 1, 'Cerrada': 2 };
    ords.sort((a, b) => orden[a.estado] - orden[b.estado]);
    body = `${W() ? `<details class="card"><summary><b>+ Reportar daño</b></summary><form class="form mt" data-form="orden">
      <div><label for="ot-t">Qué pasó</label><input id="ot-t" name="titulo" required placeholder="Ej. bombillo fundido en escalera T4"></div>
      <div class="two"><div><label for="ot-u">Ubicación</label><input id="ot-u" name="ubicacion" required></div><div><label for="ot-p">Prioridad</label><select id="ot-p" name="prioridad"><option>Alta</option><option selected>Media</option><option>Baja</option></select></div></div>
      <div><label for="ot-r">Responsable</label><input id="ot-r" name="responsable" placeholder="Todero, proveedor…"></div>
      <div><label for="ot-ac">Equipo del inventario (opcional)</label><select id="ot-ac" name="activo"><option value="">Ninguno</option>${acts.map(x => `<option value="${x.id}">${esc(x.codigo)} · ${esc(x.nombre)}</option>`).join('')}</select></div>
      <div><label for="ot-f">Foto del daño</label><input id="ot-f" name="foto" type="file" accept="image/*"></div>
      <button class="btn" type="submit">Crear orden de trabajo</button></form></details>` : ''}
      ${ords.map(o => `<div class="card"><div class="row"><span class="mono" style="color:var(--muted)">OT-${String(o.numero).padStart(4, '0')}</span><span class="chip ${chipEstado[o.estado]}">${o.estado}</span></div>
        <h3 style="margin-top:6px">${esc(o.titulo)}</h3><div class="sub">${esc(o.ubicacion || '')} · ${fecha(o.created_at)}${o.origen ? ' · Origen: ' + esc(o.origen) : ''}</div>
        <div class="row" style="margin-top:10px;flex-wrap:wrap"><span class="sub"><span class="chip ${chipPrio[o.prioridad]}">${o.prioridad}</span> &nbsp;${esc(o.responsable || 'Sin asignar')}</span>
        <span class="row" style="gap:6px">${o.foto ? `<button class="btn sm ghost" data-act="archivo" data-path="${esc(o.foto)}">Ver foto</button>` : ''}${W() && o.estado !== 'Cerrada' ? `<button class="btn sm" data-act="avanzarOT" data-id="${o.id}" data-v="${o.estado === 'Reportada' ? 'En curso' : 'Cerrada'}">${o.estado === 'Reportada' ? 'Iniciar' : 'Cerrar'}</button>` : ''}</span></div></div>`).join('') || '<div class="card sub">No hay órdenes de trabajo.</div>'}`;
  } else {
    const plan = await q(sb.from('mant_plan').select('activo, costo, frecuencia_meses').eq('conjunto_id', C()));
    const rubros = plan.map(p => ({ n: p.activo, v: Number(p.costo) * Math.max(1, Math.round(12 / p.frecuencia_meses)) })).sort((a, b) => b.v - a.v);
    const tot = rubros.reduce((a, b) => a + b.v, 0), max = rubros[0] ? rubros[0].v : 1;
    body = `<div class="card"><div class="eyebrow">Costo anual estimado del plan preventivo</div><h2 style="margin-top:4px">${fmt(tot)}</h2>
      <div class="sub" style="margin-top:4px">Calculado con el costo por visita y la frecuencia de cada equipo. Sirve de base para el presupuesto que aprueba la asamblea.</div></div>
      <div class="card"><h2>Por rubro</h2><div class="stack" style="margin-top:10px;gap:10px">
      ${rubros.map(r => `<div><div class="row"><span class="sub" style="color:var(--ink)">${esc(r.n)}</span><span class="mono">${fmt(r.v)}</span></div><div class="bar" style="margin-top:4px;height:6px"><span style="width:${r.v / max * 100}%;background:var(--accent)"></span></div></div>`).join('') || '<div class="sub">Agrega equipos al plan para ver los costos.</div>'}
      </div></div>`;
  }
  return `<div class="stack"><h2>Mantenimientos</h2>${seg}${body}</div>`;
};

/* ---------- reservas ---------- */
V.reservas = async () => {
  const zonas = await q(sb.from('zonas').select('*').eq('conjunto_id', C()).order('nombre'));
  if (!zonas.length) return `<div class="stack"><h2>Reservas</h2><div class="card">${W() ? 'Primero crea las zonas comunes (salón social, BBQ, piscina…) en Ajustes.<div class="mt"><button class="btn sm" data-act="tab" data-v="config">Ir a Ajustes</button></div>' : 'La administración aún no ha habilitado zonas para reservar.'}</div></div>`;
  const z = zonas.find(x => x.id === S.sub.zona) || zonas[0];
  const fechaSel = S.sub.fecha || HOY();
  let lista = sb.from('reservas').select('*, zonas(nombre, costo, deposito), unidades(codigo)').eq('conjunto_id', C()).gte('fecha', HOY()).neq('estado', 'Cancelada').order('fecha').limit(60);
  if (R()) lista = lista.eq('unidad_id', U());
  const [ocup, prox, unidades] = await Promise.all([
    q(sb.from('reservas').select('horario').eq('zona_id', z.id).eq('fecha', fechaSel).neq('estado', 'Cancelada')),
    q(lista),
    W() ? q(sb.from('unidades').select('id, codigo').eq('conjunto_id', C()).order('codigo')) : Promise.resolve([])
  ]);
  const tomados = ocup.map(o => o.horario);
  const dias7 = [...Array(7)].map((_, i) => addDays(HOY(), i));
  const puedeReservar = W() || R();
  return `<div class="stack"><div class="row"><h2>Reservas</h2><span class="sub">${prox.length} próximas</span></div>
  ${puedeReservar ? `<div class="card stack" style="gap:12px">
    <div><label for="rz">Zona común</label><select id="rz" data-chg="zona">${zonas.map(x => `<option value="${x.id}" ${x.id === z.id ? 'selected' : ''}>${esc(x.nombre)}</option>`).join('')}</select></div>
    <div class="sub">${z.reglas ? esc(z.reglas) + ' · ' : ''}${z.aforo ? 'Aforo ' + z.aforo + ' personas · ' : ''}${Number(z.costo) + Number(z.deposito) > 0 ? `Alquiler ${fmt(z.costo)}${Number(z.deposito) ? ' + depósito ' + fmt(z.deposito) : ''}` : 'Sin costo'}</div>
    <div><label>Día</label><div class="days">${dias7.map(d => `<button data-act="sub" data-k="fecha" data-v="${d}" data-keep="1" aria-pressed="${fechaSel === d}"><span>${pd(d).toLocaleDateString('es-CO', { weekday: 'short' }).replace('.', '')}</span><b>${pd(d).getDate()}</b></button>`).join('')}</div>
      <div class="row mt"><span class="sub">Otra fecha</span><input type="date" id="rf" data-chg="fecha" min="${HOY()}" value="${fechaSel}" style="max-width:180px"></div></div>
    <div><label>Horario · ${fecha(fechaSel)}</label><div class="slots">${(z.horarios || []).map(h => { const oc = tomados.includes(h); return `<button data-act="sub" data-k="slot" data-v="${esc(h)}" data-keep="1" ${oc ? 'disabled' : ''} aria-pressed="${S.sub.slot === h}">${esc(h)}<small>${oc ? 'Ocupado' : 'Disponible'}</small></button>`; }).join('') || '<span class="sub">Esta zona no tiene horarios configurados.</span>'}</div></div>
    ${W() ? `<div class="two"><div><label for="ru">Unidad</label><select id="ru">${unidades.map(u => `<option value="${u.id}">${esc(u.codigo)}</option>`).join('')}</select></div><div style="display:flex;align-items:flex-end"><button class="btn" style="width:100%" data-act="reservar" data-z="${z.id}" ${S.sub.slot ? '' : 'disabled'}>Reservar</button></div></div>`
    : `<button class="btn" data-act="reservar" data-z="${z.id}" ${S.sub.slot ? '' : 'disabled'}>Reservar para ${esc(S.ctx.unidad_codigo)}</button>`}
  </div>` : ''}
  <h3>${R() ? 'Mis reservas' : 'Próximas reservas'}</h3>
  ${prox.map(r => `<div class="card"><div class="row"><div class="grow"><h3>${esc((r.zonas || {}).nombre)}</h3><div class="sub">${fecha(r.fecha)} · ${esc(r.horario)} · ${esc((r.unidades || {}).codigo)}</div></div><span class="chip ${chipEstado[r.estado]}">${r.estado}</span></div>
    ${r.estado === 'Pendiente depósito' && R() ? `<div class="sub" style="margin-top:6px">Entrega o consigna ${fmt(Number((r.zonas || {}).costo) + Number((r.zonas || {}).deposito))} en la administración para confirmar.</div>` : ''}
    ${puedeReservar ? `<div class="row" style="margin-top:10px;justify-content:flex-end;gap:8px"><button class="btn sm ghost" data-act="reservaEstado" data-id="${r.id}" data-v="Cancelada" data-confirm="¿Cancelar la reserva?">Cancelar</button>${W() && r.estado !== 'Confirmada' ? `<button class="btn sm" data-act="reservaEstado" data-id="${r.id}" data-v="Confirmada">Confirmar depósito</button>` : ''}</div>` : ''}</div>`).join('') || `<div class="card sub">${R() ? 'No tienes reservas próximas.' : 'No hay reservas próximas.'}</div>`}
  </div>`;
};

/* ---------- chat ---------- */
V.chat = async () => {
  if (ROL() === 'consejo') return '<div class="card">El chat es entre la administración y cada unidad.</div>';
  const unidad = R() ? U() : S.sub.unidad;
  if (unidad) {
    const [msgs, uni] = await Promise.all([
      q(sb.from('mensajes').select('*').eq('conjunto_id', C()).eq('unidad_id', unidad).order('created_at', { ascending: false }).limit(200)),
      R() ? Promise.resolve(null) : q(sb.from('unidades').select('codigo, propietario').eq('id', unidad).maybeSingle())
    ]);
    msgs.reverse();
    const mio = m => R() ? !m.de_admin : m.de_admin;
    const qr = ['Ya quedó registrado, le confirmo pronto.', 'Con gusto. ¿Me envía una foto?', 'Puede pasar por la administración en horario de oficina.'];
    return `<div class="stack">
      ${R() ? `<div><h2>Chat con la administración</h2><div class="sub">Para emergencias llama directamente a portería.</div></div>`
        : `<div class="row"><button class="btn sm ghost" data-act="sub" data-k="unidad" data-v="">‹ Volver</button><div class="grow" style="text-align:right"><h3>${esc((uni || {}).codigo)}</h3><div class="sub">${esc((uni || {}).propietario || '')}</div></div></div>`}
      <div class="card thread" id="thread">${msgs.map(m => `<div class="bub ${mio(m) ? 'me' : ''}">${m.foto ? `<img data-foto="${esc(m.foto)}" class="chatimg" alt="Foto">` : ''}${m.foto && m.texto === 'Foto' ? '' : `<div>${nl(m.texto)}</div>`}<small>${m.de_admin && R() ? 'Administración · ' : ''}${fechaHora(m.created_at)}</small></div>`).join('') || '<div class="sub" style="text-align:center">Escribe el primer mensaje.</div>'}</div>
      ${W() ? `<div class="qr">${qr.map(t => `<button class="btn sm ghost" data-act="rapida" data-t="${esc(t)}">${esc(t)}</button>`).join('')}</div>` : ''}
      <form class="chatform" data-form="mensaje" data-u="${unidad}"><label class="btn ghost camb" for="ch-foto" title="Adjuntar foto" aria-label="Adjuntar foto">${svg('reportes')}</label><input id="ch-foto" name="foto" type="file" accept="image/*" hidden data-chg="fotoChat"><input name="texto" placeholder="Escribe un mensaje" autocomplete="off" aria-label="Mensaje" maxlength="2000"><button class="btn" type="submit">Enviar</button></form>
      ${W() && msgs.some(m => !m.de_admin) ? `<button class="btn sm ghost" data-act="chatPqrs" data-u="${unidad}" style="align-self:flex-start">Convertir en PQRS formal</button>` : ''}</div>`;
  }
  const [msgs, unidades] = await Promise.all([
    q(sb.from('mensajes').select('unidad_id, texto, de_admin, leido, created_at, unidades(codigo, propietario)').eq('conjunto_id', C()).order('created_at', { ascending: false }).limit(500)),
    q(sb.from('unidades').select('id, codigo').eq('conjunto_id', C()).order('codigo'))
  ]);
  if (!unidades.length) return `<div class="stack"><h2>Atención por chat</h2><div class="card stack" style="gap:8px"><h3>Primero carga las unidades</h3>
    <p style="margin:0">El chat funciona por apartamento: cada unidad tiene su conversación con la administración. Carga las unidades con el correo de cada residente y, cuando ellos creen su cuenta, podrán escribirte aquí.</p>
    <button class="btn" data-act="tab" data-v="config" style="align-self:flex-start">Ir a cargar unidades</button></div></div>`;
  const hilos = [];
  msgs.forEach(m => {
    let h = hilos.find(x => x.id === m.unidad_id);
    if (!h) { h = { id: m.unidad_id, u: m.unidades || {}, last: m, unread: 0 }; hilos.push(h); }
    if (!m.de_admin && !m.leido) h.unread++;
  });
  return `<div class="stack"><div class="row"><h2>Atención por chat</h2><span class="sub">${hilos.reduce((a, h) => a + h.unread, 0)} sin leer</span></div>
    <div class="row"><select id="nuevoChat" aria-label="Escribir a una unidad"><option value="">Escribir a una unidad…</option>${unidades.map(u => `<option value="${u.id}">${esc(u.codigo)}</option>`).join('')}</select><button class="btn sm" data-act="abrirChat">Abrir</button></div>
    <div class="card list" style="padding-block:4px">${hilos.map(h => `<button class="item chatrow" data-act="sub" data-k="unidad" data-v="${h.id}"><div class="ico">${esc(iniciales(h.u.codigo))}</div><div class="grow"><div class="row"><h3>${esc(h.u.codigo)}${h.u.propietario ? ' · ' + esc(h.u.propietario) : ''}</h3><span class="sub">${fechaHora(h.last.created_at)}</span></div><div class="row"><div class="sub ell">${h.last.de_admin ? 'Tú: ' : ''}${esc(h.last.texto)}</div>${h.unread ? `<span class="nbadge static">${h.unread}</span>` : ''}</div></div></button>`).join('') || '<div class="sub" style="padding:10px 0">Aún no hay conversaciones. Cuando un residente escriba, aparecerá aquí.</div>'}</div></div>`;
};
AFTER.chat = () => {
  const t = $('thread'); if (t) t.scrollTop = t.scrollHeight;
  const unidad = R() ? U() : S.sub.unidad;
  if (unidad && ROL() !== 'consejo') sb.rpc('marcar_leidos', { p_conjunto: C(), p_unidad: unidad }).then(refrescarNoLeidos);
};

/* ---------- menús "Más" ---------- */
V.mas = async () => {
  const items = [['reservas', 'Reservas', 'Zonas comunes y depósitos'], ['inventario', 'Inventario y equipos', 'Hoja de vida, estado, garantías y códigos QR'], ['documentos', 'Documentos', 'Reglamento, actas, pólizas y certificados con vencimientos'], ['pqrs', 'PQRS', 'Peticiones, quejas, reclamos y sugerencias'], ['asamblea', 'Asamblea y votaciones', 'Votación ponderada por coeficiente'], ['info', 'Circulares e información', 'Avisos, horarios y teléfonos'], ['config', 'Ajustes del conjunto', 'Unidades, zonas, equipo y datos generales']]
    .filter(([k]) => W() || !['config'].includes(k));
  return `<div class="stack"><h2>Más</h2>${items.map(([k, t, s]) => `<button class="card navcard" data-act="tab" data-v="${k}"><div class="ico">${svg(k)}</div><div class="grow"><h3>${t}</h3><div class="sub">${s}</div></div><span class="sub">›</span></button>`).join('')}</div>`;
};
V.rmas = async () => {
  const items = [['rpqrs', 'PQRS', 'Radica una petición, queja, reclamo o sugerencia', 'pqrs'], ['rdano', 'Reportar un daño', 'Algo dañado en zonas comunes', 'dano'], ['asamblea', 'Asamblea', 'Votaciones y documentos', 'asamblea'], ['documentos', 'Documentos del conjunto', 'Reglamento, actas y manual de convivencia', 'documentos'], ['info', 'Circulares e información', 'Avisos, horarios y teléfonos', 'info']];
  return `<div class="stack"><h2>Más</h2>${items.map(([k, t, s, i]) => `<button class="card navcard" data-act="tab" data-v="${k}"><div class="ico">${svg(i)}</div><div class="grow"><h3>${t}</h3><div class="sub">${s}</div></div><span class="sub">›</span></button>`).join('')}
  <button class="linkbtn" data-act="ir" data-v="contextos">Cambiar de conjunto o cerrar sesión</button></div>`;
};

/* ---------- PQRS ---------- */
const radicado = n => 'PQRS-' + String(n).padStart(4, '0');
V.pqrs = async () => {
  const f = S.sub.f || 'Abierta';
  let p = sb.from('pqrs').select('*, unidades(codigo)').eq('conjunto_id', C()).order('created_at', { ascending: false }).limit(150);
  if (f !== 'todas') p = p.eq('estado', f);
  const list = await q(p);
  return `<div class="stack"><div class="row"><h2>PQRS</h2><span class="sub">Respuesta en máximo 15 días hábiles</span></div>
  <div class="seg" role="group" aria-label="Filtro">${[['Abierta', 'Abiertas'], ['Respondida', 'Respondidas'], ['todas', 'Todas']].map(([k, l]) => `<button data-act="sub" data-k="f" data-v="${k}" aria-pressed="${f === k}">${l}</button>`).join('')}</div>
  ${list.map(x => { const d = Math.max(0, -dias(x.created_at)); return `<div class="card"><div class="row"><span class="mono" style="color:var(--muted)">${radicado(x.radicado)}</span><span class="chip ${x.estado === 'Abierta' && d > 10 ? 'bad' : chipEstado[x.estado]}">${x.estado}${x.estado === 'Abierta' ? ` · ${d} día${d !== 1 ? 's' : ''}` : ''}</span></div>
    <h3 style="margin-top:6px">${esc(x.asunto)}</h3><div class="sub">${esc(x.tipo)} · ${esc((x.unidades || {}).codigo || 'Sin unidad')} · ${fecha(x.created_at)}</div>
    ${x.detalle ? `<p style="margin:6px 0 0">${nl(x.detalle)}</p>` : ''}
    ${x.respuesta ? `<div class="resp">Respuesta: ${nl(x.respuesta)}</div>` : ''}
    ${W() && x.estado === 'Abierta' ? (S.sub.resp === x.id ? `<form class="form mt" data-form="responder" data-id="${x.id}"><textarea name="respuesta" rows="3" required aria-label="Respuesta"></textarea><div class="row" style="justify-content:flex-end;gap:8px"><button type="button" class="btn sm ghost" data-act="sub" data-k="resp" data-v="" data-keep="1">Cancelar</button><button class="btn sm" type="submit">Enviar respuesta</button></div></form>`
      : `<div class="row" style="margin-top:10px;justify-content:flex-end;gap:8px">${['Queja', 'Reclamo'].includes(x.tipo) ? `<button class="btn sm ghost" data-act="pqrsOT" data-id="${x.id}">Pasar a mantenimiento</button>` : ''}<button class="btn sm" data-act="sub" data-k="resp" data-v="${x.id}" data-keep="1">Responder</button></div>`) : ''}
  </div>`; }).join('') || '<div class="card sub">No hay solicitudes en este filtro.</div>'}</div>`;
};
V.rpqrs = async () => {
  const list = await q(sb.from('pqrs').select('*').eq('unidad_id', U()).order('created_at', { ascending: false }));
  return `<div class="stack"><h2>Mis PQRS</h2>
  <details class="card" ${list.length ? '' : 'open'}><summary><b>+ Radicar una solicitud</b></summary><form class="form mt" data-form="radicar">
    <div><label for="pq-t">Tipo</label><select id="pq-t" name="tipo"><option>Petición</option><option>Queja</option><option>Reclamo</option><option>Sugerencia</option></select></div>
    <div><label for="pq-a">Asunto</label><input id="pq-a" name="asunto" required maxlength="140"></div>
    <div><label for="pq-d">Detalle</label><textarea id="pq-d" name="detalle" rows="4"></textarea></div>
    <p class="sub" style="margin:0">Recibirás un número de radicado. La administración responde en máximo 15 días hábiles.</p>
    <button class="btn" type="submit">Radicar</button></form></details>
  ${list.map(x => `<div class="card"><div class="row"><span class="mono" style="color:var(--muted)">${radicado(x.radicado)}</span><span class="chip ${chipEstado[x.estado]}">${x.estado === 'Abierta' ? 'En trámite' : 'Respondida'}</span></div><h3 style="margin-top:6px">${esc(x.asunto)}</h3><div class="sub">${esc(x.tipo)} · ${fecha(x.created_at)}</div>
    ${x.respuesta ? `<div class="resp">Administración: ${nl(x.respuesta)}</div>` : ''}</div>`).join('')}</div>`;
};

/* ---------- reportar daño (residente) ---------- */
V.rdano = async () => {
  const mias = await q(sb.from('ordenes').select('*').eq('conjunto_id', C()).eq('creado_por', S.user.id).order('created_at', { ascending: false }).limit(30));
  return `<div class="stack"><h2>Reportar un daño</h2>
  <form class="card form" data-form="dano"><div><label for="dn-t">Qué está dañado</label><input id="dn-t" name="titulo" required placeholder="Ej. la luz del ascensor B no prende"></div>
  <div><label for="dn-u">Dónde</label><input id="dn-u" name="ubicacion" required placeholder="Torre, piso o zona"></div>
  <div><label for="dn-f">Foto (opcional)</label><input id="dn-f" name="foto" type="file" accept="image/*"></div>
  <button class="btn" type="submit">Enviar reporte</button></form>
  ${mias.map(o => `<div class="card"><div class="row"><span class="mono" style="color:var(--muted)">OT-${String(o.numero).padStart(4, '0')}</span><span class="chip ${chipEstado[o.estado]}">${o.estado}</span></div><h3 style="margin-top:6px">${esc(o.titulo)}</h3><div class="sub">${esc(o.ubicacion || '')} · ${fecha(o.created_at)}</div></div>`).join('')}</div>`;
};

/* ---------- asamblea y votaciones ---------- */
V.asamblea = async () => {
  const asams = await q(sb.from('asambleas').select('*, votaciones(*)').eq('conjunto_id', C()).order('fecha', { ascending: false }).limit(10));
  const votIds = asams.flatMap(a => (a.votaciones || []).map(v => v.id));
  const [misVotos, resultados] = await Promise.all([
    R() && votIds.length ? q(sb.from('votos').select('votacion_id, opcion').eq('unidad_id', U()).in('votacion_id', votIds)) : Promise.resolve([]),
    Promise.all(asams.flatMap(a => (a.votaciones || []).filter(v => !R() || !v.abierta).map(v => sb.rpc('resultados', { p_votacion: v.id }).then(r => [v.id, r.data || []]))))
  ]);
  const res = Object.fromEntries(resultados);
  const voto = id => (misVotos.find(m => m.votacion_id === id) || {}).opcion;
  const verRes = (v) => { const rs = res[v.id] || []; const part = rs.reduce((a, b) => a + Number(b.coeficiente), 0);
    return `<div class="stack" style="gap:6px;margin-top:8px">${v.opciones.map(o => { const r = rs.find(x => x.opcion === o) || { votos: 0, coeficiente: 0 }; const pc = part ? r.coeficiente / part * 100 : 0;
      return `<div><div class="row"><span class="sub" style="color:var(--ink)">${esc(o)}</span><span class="mono">${r.votos} voto${r.votos != 1 ? 's' : ''} · ${pc.toFixed(1)}%</span></div><div class="bar" style="height:6px;margin-top:3px"><span style="width:${pc}%;background:var(--accent)"></span></div></div>`; }).join('')}
      <div class="sub">Participación: ${part.toLocaleString('es-CO', { maximumFractionDigits: 2 })}% de los coeficientes</div></div>`; };
  return `<div class="stack"><h2>Asambleas</h2>
  ${W() ? `<details class="card" ${asams.length ? '' : 'open'}><summary><b>+ Nueva asamblea</b></summary><form class="form mt" data-form="asamblea">
    <div><label for="as-t">Nombre</label><input id="as-t" name="titulo" required placeholder="Ej. Asamblea ordinaria 2027"></div>
    <div><label for="as-f">Fecha y hora</label><input id="as-f" name="fecha" type="datetime-local" required></div>
    <div><label for="as-d">Orden del día y notas</label><textarea id="as-d" name="descripcion" rows="4"></textarea></div>
    <button class="btn" type="submit">Crear</button></form></details>` : ''}
  ${asams.map(a => `<div class="card stack" style="gap:10px"><div><div class="eyebrow">${fechaHora(a.fecha)}</div><h2 style="margin-top:2px">${esc(a.titulo)}</h2>${a.descripcion ? `<p style="margin:6px 0 0">${nl(a.descripcion)}</p>` : ''}</div>
    ${(a.votaciones || []).sort((x, y) => x.created_at.localeCompare(y.created_at)).map(v => `<div class="votbox"><div class="row"><h3>${esc(v.pregunta)}</h3><span class="chip ${v.abierta ? 'warn' : 'ok'}">${v.abierta ? 'Abierta' : 'Cerrada'}</span></div>
      ${R() && v.abierta ? `<div class="stack" style="gap:6px;margin-top:8px">${v.opciones.map(o => `<button class="btn ${voto(v.id) === o ? '' : 'ghost'}" data-act="votar" data-id="${v.id}" data-v="${esc(o)}">${esc(o)}${voto(v.id) === o ? ' ✓' : ''}</button>`).join('')}<div class="sub">${voto(v.id) ? 'Tu voto quedó registrado. Puedes cambiarlo mientras la votación siga abierta.' : 'Vota en nombre de tu unidad. Tu voto pesa según tu coeficiente.'}</div></div>` : ''}
      ${!R() || !v.abierta ? verRes(v) : ''}
      ${W() ? `<div class="row" style="justify-content:flex-end;margin-top:8px"><button class="btn sm ${v.abierta ? 'ghost' : ''}" data-act="toggleVot" data-id="${v.id}" data-v="${!v.abierta}">${v.abierta ? 'Cerrar votación' : 'Reabrir'}</button></div>` : ''}</div>`).join('')}
    ${W() ? (S.sub.addv === a.id ? `<form class="form" data-form="votacion" data-id="${a.id}"><div><label for="vt-p">Pregunta</label><input id="vt-p" name="pregunta" required></div>
      <div><label for="vt-o">Opciones (una por línea)</label><textarea id="vt-o" name="opciones" rows="3">Sí, apruebo\nNo apruebo\nMe abstengo</textarea></div>
      <div class="row" style="justify-content:flex-end;gap:8px"><button type="button" class="btn sm ghost" data-act="sub" data-k="addv" data-v="" data-keep="1">Cancelar</button><button class="btn sm" type="submit">Abrir votación</button></div></form>`
      : `<button class="btn sm ghost" data-act="sub" data-k="addv" data-v="${a.id}" data-keep="1" style="align-self:flex-start">+ Agregar votación</button>`) : ''}
  </div>`).join('') || '<div class="card sub">No hay asambleas registradas.</div>'}</div>`;
};

/* ---------- circulares e información ---------- */
V.info = async () => {
  const [circ, conj] = await Promise.all([
    q(sb.from('circulares').select('*').eq('conjunto_id', C()).order('fijada', { ascending: false }).order('created_at', { ascending: false }).limit(50)),
    q(sb.from('conjuntos').select('info_util').eq('id', C()).maybeSingle())
  ]);
  return `<div class="stack"><h2>Información de interés</h2>
  ${W() ? `<details class="card"><summary><b>+ Publicar circular</b></summary><form class="form mt" data-form="circular">
    <div><label for="c-t">Título</label><input id="c-t" name="titulo" required></div>
    <div><label for="c-c">Categoría</label><select id="c-c" name="categoria"><option>Aviso</option><option>Convivencia</option><option>Asamblea</option><option>Seguridad</option><option>Mantenimiento</option><option>Evento</option></select></div>
    <div><label for="c-x">Mensaje</label><textarea id="c-x" name="cuerpo" rows="4" required></textarea></div>
    <label class="check"><input type="checkbox" name="fijada"> Fijar arriba</label>
    <button class="btn" type="submit">Publicar</button></form></details>` : ''}
  ${circ.map(c => `<div class="card"><div class="row"><span class="chip info">${esc(c.categoria)}</span><span class="sub">${c.fijada ? '📌 ' : ''}${fecha(c.created_at)}</span></div><h3 style="margin-top:8px">${esc(c.titulo)}</h3><p style="margin:4px 0 0">${nl(c.cuerpo)}</p>
    ${W() ? `<div class="row" style="justify-content:flex-end;margin-top:8px;gap:8px"><button class="btn sm ghost" data-act="fijar" data-id="${c.id}" data-v="${!c.fijada}">${c.fijada ? 'Desfijar' : 'Fijar'}</button><button class="btn sm ghost danger-t" data-act="borrar" data-tabla="circulares" data-id="${c.id}" data-confirm="¿Borrar circular?">Borrar</button></div>` : ''}</div>`).join('') || '<div class="card sub">No hay circulares publicadas.</div>'}
  <div class="card"><h2>Horarios y teléfonos</h2><p style="margin:8px 0 0">${conj && conj.info_util ? nl(conj.info_util) : '<span class="sub">La administración aún no ha cargado esta información.</span>'}</p>
  ${W() ? '<div class="sub mt">Se edita en Ajustes del conjunto.</div>' : ''}</div></div>`;
};

/* ---------- inicio del residente ---------- */
V.rinicio = async () => {
  const [saldoRow, circ, reservas, vots] = await Promise.all([
    q(sb.from('v_saldos').select('saldo').eq('unidad_id', U()).maybeSingle()),
    q(sb.from('circulares').select('*').eq('conjunto_id', C()).order('fijada', { ascending: false }).order('created_at', { ascending: false }).limit(3)),
    q(sb.from('reservas').select('fecha, horario, estado, zonas(nombre)').eq('unidad_id', U()).gte('fecha', HOY()).neq('estado', 'Cancelada').order('fecha').limit(3)),
    q(sb.from('votaciones').select('id').eq('conjunto_id', C()).eq('abierta', true))
  ]);
  const saldo = Number((saldoRow || {}).saldo || 0);
  const quick = [['reservas', 'Reservar', 'reservas'], ['chat', 'Chat', 'chat'], ['pqrs', 'PQRS', 'rpqrs'], ['reportes', 'Reportar', 'reportar'], ['info', 'Circulares', 'info'], ['asamblea', 'Asamblea', 'asamblea'], ['visitas', 'Visitas', 'misvisitas'], ['mas', 'Más', 'rmas']];
  return `<div class="stack">
  <div class="card hero-res"><div class="eyebrow" style="color:inherit;opacity:.8">Hola${S.user.user_metadata && S.user.user_metadata.nombre ? ', ' + esc(S.user.user_metadata.nombre.split(' ')[0]) : ''}</div>
    ${saldo > 0 ? `<div style="font-size:12.5px;opacity:.85;margin-top:6px">Saldo pendiente</div><div class="bigv">${fmt(saldo)}</div><button class="btn inv" data-act="tab" data-v="pagos" style="margin-top:12px;width:100%">Reportar pago</button>`
      : `<div class="bigv" style="margin-top:6px">Estás al día ✓</div><div style="font-size:12.5px;opacity:.85">Gracias por mantener tus cuotas al día.</div>`}</div>
  <div class="quick">${quick.map(([i, l, v]) => `<button data-act="tab" data-v="${v}">${svg(i)}${l}${v === 'chat' && S.unread ? `<span class="nbadge" style="right:8px">${S.unread}</span>` : ''}</button>`).join('')}</div>
  ${vots.length ? `<div class="alert"><b>Hay ${vots.length} votación${vots.length > 1 ? 'es' : ''} abierta${vots.length > 1 ? 's' : ''}.</b> Tu voto cuenta según el coeficiente de tu unidad. <button class="btn sm" data-act="tab" data-v="asamblea" style="margin-top:8px">Ir a votar</button></div>` : ''}
  <div class="card"><div class="row"><h2>Avisos</h2><button class="btn sm ghost" data-act="tab" data-v="info">Ver todos</button></div><div class="list" style="margin-top:6px">
    ${circ.map(x => `<div class="item"><div class="grow"><h3>${x.fijada ? '📌 ' : ''}${esc(x.titulo)}</h3><div class="sub">${esc(x.cuerpo).slice(0, 160)}</div></div></div>`).join('') || '<div class="sub" style="padding-top:6px">Sin avisos por ahora.</div>'}</div></div>
  <div class="card"><h2>Mis reservas</h2><div class="list" style="margin-top:6px">
    ${reservas.map(r => `<div class="item"><div class="ico">${esc((r.zonas || {}).nombre || '?')[0]}</div><div class="grow"><h3>${esc((r.zonas || {}).nombre)}</h3><div class="sub">${fecha(r.fecha)} · ${esc(r.horario)}</div></div><span class="chip ${chipEstado[r.estado]}">${r.estado}</span></div>`).join('') || '<div class="sub" style="padding-top:6px">No tienes reservas próximas.</div>'}</div></div>
  </div>`;
};

/* ---------- ajustes del conjunto ---------- */
V.config = async () => {
  if (!W()) return '<div class="card">Solo la administración puede cambiar los ajustes.</div>';
  const [conj, unidades, zonas, invs] = await Promise.all([
    q(sb.from('conjuntos').select('*').eq('id', C()).single()),
    q(sb.from('unidades').select('*').eq('conjunto_id', C()).order('codigo')),
    q(sb.from('zonas').select('*').eq('conjunto_id', C()).order('nombre')),
    q(sb.from('invitaciones').select('*').eq('conjunto_id', C()).order('created_at', { ascending: false }).limit(300))
  ]);
  const sumCoef = unidades.reduce((a, u) => a + Number(u.coeficiente), 0);
  const equipo = invs.filter(i => i.rol !== 'residente');
  const resInv = invs.filter(i => i.rol === 'residente');
  return `<div class="stack"><h2>Ajustes del conjunto</h2>
  <details class="card" open><summary><b>Datos generales</b></summary><form class="form mt" data-form="datos">
    <div><label for="d-n">Nombre</label><input id="d-n" name="nombre" value="${esc(conj.nombre)}" required></div>
    <div class="two"><div><label for="d-nit">NIT</label><input id="d-nit" name="nit" value="${esc(conj.nit)}"></div><div><label for="d-c">Ciudad</label><input id="d-c" name="ciudad" value="${esc(conj.ciudad)}"></div></div>
    <div><label for="d-d">Dirección</label><input id="d-d" name="direccion" value="${esc(conj.direccion)}"></div>
    <div><label for="d-p">Presupuesto mensual de cuotas ordinarias</label><input id="d-p" name="pres" type="number" min="0" step="1000" value="${Number(conj.presupuesto_mensual) || ''}"></div>
    <div><label for="d-i">Horarios, teléfonos y normas rápidas (lo ven los residentes)</label><textarea id="d-i" name="info" rows="5" placeholder="Portería: 300 000 0000&#10;Gimnasio: lun a sáb 5 a.m. – 10 p.m.">${esc(conj.info_util)}</textarea></div>
    <button class="btn" type="submit">Guardar</button></form></details>

  <details class="card" ${unidades.length ? '' : 'open'}><summary><b>Unidades</b> <span class="sub">(${unidades.length} · coeficientes suman ${sumCoef.toLocaleString('es-CO', { maximumFractionDigits: 4 })})</span></summary>
    <form class="form mt" data-form="importar">
      <div><label for="im-t">Pega desde Excel: código; coeficiente; propietario; correo</label>
      <textarea id="im-t" name="texto" rows="6" placeholder="T1-101;0,52;Laura Méndez;laura@correo.com&#10;T1-102;0,48;Andrés Ríos;andres@correo.com"></textarea></div>
      <p class="sub" style="margin:0">Una unidad por línea. Si el código ya existe, se actualiza. A cada correo le llega acceso como residente de esa unidad cuando cree su cuenta con ese mismo correo.</p>
      <button class="btn" type="submit">Cargar unidades</button></form>
    <div class="tblwrap mt"><table class="tbl"><thead><tr><th>Unidad</th><th>Coef.</th><th>Propietario</th><th>Correo</th><th>Acceso</th></tr></thead><tbody>
      ${unidades.map(u => { const inv = resInv.find(i => i.unidad_id === u.id); return `<tr><td>${esc(u.codigo)}</td><td class="mono">${Number(u.coeficiente).toLocaleString('es-CO', { maximumFractionDigits: 4 })}</td><td>${esc(u.propietario)}</td><td>${esc(u.email)}</td><td>${inv ? (inv.usada ? '<span class="chip ok">Activo</span>' : '<span class="chip warn">Invitado</span>') : '<span class="sub">—</span>'}</td></tr>`; }).join('') || '<tr><td colspan="5" class="sub">Sin unidades.</td></tr>'}
    </tbody></table></div></details>

  <details class="card"><summary><b>Zonas comunes</b> <span class="sub">(${zonas.length})</span></summary>
    ${zonas.map(z => `<div class="item"><div class="grow"><h3>${esc(z.nombre)}</h3><div class="sub">${(z.horarios || []).map(esc).join(' · ')}${Number(z.costo) + Number(z.deposito) > 0 ? ' · ' + fmt(Number(z.costo) + Number(z.deposito)) : ''}</div></div><button class="btn sm ghost danger-t" data-act="borrar" data-tabla="zonas" data-id="${z.id}" data-confirm="¿Borrar zona y sus reservas?">Borrar</button></div>`).join('')}
    <form class="form mt" data-form="zona">
      <div class="two"><div><label for="z-n">Nombre</label><input id="z-n" name="nombre" required placeholder="Salón social"></div><div><label for="z-a">Aforo</label><input id="z-a" name="aforo" type="number" min="0"></div></div>
      <div class="two"><div><label for="z-c">Alquiler</label><input id="z-c" name="costo" type="number" min="0" step="1000" value="0"></div><div><label for="z-d">Depósito</label><input id="z-d" name="deposito" type="number" min="0" step="1000" value="0"></div></div>
      <div><label for="z-h">Horarios disponibles (uno por línea)</label><textarea id="z-h" name="horarios" rows="3" required>10:00 a.m. – 3:00 p.m.\n4:00 p.m. – 10:00 p.m.</textarea></div>
      <div><label for="z-r">Reglas</label><input id="z-r" name="reglas" placeholder="Música hasta las 10 p.m."></div>
      <button class="btn" type="submit">Agregar zona</button></form></details>

  <details class="card"><summary><b>Equipo de gestión</b> <span class="sub">(administración y consejo)</span></summary>
    ${equipo.map(i => `<div class="item"><div class="grow"><h3>${esc(i.email)}</h3><div class="sub">${i.rol === 'admin' ? 'Administración' : i.rol === 'porteria' ? 'Portería' : 'Consejo'}</div></div><span class="chip ${i.usada ? 'ok' : 'warn'}">${i.usada ? 'Activo' : 'Invitado'}</span></div>`).join('')}
    <form class="form mt" data-form="invitar"><div class="two"><div><label for="iv-e">Correo</label><input id="iv-e" name="email" type="email" required></div>
      <div><label for="iv-r">Rol</label><select id="iv-r" name="rol"><option value="consejo">Consejo (solo consulta)</option><option value="admin">Administración</option><option value="porteria">Portería (vigilancia)</option></select></div></div>
      <p class="sub" style="margin:0">La persona entra creando su cuenta con ese correo.</p>
      <button class="btn" type="submit">Dar acceso</button></form></details></div>`;
};

/* =====================================================================
   ACCIONES (botones)
   ===================================================================== */
const ACT = {
  tab: d => go(d.v),
  ir: d => go(d.v),
  volver: () => go(gestiona() ? 'portafolio' : 'rinicio'),
  recargar: () => render(),
  modo: d => go('login', { modo: d.v }),
  sub: d => { const s = d.keep ? { ...S.sub } : {}; s[d.k] = d.v; if (d.k === 'zona' || d.k === 'fecha') s.slot = null; if (d.keep) { S.sub = s; render(); } else go(S.view, s); },
  salir: async () => { await sb.auth.signOut(); },
  reintentar: async () => { await inicioSesion(); if (!S.ctxs.length) toast('Aún no encontramos tu correo en ningún conjunto.'); },
  entrar: d => {
    const ctx = S.ctxs.find(c => c.conjunto_id === d.id && c.rol === d.rol) || S.ctxs.find(c => c.conjunto_id === d.id);
    if (!ctx) return;
    setCtx(ctx); go(d.go || inicioDe(ctx));
  },
  portafolio: () => { go('portafolio'); },
  archivo: d => abrirArchivo(d.path),
  pagoEstado: async d => {
    await q(sb.from('pagos').update({ estado: d.v, revisado_por: S.user.id }).eq('id', d.id));
    toast(d.v === 'aprobado' ? 'Pago aprobado y aplicado al saldo' : 'Pago rechazado'); render();
  },
  chatUnidad: d => go('chat', { unidad: d.id }),
  abrirChat: () => { const v = $('nuevoChat').value; if (v) go('chat', { unidad: v }); },
  ejecutar: async d => {
    await q(sb.from('mant_plan').update({ ultimo: HOY(), proximo: addMonths(HOY(), Number(d.f)) }).eq('id', d.id));
    toast('Ejecución registrada. Próxima fecha: ' + fecha(addMonths(HOY(), Number(d.f)))); render();
  },
  planOT: async d => {
    const p = await q(sb.from('mant_plan').select('*').eq('id', d.id).single());
    await q(sb.from('ordenes').insert({ conjunto_id: C(), titulo: p.activo, ubicacion: 'Zonas comunes', prioridad: 'Media', responsable: p.proveedor, origen: 'Plan preventivo' }));
    toast('Orden de trabajo creada'); go('mant', { t: 'correctivo' });
  },
  avanzarOT: async d => {
    await q(sb.from('ordenes').update({ estado: d.v, cerrada_at: d.v === 'Cerrada' ? new Date().toISOString() : null }).eq('id', d.id));
    toast('Orden ' + (d.v === 'Cerrada' ? 'cerrada' : 'en curso')); render();
  },
  borrar: async d => { await q(sb.from(d.tabla).delete().eq('id', d.id)); toast('Eliminado'); render(); },
  reservar: async (d, b) => {
    const unidad = W() ? $('ru').value : U();
    const fechaSel = S.sub.fecha || HOY();
    const row = { conjunto_id: C(), zona_id: d.z, unidad_id: unidad, fecha: fechaSel, horario: S.sub.slot };
    if (W()) row.estado = 'Confirmada';
    const ins = await q(sb.from('reservas').insert(row).select('estado').single());
    toast(ins.estado === 'Confirmada' ? 'Reserva confirmada' : 'Reserva creada. Queda pendiente del depósito.');
    S.sub = { zona: d.z, fecha: fechaSel }; render();
  },
  reservaEstado: async d => { await q(sb.from('reservas').update({ estado: d.v }).eq('id', d.id)); toast(d.v === 'Cancelada' ? 'Reserva cancelada' : 'Reserva confirmada'); render(); },
  rapida: d => { const f = document.querySelector('form[data-form="mensaje"]'); f.texto.value = d.t; f.requestSubmit(); },
  chatPqrs: async d => {
    const ult = await q(sb.from('mensajes').select('texto').eq('unidad_id', d.u).eq('de_admin', false).order('created_at', { ascending: false }).limit(1));
    const ins = await q(sb.from('pqrs').insert({ conjunto_id: C(), unidad_id: d.u, tipo: 'Petición', asunto: (ult[0] || {}).texto ? ult[0].texto.slice(0, 140) : 'Solicitud recibida por chat', detalle: 'Radicada desde el chat de atención.' }).select('radicado').single());
    await q(sb.from('mensajes').insert({ conjunto_id: C(), unidad_id: d.u, de_admin: true, texto: `Tu solicitud quedó radicada con el número ${radicado(ins.radicado)}. Te responderemos en máximo 15 días hábiles.` }));
    toast('Radicada como ' + radicado(ins.radicado)); render();
  },
  pqrsOT: async d => {
    const p = await q(sb.from('pqrs').select('*, unidades(codigo)').eq('id', d.id).single());
    await q(sb.from('ordenes').insert({ conjunto_id: C(), titulo: p.asunto, ubicacion: (p.unidades || {}).codigo || '', prioridad: 'Alta', origen: radicado(p.radicado) }));
    toast('Orden de trabajo creada desde ' + radicado(p.radicado));
  },
  votar: async d => {
    await q(sb.from('votos').upsert({ votacion_id: d.id, unidad_id: U(), conjunto_id: C(), opcion: d.v, user_id: S.user.id }, { onConflict: 'votacion_id,unidad_id' }));
    toast('Voto registrado'); render();
  },
  toggleVot: async d => { await q(sb.from('votaciones').update({ abierta: d.v === 'true' }).eq('id', d.id)); toast(d.v === 'true' ? 'Votación reabierta' : 'Votación cerrada'); render(); },
  fijar: async d => { await q(sb.from('circulares').update({ fijada: d.v === 'true' }).eq('id', d.id)); render(); }
};

const CHG = {
  zona: el => { S.sub = { zona: el.value, fecha: S.sub.fecha }; render(); },
  fecha: el => { if (el.value && el.value >= HOY()) { S.sub = { ...S.sub, fecha: el.value, slot: null }; render(); } }
};

/* =====================================================================
   FORMULARIOS
   ===================================================================== */
const FORM = {
  login: async f => {
    const { error } = await sb.auth.signInWithPassword({ email: f.email.trim(), password: f.pass });
    if (error) throw error;
  },
  registro: async f => {
    const { data, error } = await sb.auth.signUp({ email: f.email.trim(), password: f.pass, options: { data: { nombre: f.nombre.trim(), autoriza_datos: new Date().toISOString() }, emailRedirectTo: location.origin + location.pathname } });
    if (error) throw error;
    if (!data.session) { go('login', { modo: 'entrar' }); toast('Te enviamos un correo para confirmar tu cuenta. Ábrelo y luego inicia sesión.', 6000); }
  },
  recuperar: async f => {
    const { error } = await sb.auth.resetPasswordForEmail(f.email.trim(), { redirectTo: location.origin + location.pathname });
    if (error) throw error;
    toast('Si el correo tiene cuenta, te llegará un enlace para cambiar la contraseña.', 5000); go('login');
  },
  clave: async f => { const { error } = await sb.auth.updateUser({ password: f.pass }); if (error) throw error; toast('Contraseña actualizada'); await inicioSesion(); },
  nuevoConj: async f => {
    const id = await q(sb.rpc('crear_conjunto', { p_nombre: f.nombre.trim(), p_nit: f.nit || null, p_ciudad: f.ciudad || null, p_presupuesto: Number(f.pres) || 0 }));
    await cargarAccesos();
    setCtx(S.ctxs.find(c => c.conjunto_id === id && c.rol === 'admin'));
    toast('Conjunto creado. Ahora carga las unidades.'); go('config');
  },
  generar: async f => {
    const n = await q(sb.rpc('generar_cuotas', { p_conjunto: C(), p_periodo: f.mes + '-01', p_vence: f.vence }));
    toast(n ? `${n} cuotas liquidadas` : 'Las cuotas de ese mes ya estaban liquidadas'); render();
  },
  pagoManual: async f => {
    await q(sb.from('pagos').insert({ conjunto_id: C(), unidad_id: f.unidad, valor: Number(f.valor), fecha_pago: f.fecha, medio: f.medio, estado: 'aprobado', revisado_por: S.user.id, nota: 'Registrado por administración' }));
    toast('Pago registrado'); render();
  },
  reportarPago: async (f, form) => {
    const path = await subir(form.archivo.files[0], 'pagos');
    await q(sb.from('pagos').insert({ conjunto_id: C(), unidad_id: U(), valor: Number(f.valor), fecha_pago: f.fecha, medio: f.medio, comprobante: path }));
    toast('Comprobante enviado. La administración lo revisará.'); render();
  },
  plan: async f => {
    await q(sb.from('mant_plan').insert({ conjunto_id: C(), activo: f.activo, frecuencia_meses: Number(f.freq), proximo: f.proximo, proveedor: f.proveedor || null, costo: Number(f.costo) || 0, nota: f.nota || null, activo_id: f.activo || null }));
    toast('Agregado al plan'); render();
  },
  orden: async (f, form) => {
    const foto = await subir(form.foto.files[0], 'danos');
    await q(sb.from('ordenes').insert({ conjunto_id: C(), titulo: f.titulo, ubicacion: f.ubicacion, prioridad: f.prioridad, responsable: f.responsable || null, origen: 'Administración', foto, activo_id: f.activo || null }));
    toast('Orden de trabajo creada'); render();
  },
  dano: async (f, form) => {
    const foto = await subir(form.foto.files[0], 'danos');
    await q(sb.from('ordenes').insert({ conjunto_id: C(), titulo: f.titulo, ubicacion: f.ubicacion, origen: 'Residente ' + (S.ctx.unidad_codigo || ''), foto }));
    toast('Reporte enviado a la administración'); render();
  },
  mensaje: async (f, form) => {
    const t = (f.texto || '').trim(); if (!t) return;
    form.texto.value = '';
    await q(sb.from('mensajes').insert({ conjunto_id: C(), unidad_id: form.dataset.u, texto: t, de_admin: !R() }));
    render();
  },
  responder: async (f, form) => {
    await q(sb.from('pqrs').update({ respuesta: f.respuesta, estado: 'Respondida', respondida_at: new Date().toISOString() }).eq('id', form.dataset.id));
    toast('Respuesta enviada'); S.sub = { f: S.sub.f }; render();
  },
  radicar: async f => {
    const r = await q(sb.from('pqrs').insert({ conjunto_id: C(), unidad_id: U(), tipo: f.tipo, asunto: f.asunto, detalle: f.detalle || null }).select('radicado').single());
    toast('Radicada con el número ' + radicado(r.radicado), 4000); render();
  },
  asamblea: async f => {
    await q(sb.from('asambleas').insert({ conjunto_id: C(), titulo: f.titulo, fecha: new Date(f.fecha).toISOString(), descripcion: f.descripcion || null }));
    toast('Asamblea creada'); render();
  },
  votacion: async (f, form) => {
    const opciones = f.opciones.split('\n').map(s => s.trim()).filter(Boolean);
    if (opciones.length < 2) throw new Error('Escribe al menos dos opciones.');
    await q(sb.from('votaciones').insert({ conjunto_id: C(), asamblea_id: form.dataset.id, pregunta: f.pregunta, opciones }));
    toast('Votación abierta'); S.sub = {}; render();
  },
  circular: async f => {
    await q(sb.from('circulares').insert({ conjunto_id: C(), titulo: f.titulo, categoria: f.categoria, cuerpo: f.cuerpo, fijada: !!f.fijada }));
    toast('Circular publicada'); render();
  },
  datos: async f => {
    await q(sb.from('conjuntos').update({ nombre: f.nombre, nit: f.nit || null, ciudad: f.ciudad || null, direccion: f.direccion || null, presupuesto_mensual: Number(f.pres) || 0, info_util: f.info || null }).eq('id', C()));
    S.ctx.nombre = f.nombre; S.ctx.ciudad = f.ciudad;
    S.ctxs.filter(c => c.conjunto_id === C()).forEach(c => { c.nombre = f.nombre; c.ciudad = f.ciudad; });
    toast('Datos guardados'); render();
  },
  importar: async f => {
    const filas = f.texto.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => {
      const sep = l.includes(';') ? ';' : l.includes('\t') ? '\t' : ',';
      const [codigo, coef, propietario, email] = l.split(sep).map(s => (s || '').trim());
      return { codigo, coeficiente: Number(String(coef || '0').replace(',', '.')) || 0, propietario: propietario || null, email: email ? email.toLowerCase() : null };
    }).filter(r => r.codigo && !/^c[oó]digo$/i.test(r.codigo));
    if (!filas.length) throw new Error('No encontré unidades en el texto pegado.');
    const malos = filas.filter(r => r.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email));
    if (malos.length) throw new Error('Revisa estos correos: ' + malos.map(r => r.codigo).join(', '));
    const unis = await q(sb.from('unidades').upsert(filas.map(r => ({ ...r, conjunto_id: C() })), { onConflict: 'conjunto_id,codigo' }).select('id, codigo, email'));
    const prev = await q(sb.from('invitaciones').select('email, unidad_id').eq('conjunto_id', C()).eq('rol', 'residente'));
    const nuevas = unis.filter(u => u.email && !prev.some(p => p.unidad_id === u.id && p.email.toLowerCase() === u.email))
      .map(u => ({ conjunto_id: C(), email: u.email, rol: 'residente', unidad_id: u.id }));
    if (nuevas.length) await q(sb.from('invitaciones').insert(nuevas));
    toast(`${unis.length} unidades cargadas · ${nuevas.length} residentes invitados`, 4000); render();
  },
  zona: async f => {
    await q(sb.from('zonas').insert({ conjunto_id: C(), nombre: f.nombre, aforo: Number(f.aforo) || null, costo: Number(f.costo) || 0, deposito: Number(f.deposito) || 0, reglas: f.reglas || null, horarios: f.horarios.split('\n').map(s => s.trim()).filter(Boolean) }));
    toast('Zona creada'); render();
  },
  invitar: async f => {
    await q(sb.from('invitaciones').insert({ conjunto_id: C(), email: f.email.trim().toLowerCase(), rol: f.rol }));
    toast('Acceso creado. Avísale que entre con ese correo.'); render();
  }
};

/* =====================================================================
   EVENTOS
   ===================================================================== */
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
  const d = b.dataset;
  if (d.confirm && b.dataset.armed !== '1') {
    b.dataset.armed = '1'; const t = b.textContent; b.textContent = d.confirm + ' Toca otra vez';
    setTimeout(() => { if (b.isConnected) { b.dataset.armed = ''; b.textContent = t; } }, 3500); return;
  }
  const fn = ACT[d.act]; if (!fn) return;
  b.disabled = true;
  try { await fn(d, b); } catch (err) { console.error(err); toast(traducir(err), 4500); } finally { if (b.isConnected) b.disabled = false; }
});
document.addEventListener('change', e => { const el = e.target.closest('[data-chg]'); if (el && CHG[el.dataset.chg]) CHG[el.dataset.chg](el); });
document.addEventListener('submit', async e => {
  const form = e.target.closest('form[data-form]'); if (!form) return;
  e.preventDefault();
  const fn = FORM[form.dataset.form]; if (!fn) return;
  const data = {}; new FormData(form).forEach((v, k) => { if (!(v instanceof File)) data[k] = v; });
  const btn = form.querySelector('button[type="submit"]'); if (btn) btn.disabled = true;
  try { await fn(data, form); } catch (err) { console.error(err); toast(traducir(err), 4500); } finally { if (btn && btn.isConnected) btn.disabled = false; }
});
$('conjBtn').addEventListener('click', () => go('portafolio'));
$('roleBtn').addEventListener('click', () => go('contextos'));

/* =====================================================================
   ARRANQUE
   ===================================================================== */
async function arrancar() {
  if (!CONFIG_OK) return go('config_falta');
  const { data } = await sb.auth.getSession();
  sb.auth.onAuthStateChange((ev, session) => {
    if (ev === 'PASSWORD_RECOVERY') { S.user = session && session.user; return go('clave'); }
    if (ev === 'SIGNED_IN' && session && (!S.user || S.user.id !== session.user.id)) { S.user = session.user; inicioSesion().catch(err => toast(traducir(err))); }
    if (ev === 'SIGNED_OUT') { S.user = null; S.ctxs = []; setCtx(null); go('login'); }
  });
  if (!data.session) return go('login');
  S.user = data.session.user;
  if (RECUPERACION) return go('clave');
  try {
    await cargarAccesos();
    if (typeof rutaQR === 'function' && await rutaQR()) return;
    if (!S.ctxs.length) return go(S.plat && S.plat.dueno ? 'plataforma' : 'sinacceso');
    let guardado = ''; try { guardado = localStorage.getItem('c360_ctx') || ''; } catch (e) { }
    const [gid, grol] = guardado.split('|');
    const prev = S.ctxs.find(c => c.conjunto_id === gid && c.rol === grol);
    if (prev) { setCtx(prev); return go(inicioDe(prev)); }
    if (gestiona()) return go('portafolio');
    setCtx(S.ctxs[0]); go(inicioDe(S.ctxs[0]));
  } catch (err) { toast(traducir(err)); go('login'); }
}
// arrancar() se llama desde index.html, después de cargar modulos.js
