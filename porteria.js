/* =====================================================================
   SYAPH360 · Portería, reportes con fotos, fotos en el chat y avisos
   Depende de app.js y modulos.js.
   ===================================================================== */

Object.assign(ICONS, {
  porteria: '<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  visitas: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.9 3.1-6.5 7-6.5s7 2.6 7 6.5"/>',
  paquetes: '<path d="M3 7.5L12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5l9 4.5 9-4.5M12 12v9"/>',
  minuta: '<path d="M6 3h11a1 1 0 011 1v16a1 1 0 01-1 1H6z"/><path d="M9 8h6M9 12h6M9 16h4M6 3v18"/>',
  reportes: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  campana: '<path d="M6 16V11a6 6 0 0112 0v5l2 2H4z"/><path d="M10 20a2 2 0 004 0"/>'
});
TABS.porteria = [['porteria', 'Portería'], ['visitas', 'Visitas'], ['paquetes', 'Paquetes'], ['minuta', 'Minuta'], ['reportes', 'Reportes']];
const VISTAS_VIVAS = ['porteria', 'visitas', 'paquetes', 'misvisitas', 'mispaquetes', 'reportes', 'misreportes', 'notificaciones', 'bitacora', 'rinicio'];

/* ---------- fotos: comprimir antes de subir y mostrar con enlace temporal ---------- */
function comprimir(file) {
  return new Promise(res => {
    if (!file || !file.type || !file.type.startsWith('image/') || file.size < 400 * 1024) return res(file);
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 1600, k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(b => { URL.revokeObjectURL(url); res(b ? new File([b], (file.name || 'foto').replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file); }, 'image/jpeg', 0.82);
    };
    img.onerror = () => { URL.revokeObjectURL(url); res(file); };
    img.src = url;
  });
}
const _subir = subir;
subir = async (file, carpeta) => _subir(await comprimir(file), carpeta);
async function subirVarias(files, carpeta, max = 4) {
  const lista = [...(files || [])].slice(0, max), rutas = [];
  for (const f of lista) { const r = await subir(f, carpeta); if (r) rutas.push(r); }
  return rutas;
}
const fotosHTML = (fotos, clase = 'thumbs') => (fotos && fotos.length) ? `<div class="${clase}">${fotos.map(f => `<img data-foto="${esc(f)}" alt="Foto" loading="lazy">`).join('')}</div>` : '';
window.despuesDeRender = async () => {
  const imgs = [...document.querySelectorAll('img[data-foto]:not([src])')];
  if (!imgs.length) return;
  const rutas = [...new Set(imgs.map(i => i.dataset.foto))];
  const { data } = await sb.storage.from('soportes').createSignedUrls(rutas, 3600);
  (data || []).forEach(d => { if (d.signedUrl) imgs.filter(i => i.dataset.foto === d.path).forEach(i => { i.src = d.signedUrl; i.onclick = () => window.open(d.signedUrl, '_blank'); }); });
};

/* ---------- roles y navegación ---------- */
const P = () => ROL() === 'porteria';
const OP = () => W() || (P() && S.ctx.vigente !== false);
const nombreRol = r => ({ admin: 'Administración', consejo: 'Consejo', residente: 'Residente', porteria: 'Portería' })[r] || r;

const _header2 = header;
header = function () {
  _header2();
  if (S.ctx && P() && !['plataforma', 'solicitud', 'contextos'].includes(S.view)) $('hsub').textContent = (S.ctx.ciudad ? S.ctx.ciudad + ' · ' : '') + 'Portería';
  const b = $('notifBtn');
  if (b) { b.hidden = !S.ctx || ['portafolio', 'plataforma', 'solicitud', 'contextos', 'sinacceso', 'nuevo'].includes(S.view); $('notifN').hidden = !S.notif; $('notifN').textContent = S.notif > 9 ? '9+' : S.notif; }
};

/* ---------- avisos en tiempo real ---------- */
S.notif = 0; S.canalAvisos = null;
async function refrescarNotif() {
  if (!S.ctx) { S.notif = 0; header(); return; }
  const r = await sb.rpc('notif_sin_ver', { p_conjunto: C() });
  S.notif = Number(r.data || 0); header();
}
function suscribirAvisos() {
  if (S.canalAvisos) { sb.removeChannel(S.canalAvisos); S.canalAvisos = null; }
  if (!S.ctx) return;
  const cid = C();
  const alCambio = () => { if (VISTAS_VIVAS.includes(S.view)) render(); };
  S.canalAvisos = sb.channel('avisos-' + cid)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificaciones', filter: 'conjunto_id=eq.' + cid }, p => {
      const n = p.new || {};
      if (n.user_id && n.user_id !== S.user.id) return;
      S.notif++; header();
      toast(n.titulo + (n.cuerpo ? ' · ' + n.cuerpo : ''), 6000);
      try { navigator.vibrate && navigator.vibrate([120, 60, 120]); } catch (e) { }
      try { if (window.Notification && Notification.permission === 'granted' && document.hidden) new Notification(n.titulo, { body: n.cuerpo || '', icon: 'icon-192.png', tag: n.id }); } catch (e) { }
      alCambio();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'visitas', filter: 'conjunto_id=eq.' + cid }, alCambio)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'paquetes', filter: 'conjunto_id=eq.' + cid }, alCambio)
    .subscribe();
}
const _setCtx2 = setCtx;
setCtx = function (ctx) { _setCtx2(ctx); suscribirAvisos(); refrescarNotif(); };

V.notificaciones = async () => {
  const lista = await q(sb.from('notificaciones').select('*').eq('conjunto_id', C()).order('created_at', { ascending: false }).limit(60));
  const visto = await sb.from('notif_visto').select('visto_at').eq('conjunto_id', C()).eq('user_id', S.user.id).maybeSingle();
  const desde = visto.data ? visto.data.visto_at : null;
  const permiso = window.Notification ? Notification.permission : 'no';
  return `<div class="stack"><h2>Avisos</h2>
  ${permiso === 'default' ? `<div class="card stack" style="gap:8px"><p style="margin:0">Activa los avisos para que el celular te alerte cuando llegue una visita, un paquete o un reporte, mientras tengas la app abierta.</p><button class="btn" data-act="permisoAvisos" style="align-self:flex-start">Activar avisos en este dispositivo</button></div>` : ''}
  <div class="card list" style="padding-block:4px">${lista.map(n => `<button class="item chatrow" data-act="tab" data-v="${esc(n.vista || 'notificaciones')}">
    <div class="ico">${svg(n.tipo === 'paquete' ? 'paquetes' : n.tipo === 'visita' ? 'visitas' : n.tipo === 'reporte' ? 'reportes' : n.tipo === 'minuta' ? 'minuta' : 'info')}</div>
    <div class="grow"><div class="row"><h3>${(!desde || n.created_at > desde) ? '<span class="dotnew"></span>' : ''}${esc(n.titulo)}</h3><span class="sub">${fechaHora(n.created_at)}</span></div>${n.cuerpo ? `<div class="sub">${esc(n.cuerpo)}</div>` : ''}</div></button>`).join('') || '<div class="sub" style="padding:10px 0">No tienes avisos todavía.</div>'}</div></div>`;
};
AFTER.notificaciones = () => { sb.rpc('marcar_notif_vistas', { p_conjunto: C() }).then(() => { S.notif = 0; header(); }); };

/* ---------- portería: tablero ---------- */
const chipVisita = { 'Preautorizada': 'info', 'Esperando': 'warn', 'Autorizada': 'ok', 'Rechazada': 'bad', 'Ingresó': 'ok', 'Salió': 'info' };
const unidadesDe = () => q(sb.from('unidades').select('id, codigo, propietario').eq('conjunto_id', C()).order('codigo'));
const selUnidad = (unis, name = 'unidad', id = 'x-u') => `<select id="${id}" name="${name}" required><option value="">Escoge la unidad…</option>${unis.map(u => `<option value="${u.id}">${esc(u.codigo)}${u.propietario ? ' · ' + esc(u.propietario) : ''}</option>`).join('')}</select>`;
const accionesVisita = v => {
  if (!OP()) return '';
  const b = (a, l, cl = '') => `<button class="btn sm ${cl}" data-act="visitaEstado" data-id="${v.id}" data-v="${a}">${l}</button>`;
  if (v.estado === 'Preautorizada' || v.estado === 'Autorizada') return b('Ingresó', 'Marcar ingreso');
  if (v.estado === 'Esperando') return `<span class="sub">Esperando respuesta…</span>${b('Autorizada', 'Autorizó por citófono', 'ghost')}${b('Rechazada', 'No autorizó', 'ghost danger-t')}`;
  if (v.estado === 'Ingresó') return b('Salió', 'Marcar salida', 'ghost');
  return '';
};
const filaVisita = v => `<div class="item"><div class="ico">${svg('visitas').replace('<svg', '<svg width="18" height="18"')}</div><div class="grow">
  <div class="row"><h3>${esc(v.nombre)}</h3><span class="chip ${chipVisita[v.estado]}">${v.estado}</span></div>
  <div class="sub">${esc((v.unidades || {}).codigo || '')} · ${esc(v.tipo)}${v.placa ? ' · placa ' + esc(v.placa) : ''}${v.fecha_esperada ? ' · para ' + fecha(v.fecha_esperada) : ''}${v.entrada_at ? ' · entró ' + hora(v.entrada_at) : ''}${v.salida_at ? ' · salió ' + hora(v.salida_at) : ''}${v.nota ? ' · ' + esc(v.nota) : ''}</div>
  <div class="row" style="justify-content:flex-end;gap:6px;margin-top:6px;flex-wrap:wrap">${accionesVisita(v)}</div></div></div>`;

V.porteria = async () => {
  const hoyIni = new Date(); hoyIni.setHours(0, 0, 0, 0);
  const [vis, paq, min] = await Promise.all([
    q(sb.from('visitas').select('*, unidades(codigo)').eq('conjunto_id', C()).or(`estado.in.(Esperando,Autorizada,Ingresó),and(estado.eq.Preautorizada,fecha_esperada.lte.${HOY()})`).order('created_at', { ascending: false }).limit(60)),
    q(sb.from('paquetes').select('*, unidades(codigo)').eq('conjunto_id', C()).eq('estado', 'En portería').order('recibido_at', { ascending: false })),
    q(sb.from('minuta').select('*').eq('conjunto_id', C()).gte('created_at', hoyIni.toISOString()).order('created_at', { ascending: false }).limit(5))
  ]);
  const esp = vis.filter(v => v.estado === 'Esperando'), pre = vis.filter(v => ['Preautorizada', 'Autorizada'].includes(v.estado)), dentro = vis.filter(v => v.estado === 'Ingresó');
  return `<div class="stack">
  <div class="quick">${[['visitas', 'Registrar visita', 'visitas'], ['paquetes', 'Registrar paquete', 'paquetes'], ['minuta', 'Anotar en minuta', 'minuta'], ['reportes', 'Reportar situación', 'reportar']].map(([i, l, v]) => `<button data-act="tab" data-v="${v}">${svg(i)}${l}</button>`).join('')}</div>
  <div class="kpis">
    <div class="kpi"><div class="v">${esp.length}</div><div class="l">Visitas esperando respuesta</div></div>
    <div class="kpi"><div class="v">${pre.length}</div><div class="l">Autorizadas o preautorizadas para hoy</div></div>
    <div class="kpi"><div class="v">${dentro.length}</div><div class="l">Visitantes adentro</div></div>
    <div class="kpi"><div class="v">${paq.length}</div><div class="l">Paquetes por entregar</div></div>
  </div>
  ${esp.length ? `<div class="card"><h2>Esperando respuesta del residente</h2><div class="list" style="margin-top:6px">${esp.map(filaVisita).join('')}</div></div>` : ''}
  <div class="card"><h2>Pueden ingresar</h2><div class="list" style="margin-top:6px">${pre.map(filaVisita).join('') || '<div class="sub" style="padding-top:6px">No hay visitas autorizadas pendientes por ingresar.</div>'}</div></div>
  <div class="card"><h2>Adentro ahora</h2><div class="list" style="margin-top:6px">${dentro.map(filaVisita).join('') || '<div class="sub" style="padding-top:6px">No hay visitantes adentro.</div>'}</div></div>
  <div class="card"><div class="row"><h2>Paquetes por entregar</h2><button class="btn sm ghost" data-act="tab" data-v="paquetes">Ver todos</button></div><div class="list" style="margin-top:6px">${paq.slice(0, 6).map(p => `<div class="item"><div class="grow"><h3>${esc((p.unidades || {}).codigo)} · ${esc(p.descripcion)}</h3><div class="sub">${esc(p.empresa || '')} · recibido ${fechaHora(p.recibido_at)}</div></div></div>`).join('') || '<div class="sub" style="padding-top:6px">No hay paquetes en portería.</div>'}</div></div>
  <div class="card"><div class="row"><h2>Minuta de hoy</h2><button class="btn sm ghost" data-act="tab" data-v="minuta">Abrir minuta</button></div><div class="list" style="margin-top:6px">${min.map(filaMinuta).join('') || '<div class="sub" style="padding-top:6px">Sin anotaciones hoy.</div>'}</div></div>
  </div>`;
};

/* ---------- portería: visitas ---------- */
V.visitas = async () => {
  const [unis, vis] = await Promise.all([
    OP() ? unidadesDe() : Promise.resolve([]),
    q(sb.from('visitas').select('*, unidades(codigo)').eq('conjunto_id', C()).order('created_at', { ascending: false }).limit(80))
  ]);
  return `<div class="stack"><h2>Visitas</h2>
  ${OP() ? `<form class="card form" data-form="visita"><h3>Registrar una visita que llegó</h3>
    <div class="two"><div><label for="vi-u">Para la unidad</label>${selUnidad(unis, 'unidad', 'vi-u')}</div><div><label for="vi-t">Tipo</label><select id="vi-t" name="tipo"><option>Visita</option><option>Domicilio</option><option>Servicio</option><option>Proveedor</option></select></div></div>
    <div class="two"><div><label for="vi-n">Nombre del visitante</label><input id="vi-n" name="nombre" required></div><div><label for="vi-p">Placa (si viene en vehículo)</label><input id="vi-p" name="placa" style="text-transform:uppercase"></div></div>
    <div><label for="vi-no">Nota</label><input id="vi-no" name="nota" placeholder="Ej. trae herramientas, viene con 2 personas"></div>
    <label class="check"><input type="checkbox" name="directo"> Ya está autorizado (preautorizado o confirmado por citófono): marcar ingreso de una vez</label>
    <p class="sub" style="margin:0">Si no marcas la casilla, al residente le llega el aviso para que autorice desde su celular y aquí ves la respuesta al instante.</p>
    <button class="btn" type="submit">Registrar</button></form>` : ''}
  <div class="card"><h2>Movimiento reciente</h2><div class="list" style="margin-top:6px">${vis.map(filaVisita).join('') || '<div class="sub" style="padding-top:6px">No hay visitas registradas.</div>'}</div></div></div>`;
};

/* ---------- portería: paquetes ---------- */
V.paquetes = async () => {
  const [unis, paq] = await Promise.all([
    OP() ? unidadesDe() : Promise.resolve([]),
    q(sb.from('paquetes').select('*, unidades(codigo)').eq('conjunto_id', C()).order('recibido_at', { ascending: false }).limit(80))
  ]);
  const pend = paq.filter(p => p.estado === 'En portería'), entr = paq.filter(p => p.estado === 'Entregado').slice(0, 20);
  const fila = p => `<div class="item"><div class="grow"><div class="row"><h3>${esc((p.unidades || {}).codigo)} · ${esc(p.descripcion)}</h3><span class="chip ${p.estado === 'Entregado' ? 'ok' : 'warn'}">${p.estado}</span></div>
    <div class="sub">${esc(p.empresa || '')}${p.empresa ? ' · ' : ''}recibido ${fechaHora(p.recibido_at)}${p.entregado_at ? ' · entregado ' + fechaHora(p.entregado_at) + (p.entregado_a ? ' a ' + esc(p.entregado_a) : '') : ''}</div>
    ${fotosHTML(p.foto ? [p.foto] : [])}
    ${OP() && p.estado === 'En portería' ? (S.sub.entregar === p.id ? `<form class="form mt" data-form="entregar" data-id="${p.id}"><div><label>¿Quién lo recibe?</label><input name="quien" required placeholder="Nombre de quien recoge"></div><div class="row" style="justify-content:flex-end;gap:8px"><button type="button" class="btn sm ghost" data-act="sub" data-k="entregar" data-v="" data-keep="1">Cancelar</button><button class="btn sm" type="submit">Confirmar entrega</button></div></form>`
      : `<div class="row" style="justify-content:flex-end;margin-top:6px"><button class="btn sm" data-act="sub" data-k="entregar" data-v="${p.id}" data-keep="1">Entregar</button></div>`) : ''}</div></div>`;
  return `<div class="stack"><h2>Paquetes y correspondencia</h2>
  ${OP() ? `<form class="card form" data-form="paquete"><h3>Registrar un paquete que llegó</h3>
    <div class="two"><div><label for="pq-u">Para la unidad</label>${selUnidad(unis, 'unidad', 'pq-u')}</div><div><label for="pq-e">Empresa</label><input id="pq-e" name="empresa" placeholder="Servientrega, Rappi, Amazon…"></div></div>
    <div><label for="pq-d">Qué es</label><input id="pq-d" name="descripcion" required placeholder="Caja mediana, sobre, domicilio"></div>
    <div><label for="pq-f">Foto (opcional)</label><input id="pq-f" name="foto" type="file" accept="image/*" capture="environment"></div>
    <p class="sub" style="margin:0">Al residente le llega el aviso de inmediato.</p>
    <button class="btn" type="submit">Registrar y avisar</button></form>` : ''}
  <div class="card"><h2>En portería (${pend.length})</h2><div class="list" style="margin-top:6px">${pend.map(fila).join('') || '<div class="sub" style="padding-top:6px">No hay paquetes pendientes.</div>'}</div></div>
  <div class="card"><h2>Entregados recientes</h2><div class="list" style="margin-top:6px">${entr.map(fila).join('') || '<div class="sub" style="padding-top:6px">Sin entregas recientes.</div>'}</div></div></div>`;
};

/* ---------- portería: minuta ---------- */
const filaMinuta = m => `<div class="item"><div class="ico">${svg('minuta').replace('<svg', '<svg width="18" height="18"')}</div><div class="grow">
  <div class="row"><h3>${esc(m.tipo)}${m.urgente ? ' <span class="chip bad">Urgente</span>' : ''}</h3><span class="sub">${fechaHora(m.created_at)}</span></div>
  <div class="sub" style="color:var(--ink)">${nl(m.descripcion)}</div>${fotosHTML(m.foto ? [m.foto] : [])}</div></div>`;
V.minuta = async () => {
  const lista = await q(sb.from('minuta').select('*').eq('conjunto_id', C()).order('created_at', { ascending: false }).limit(100));
  return `<div class="stack"><h2>Minuta de portería</h2>
  ${OP() ? `<form class="card form" data-form="minuta"><div class="two"><div><label for="mi-t">Tipo</label><select id="mi-t" name="tipo"><option>Novedad</option><option>Ronda</option><option>Incidente</option><option>Entrega de turno</option></select></div>
    <div style="display:flex;align-items:flex-end"><label class="check"><input type="checkbox" name="urgente"> Urgente: avisar a la administración</label></div></div>
    <div><label for="mi-d">Qué pasó</label><textarea id="mi-d" name="descripcion" rows="3" required placeholder="Ej. Ronda 10 p.m. sin novedad / Puerta vehicular no cierra completo"></textarea></div>
    <div><label for="mi-f">Foto (opcional)</label><input id="mi-f" name="foto" type="file" accept="image/*" capture="environment"></div>
    <p class="sub" style="margin:0">Los incidentes y lo marcado como urgente le llegan como aviso a la administración.</p>
    <button class="btn" type="submit">Anotar</button></form>` : ''}
  <div class="card"><div class="list">${lista.map(filaMinuta).join('') || '<div class="sub">La minuta está vacía.</div>'}</div></div></div>`;
};

/* ---------- reportes con fotos ---------- */
const CAT_REP = ['Daño', 'Seguridad', 'Aseo', 'Convivencia', 'Mascotas', 'Parqueadero', 'Otro'];
const chipRep = { 'Nuevo': 'warn', 'En revisión': 'info', 'Resuelto': 'ok' };
const tarjetaReporte = (r, conAcciones) => `<div class="card stack" style="gap:6px">
  <div class="row"><span class="mono" style="color:var(--muted)">#${r.numero}</span><span class="row" style="gap:6px">${r.urgente ? '<span class="chip bad">Urgente</span>' : ''}<span class="chip ${chipRep[r.estado]}">${r.estado}</span></span></div>
  <h3>${esc(r.titulo)}</h3>
  <div class="sub">${esc(r.categoria)}${r.ubicacion ? ' · ' + esc(r.ubicacion) : ''}${(r.unidades || {}).codigo ? ' · ' + esc(r.unidades.codigo) : ''} · ${esc(r.origen)} · ${fechaHora(r.created_at)}</div>
  ${r.descripcion ? `<p style="margin:0">${nl(r.descripcion)}</p>` : ''}
  ${fotosHTML(r.fotos)}
  ${r.respuesta ? `<div class="resp">Administración: ${nl(r.respuesta)}</div>` : ''}
  ${conAcciones && W() && r.estado !== 'Resuelto' ? (S.sub.resp === r.id ? `<form class="form" data-form="resolverReporte" data-id="${r.id}"><textarea name="respuesta" rows="3" required aria-label="Respuesta al residente" placeholder="Qué se hizo o qué se va a hacer"></textarea>
      <div class="row" style="justify-content:flex-end;gap:8px"><button type="button" class="btn sm ghost" data-act="sub" data-k="resp" data-v="" data-keep="1">Cancelar</button><button class="btn sm" type="submit">Responder y cerrar</button></div></form>`
    : `<div class="row" style="justify-content:flex-end;gap:6px;flex-wrap:wrap">${r.estado === 'Nuevo' ? `<button class="btn sm ghost" data-act="reporteEstado" data-id="${r.id}" data-v="En revisión">En revisión</button>` : ''}${!r.orden_id ? `<button class="btn sm ghost" data-act="reporteOT" data-id="${r.id}">Pasar a mantenimiento</button>` : '<span class="sub">Con orden de trabajo</span>'}<button class="btn sm" data-act="sub" data-k="resp" data-v="${r.id}" data-keep="1">Responder</button></div>`) : ''}
</div>`;

V.reportes = async () => {
  const f = S.sub.f || 'abiertos';
  let p = sb.from('reportes').select('*, unidades(codigo)').eq('conjunto_id', C()).order('created_at', { ascending: false }).limit(100);
  if (f === 'abiertos') p = p.neq('estado', 'Resuelto'); else if (f === 'Resuelto') p = p.eq('estado', 'Resuelto');
  const lista = await q(p);
  lista.sort((a, b) => (b.urgente - a.urgente));
  return `<div class="stack"><div class="row"><h2>Reportes</h2><button class="btn sm" data-act="tab" data-v="reportar">+ Nuevo reporte</button></div>
  <div class="seg" role="group" aria-label="Filtro">${[['abiertos', 'Abiertos'], ['Resuelto', 'Resueltos'], ['todos', 'Todos']].map(([k, l]) => `<button data-act="sub" data-k="f" data-v="${k}" aria-pressed="${f === k}">${l}</button>`).join('')}</div>
  ${lista.map(r => tarjetaReporte(r, true)).join('') || '<div class="card sub">No hay reportes en este filtro.</div>'}</div>`;
};

V.reportar = async () => {
  const mios = await q(sb.from('reportes').select('*, unidades(codigo)').eq('conjunto_id', C()).eq('autor', S.user.id).order('created_at', { ascending: false }).limit(30));
  const cat = S.sub.cat || 'Daño';
  return `<div class="stack"><h2>Reportar una situación</h2>
  <form class="card form" data-form="reporte">
    <div><label>¿Qué tipo de situación es?</label><div class="qr" style="flex-wrap:wrap">${CAT_REP.map(c => `<button type="button" class="btn sm ${cat === c ? '' : 'ghost'}" data-act="sub" data-k="cat" data-v="${c}" data-keep="1">${c}</button>`).join('')}</div><input type="hidden" name="categoria" value="${esc(cat)}"></div>
    <div><label for="rp-t">Qué pasa</label><input id="rp-t" name="titulo" required maxlength="140" placeholder="${cat === 'Seguridad' ? 'Ej. persona desconocida rondando el parqueadero' : cat === 'Aseo' ? 'Ej. basura acumulada junto al shut de la torre 2' : cat === 'Mascotas' ? 'Ej. perro sin correa en la zona infantil' : 'Ej. filtración en el techo del pasillo piso 7'}"></div>
    <div><label for="rp-u">Dónde</label><input id="rp-u" name="ubicacion" placeholder="Torre, piso, zona"></div>
    <div><label for="rp-d">Detalle (opcional)</label><textarea id="rp-d" name="descripcion" rows="3"></textarea></div>
    <div><label for="rp-f">Fotos (hasta 4)</label><input id="rp-f" name="fotos" type="file" accept="image/*" multiple></div>
    <label class="check"><input type="checkbox" name="urgente"> Es urgente (riesgo para personas o daño que empeora rápido)</label>
    <p class="sub" style="margin:0">La administración recibe el aviso al instante. Los reportes de seguridad y los urgentes también le llegan a portería.</p>
    <button class="btn" type="submit">Enviar reporte</button></form>
  ${mios.length ? `<h3>Mis reportes</h3>${mios.map(r => tarjetaReporte(r, false)).join('')}` : ''}</div>`;
};
V.misreportes = V.reportar;

/* ---------- residente: visitas y paquetes ---------- */
V.misvisitas = async () => {
  const vis = await q(sb.from('visitas').select('*').eq('unidad_id', U()).order('created_at', { ascending: false }).limit(40));
  const esp = vis.filter(v => v.estado === 'Esperando');
  return `<div class="stack"><h2>Mis visitas</h2>
  ${esp.map(v => `<div class="card stack alertcard" style="gap:8px"><div class="eyebrow">Te buscan en portería</div><h2>${esc(v.nombre)}</h2><div class="sub">${esc(v.tipo)}${v.placa ? ' · placa ' + esc(v.placa) : ''}${v.nota ? ' · ' + esc(v.nota) : ''} · ${hora(v.created_at)}</div>
    <div class="two"><button class="btn danger" data-act="responderVisita" data-id="${v.id}" data-v="false">No autorizo</button><button class="btn" data-act="responderVisita" data-id="${v.id}" data-v="true">Autorizo el ingreso</button></div></div>`).join('')}
  <details class="card" ${vis.length ? '' : 'open'}><summary><b>+ Avisar a portería que espero a alguien</b></summary><form class="form mt" data-form="preautorizar">
    <div class="two"><div><label for="pa-n">Nombre</label><input id="pa-n" name="nombre" required></div><div><label for="pa-t">Tipo</label><select id="pa-t" name="tipo"><option>Visita</option><option>Domicilio</option><option>Servicio</option><option>Proveedor</option></select></div></div>
    <div class="two"><div><label for="pa-f">Fecha</label><input id="pa-f" name="fecha" type="date" value="${HOY()}" min="${HOY()}" required></div><div><label for="pa-p">Placa (opcional)</label><input id="pa-p" name="placa" style="text-transform:uppercase"></div></div>
    <div><label for="pa-no">Nota para portería</label><input id="pa-no" name="nota" placeholder="Ej. viene a arreglar la lavadora"></div>
    <button class="btn" type="submit">Preautorizar</button></form></details>
  <div class="card"><h2>Historial</h2><div class="list" style="margin-top:6px">${vis.filter(v => v.estado !== 'Esperando').map(v => `<div class="item"><div class="grow"><div class="row"><h3>${esc(v.nombre)}</h3><span class="chip ${chipVisita[v.estado]}">${v.estado}</span></div><div class="sub">${esc(v.tipo)}${v.fecha_esperada ? ' · ' + fecha(v.fecha_esperada) : ' · ' + fechaHora(v.created_at)}${v.entrada_at ? ' · entró ' + hora(v.entrada_at) : ''}</div>
    ${v.estado === 'Preautorizada' ? `<div class="row" style="justify-content:flex-end;margin-top:6px"><button class="btn sm ghost" data-act="cancelarVisita" data-id="${v.id}" data-confirm="¿Cancelar?">Cancelar</button></div>` : ''}</div></div>`).join('') || '<div class="sub" style="padding-top:6px">Sin visitas registradas.</div>'}</div></div></div>`;
};
V.mispaquetes = async () => {
  const paq = await q(sb.from('paquetes').select('*').eq('unidad_id', U()).order('recibido_at', { ascending: false }).limit(30));
  return `<div class="stack"><h2>Mis paquetes</h2>${paq.map(p => `<div class="card"><div class="row"><h3>${esc(p.descripcion)}</h3><span class="chip ${p.estado === 'Entregado' ? 'ok' : 'warn'}">${p.estado === 'En portería' ? 'Recógelo en portería' : 'Entregado'}</span></div>
    <div class="sub">${esc(p.empresa || '')}${p.empresa ? ' · ' : ''}llegó ${fechaHora(p.recibido_at)}${p.entregado_at ? ' · entregado ' + fechaHora(p.entregado_at) + (p.entregado_a ? ' a ' + esc(p.entregado_a) : '') : ''}</div>${fotosHTML(p.foto ? [p.foto] : [])}</div>`).join('') || '<div class="card sub">No tienes paquetes registrados.</div>'}</div>`;
};

/* ---------- administración: bitácora de portería ---------- */
V.bitacora = async () => {
  const [min, vis, paq] = await Promise.all([
    q(sb.from('minuta').select('*').eq('conjunto_id', C()).order('created_at', { ascending: false }).limit(30)),
    q(sb.from('visitas').select('*, unidades(codigo)').eq('conjunto_id', C()).order('created_at', { ascending: false }).limit(30)),
    q(sb.from('paquetes').select('*, unidades(codigo)').eq('conjunto_id', C()).eq('estado', 'En portería'))
  ]);
  const t = S.sub.t || 'minuta';
  return `<div class="stack"><h2>Portería</h2>
  <div class="seg" role="group" aria-label="Sección">${[['minuta', 'Minuta'], ['visitas', 'Visitas'], ['paquetes', `Paquetes (${paq.length})`]].map(([k, l]) => `<button data-act="sub" data-k="t" data-v="${k}" aria-pressed="${t === k}">${l}</button>`).join('')}</div>
  <div class="card"><div class="list">${t === 'minuta' ? (min.map(filaMinuta).join('') || '<div class="sub">Sin anotaciones.</div>') : t === 'visitas' ? (vis.map(filaVisita).join('') || '<div class="sub">Sin visitas.</div>') : (paq.map(p => `<div class="item"><div class="grow"><h3>${esc((p.unidades || {}).codigo)} · ${esc(p.descripcion)}</h3><div class="sub">${esc(p.empresa || '')} · ${fechaHora(p.recibido_at)}</div></div></div>`).join('') || '<div class="sub">No hay paquetes en portería.</div>')}</div></div>
  ${W() ? '<div class="card sub">Para darle acceso al vigilante: Ajustes del conjunto → Equipo de gestión → rol Portería. Cada turno puede usar su propio correo o uno compartido de la portería.</div>' : ''}</div>`;
};

/* ---------- ganchos en vistas existentes ---------- */
const _rinicio = V.rinicio;
V.rinicio = async () => {
  const [esp, paq] = await Promise.all([
    q(sb.from('visitas').select('id, nombre, tipo').eq('unidad_id', U()).eq('estado', 'Esperando')),
    q(sb.from('paquetes').select('id').eq('unidad_id', U()).eq('estado', 'En portería'))
  ]);
  return esp.map(v => `<div class="card stack alertcard" style="gap:8px"><div class="eyebrow">Te buscan en portería</div><h2>${esc(v.nombre)} <span class="sub">(${esc(v.tipo)})</span></h2>
    <div class="two"><button class="btn danger" data-act="responderVisita" data-id="${v.id}" data-v="false">No autorizo</button><button class="btn" data-act="responderVisita" data-id="${v.id}" data-v="true">Autorizo</button></div></div>`).join('')
    + (paq.length ? `<div class="alert"><b>Tienes ${paq.length} paquete${paq.length > 1 ? 's' : ''} en portería.</b> <button class="btn sm" data-act="tab" data-v="mispaquetes" style="margin-top:6px">Ver</button></div>` : '')
    + await _rinicio();
};
const _rmas = V.rmas;
V.rmas = async () => {
  const html = await _rmas();
  const extra = [['misvisitas', 'Mis visitas', 'Preautoriza a quien esperas y responde cuando te buscan', 'visitas'], ['mispaquetes', 'Mis paquetes', 'Lo que llegó a portería para ti', 'paquetes'], ['reportar', 'Reportar una situación', 'Daños, seguridad, aseo, ruido o mascotas, con fotos', 'reportes'], ['notificaciones', 'Avisos', 'Todo lo que te ha llegado', 'campana']]
    .map(([k, t, s, i]) => `<button class="card navcard" data-act="tab" data-v="${k}"><div class="ico">${svg(i)}</div><div class="grow"><h3>${t}</h3><div class="sub">${s}</div></div><span class="sub">›</span></button>`).join('');
  return html.replace('<h2>Más</h2>', '<h2>Más</h2>' + extra);
};
const _mas = V.mas;
V.mas = async () => {
  const html = await _mas();
  const extra = [['reportes', 'Reportes de residentes', 'Situaciones reportadas con fotos', 'reportes'], ['bitacora', 'Portería', 'Minuta, visitas y paquetes', 'porteria'], ['notificaciones', 'Avisos', 'Todo lo que te ha llegado', 'campana']]
    .map(([k, t, s, i]) => `<button class="card navcard" data-act="tab" data-v="${k}"><div class="ico">${svg(i)}</div><div class="grow"><h3>${t}</h3><div class="sub">${s}</div></div><span class="sub">›</span></button>`).join('');
  return html.replace('<h2>Más</h2>', '<h2>Más</h2>' + extra);
};

/* ---------- acciones ---------- */
Object.assign(ACT, {
  permisoAvisos: async () => { try { const r = await Notification.requestPermission(); toast(r === 'granted' ? 'Avisos activados en este dispositivo' : 'No se activaron los avisos'); } catch (e) { toast('Este navegador no permite avisos'); } render(); },
  visitaEstado: async d => {
    const cambios = { estado: d.v };
    if (d.v === 'Ingresó') cambios.entrada_at = new Date().toISOString();
    if (d.v === 'Salió') cambios.salida_at = new Date().toISOString();
    await q(sb.from('visitas').update(cambios).eq('id', d.id));
    toast(d.v === 'Ingresó' ? 'Ingreso registrado' : d.v === 'Salió' ? 'Salida registrada' : 'Visita ' + d.v.toLowerCase()); render();
  },
  responderVisita: async d => { await q(sb.rpc('responder_visita', { p_id: d.id, p_autoriza: d.v === 'true' })); toast(d.v === 'true' ? 'Le avisamos a portería que puede ingresar' : 'Le avisamos a portería que no autorizas'); render(); },
  cancelarVisita: async d => { await q(sb.from('visitas').delete().eq('id', d.id)); toast('Preautorización cancelada'); render(); },
  reporteEstado: async d => { await q(sb.from('reportes').update({ estado: d.v }).eq('id', d.id)); toast('Reporte en revisión. El residente recibe el aviso.'); render(); },
  reporteOT: async d => {
    const r = await q(sb.from('reportes').select('*, unidades(codigo)').eq('id', d.id).single());
    const ot = await q(sb.from('ordenes').insert({ conjunto_id: C(), titulo: r.titulo, ubicacion: r.ubicacion || (r.unidades || {}).codigo || '', prioridad: r.urgente ? 'Alta' : 'Media', origen: 'Reporte #' + r.numero, foto: (r.fotos || [])[0] || null }).select('id, numero').single());
    await q(sb.from('reportes').update({ orden_id: ot.id, estado: r.estado === 'Nuevo' ? 'En revisión' : r.estado }).eq('id', d.id));
    toast('Orden de trabajo OT-' + String(ot.numero).padStart(4, '0') + ' creada'); render();
  }
});

/* ---------- formularios ---------- */
Object.assign(FORM, {
  visita: async f => {
    const directo = !!f.directo;
    await q(sb.from('visitas').insert({ conjunto_id: C(), unidad_id: f.unidad, nombre: f.nombre.trim(), tipo: f.tipo, placa: f.placa ? f.placa.toUpperCase() : null, nota: f.nota || null, estado: directo ? 'Ingresó' : 'Esperando', entrada_at: directo ? new Date().toISOString() : null }));
    toast(directo ? 'Ingreso registrado' : 'Le avisamos al residente. Espera su respuesta aquí.', 4000); render();
  },
  paquete: async (f, form) => {
    const foto = await subir(form.foto.files[0], 'paquetes');
    await q(sb.from('paquetes').insert({ conjunto_id: C(), unidad_id: f.unidad, descripcion: f.descripcion, empresa: f.empresa || null, foto }));
    toast('Paquete registrado. El residente ya recibió el aviso.'); render();
  },
  entregar: async (f, form) => {
    await q(sb.from('paquetes').update({ estado: 'Entregado', entregado_at: new Date().toISOString(), entregado_a: f.quien }).eq('id', form.dataset.id));
    toast('Entrega registrada'); S.sub = {}; render();
  },
  minuta: async (f, form) => {
    const foto = await subir(form.foto.files[0], 'minuta');
    await q(sb.from('minuta').insert({ conjunto_id: C(), tipo: f.tipo, descripcion: f.descripcion, urgente: !!f.urgente, foto }));
    toast(f.urgente || f.tipo === 'Incidente' ? 'Anotado y avisado a la administración' : 'Anotado en la minuta'); render();
  },
  reporte: async (f, form) => {
    if (form.fotos.files.length > 4) toast('Solo se suben las primeras 4 fotos');
    const fotos = await subirVarias(form.fotos.files, 'reportes', 4);
    const r = await q(sb.from('reportes').insert({ conjunto_id: C(), unidad_id: R() ? U() : null, origen: R() ? 'Residente' : P() ? 'Portería' : 'Administración', categoria: f.categoria, titulo: f.titulo, ubicacion: f.ubicacion || null, descripcion: f.descripcion || null, urgente: !!f.urgente, fotos }).select('numero').single());
    toast('Reporte #' + r.numero + ' enviado. Te avisamos cuando lo atiendan.', 4000); S.sub = {}; render();
  },
  resolverReporte: async (f, form) => {
    await q(sb.from('reportes').update({ estado: 'Resuelto', respuesta: f.respuesta, resuelto_at: new Date().toISOString() }).eq('id', form.dataset.id));
    toast('Respuesta enviada al residente'); S.sub = { f: S.sub.f }; render();
  },
  preautorizar: async f => {
    await q(sb.from('visitas').insert({ conjunto_id: C(), unidad_id: U(), nombre: f.nombre.trim(), tipo: f.tipo, fecha_esperada: f.fecha, placa: f.placa ? f.placa.toUpperCase() : null, nota: f.nota || null, estado: 'Preautorizada' }));
    toast('Listo, portería ya sabe que lo esperas'); render();
  },
  mensaje: async (f, form) => {
    const t = (f.texto || '').trim();
    const archivo = form.foto && form.foto.files[0];
    if (!t && !archivo) return;
    const foto = archivo ? await subir(archivo, 'chat') : null;
    form.texto.value = ''; if (form.foto) form.foto.value = '';
    await q(sb.from('mensajes').insert({ conjunto_id: C(), unidad_id: form.dataset.u, texto: t || 'Foto', de_admin: !R(), foto }));
    render();
  }
});

Object.assign(CHG, { fotoChat: el => { const l = document.querySelector('label[for="ch-foto"]'); if (l) l.classList.toggle('lista', !!el.files.length); if (el.files.length) toast('Foto lista. Escribe un mensaje si quieres y toca Enviar.'); } });
