/* =====================================================================
   SYAPH360 · Módulos adicionales
   - Plataforma: dueño, solicitudes de administradores, pagos y suscripción
   - Inventario de activos con hoja de vida y código QR
   - Documentos del conjunto con vencimientos
   Depende de app.js (S, V, ACT, FORM, AFTER, q, sb, utilidades).
   ===================================================================== */

Object.assign(ICONS, {
  inventario: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2M3 12h18M10 12v2h4v-2"/>',
  documentos: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>',
  plataforma: '<rect x="3" y="4" width="18" height="6" rx="1.5"/><rect x="3" y="14" width="18" height="6" rx="1.5"/><path d="M7 7h.01M7 17h.01"/>'
});
SIN_NAV.push('plataforma', 'solicitud');

/* ---------- estado de la plataforma ---------- */
S.plat = { dueno: false, cuenta: null, config: {} };
async function cargarPlataforma() {
  try {
    const r = await q(sb.rpc('mi_cuenta'));
    S.plat = { dueno: !!(r && r.dueno), cuenta: r && r.cuenta, config: (r && r.config) || {} };
  } catch (e) { S.plat = { dueno: false, cuenta: null, config: {} }; }
}
const cuentaOk = () => { const k = S.plat.cuenta; return !!(k && k.estado === 'activa' && k.vigente); };
const puedeCrear = () => S.plat.dueno || (cuentaOk() && S.plat.cuenta.conjuntos_usados < S.plat.cuenta.max_conjuntos);
const estadoCuenta = k => {
  if (!k) return ['Sin solicitud', 'info'];
  if (k.estado === 'pendiente') return ['Pendiente de pago', 'warn'];
  if (k.estado === 'suspendida') return ['Suspendida', 'bad'];
  if (!k.vigente) return ['Vencida', 'bad'];
  if (k.vigente_hasta && dias(k.vigente_hasta) < 0) return ['En días de gracia', 'warn'];
  if (k.vigente_hasta && dias(k.vigente_hasta) <= 7) return ['Vence pronto', 'warn'];
  return ['Activa', 'ok'];
};

/* ---------- ganchos sobre app.js ---------- */
const _cargarAccesos = cargarAccesos;
cargarAccesos = async function () { await _cargarAccesos(); await cargarPlataforma(); };

const _setCtx = setCtx;
setCtx = function (ctx) {
  _setCtx(ctx);
  if (ctx && ctx.rol !== 'residente') {
    sb.rpc('conjunto_vigente', { c: ctx.conjunto_id }).then(r => {
      if (S.ctx === ctx && r.data === false) { ctx.vigente = false; render(); }
    });
  }
};

const _header = header;
header = function () {
  _header();
  if (S.view === 'plataforma') { $('htitle').textContent = 'Panel de la plataforma'; $('hsub').textContent = 'Clientes, pagos y suscripciones'; }
  if (S.view === 'solicitud') { $('htitle').textContent = 'Acceso de administrador'; $('hsub').textContent = S.user ? S.user.email : ''; }
};

const bannerSuscripcion = () => {
  if (S.plat.dueno || !S.plat.cuenta) return '';
  const k = S.plat.cuenta, [txt, cl] = estadoCuenta(k);
  if (cl === 'ok') return '';
  const msg = k.estado === 'pendiente' ? 'Tu solicitud está pendiente de pago.'
    : k.estado === 'suspendida' ? 'Tu suscripción está suspendida. Tus conjuntos están en solo lectura.'
    : !k.vigente ? 'Tu suscripción venció. Tus conjuntos están en solo lectura hasta que se registre el pago.'
    : `Tu suscripción vence el ${fecha(k.vigente_hasta)}.`;
  return `<div class="alert ${cl === 'bad' ? 'alert-bad' : ''}"><b>${txt}.</b> ${msg} <button class="btn sm" data-act="ir" data-v="solicitud" style="margin-top:8px">Ver datos de pago</button></div>`;
};

const _portafolio = V.portafolio;
V.portafolio = async () => bannerSuscripcion() + await _portafolio();

const _inicio = V.inicio;
V.inicio = async () => (S.ctx && S.ctx.vigente === false
  ? `<div class="alert alert-bad"><b>Solo lectura.</b> La suscripción de este conjunto no está activa. Puedes consultar todo, pero no hacer cambios hasta que se renueve.</div>` : '') + await _inicio();

const _nuevo = V.nuevo;
V.nuevo = async () => puedeCrear() ? _nuevo() : V.solicitud();

const _contextos = V.contextos;
V.contextos = async () => (S.plat.dueno ? `<button class="btn" data-act="ir" data-v="plataforma" style="width:100%;margin-bottom:12px">${svg('plataforma').replace('<svg', '<svg width="18" height="18" style="vertical-align:-4px"')} Panel de la plataforma</button>` : '') + await _contextos();

/* ---------- solicitud de acceso (administrador nuevo) ---------- */
V.solicitud = async () => {
  await cargarPlataforma();
  const k = S.plat.cuenta, cfg = S.plat.config || {};
  const pago = `<div class="card stack" style="gap:8px"><h3>Cómo pagar</h3>
    <p style="margin:0">${cfg.instrucciones_pago ? nl(cfg.instrucciones_pago) : 'Te enviaremos los datos de pago por WhatsApp o correo.'}</p>
    ${cfg.contacto ? `<p class="sub" style="margin:0">Envía el comprobante a: <b style="user-select:all">${esc(cfg.contacto)}</b></p>` : ''}</div>`;
  const planes = cfg.planes ? `<div class="card"><h3>Planes</h3><p style="margin:6px 0 0">${nl(cfg.planes)}</p></div>` : '';
  if (!k) return `<div class="stack">
    <div class="card"><h2>Solicita tu acceso como administrador</h2><p class="sub" style="margin:6px 0 0">Cuando confirmemos tu pago, te habilitamos para crear y gestionar tus conjuntos.</p></div>
    ${planes}
    <form class="card form" data-form="solicitar">
      <div><label for="sa-n">Nombre completo</label><input id="sa-n" name="nombre" required value="${esc((S.user.user_metadata || {}).nombre || '')}"></div>
      <div><label for="sa-e">Empresa o nombre comercial</label><input id="sa-e" name="empresa"></div>
      <div class="two"><div><label for="sa-t">Celular</label><input id="sa-t" name="telefono" type="tel" required></div><div><label for="sa-c">Ciudad</label><input id="sa-c" name="ciudad"></div></div>
      <div><label for="sa-k">¿Cuántos conjuntos administras?</label><input id="sa-k" name="conjuntos" type="number" min="1" value="1"></div>
      <button class="btn" type="submit">Enviar solicitud</button></form>
    <button class="linkbtn" data-act="volver">Volver</button></div>`;
  const [txt, cl] = estadoCuenta(k);
  const detalle = k.estado === 'pendiente' ? 'Recibimos tu solicitud. Realiza el pago y envía el comprobante; apenas lo confirmemos se activa tu cuenta.'
    : k.estado === 'suspendida' ? 'Tu cuenta está suspendida. Comunícate con nosotros para reactivarla.'
    : !k.vigente ? 'Tu suscripción venció. Renueva el pago para volver a hacer cambios en tus conjuntos.'
    : k.conjuntos_usados >= k.max_conjuntos ? `Ya usas los ${k.max_conjuntos} conjunto(s) de tu plan. Escríbenos para ampliarlo.`
    : `Tu suscripción está al día${k.vigente_hasta ? ' hasta el ' + fecha(k.vigente_hasta) : ''}.`;
  return `<div class="stack">
    <div class="card stack" style="gap:8px"><div class="row"><h2>Tu suscripción</h2><span class="chip ${cl}">${txt}</span></div>
      <p style="margin:0">${detalle}</p>
      <div class="mini" style="grid-template-columns:repeat(3,1fr)"><span><b>${k.conjuntos_usados}/${k.max_conjuntos}</b>conjuntos</span><span><b>${k.max_unidades || '∞'}</b>unidades del plan</span><span><b>${k.vigente_hasta ? fecha(k.vigente_hasta) : '—'}</b>vigente hasta</span></div></div>
    ${cl !== 'ok' || k.conjuntos_usados >= k.max_conjuntos ? pago + planes : ''}
    <button class="btn ghost" data-act="revisarCuenta">Ya pagué, revisar de nuevo</button>
    ${cuentaOk() && k.conjuntos_usados < k.max_conjuntos ? '<button class="btn" data-act="ir" data-v="nuevo">Crear un conjunto</button>' : ''}
    <button class="linkbtn" data-act="volver">Volver</button></div>`;
};

/* ---------- panel del dueño de la plataforma ---------- */
V.plataforma = async () => {
  if (!S.plat.dueno) return '<div class="card">Esta sección es solo para el dueño de la plataforma.</div>';
  const [rows, pagos, cfgRow] = await Promise.all([
    q(sb.rpc('resumen_plataforma')),
    q(sb.from('pagos_plataforma').select('*, cuentas(email, nombre, empresa)').order('fecha', { ascending: false }).limit(30)),
    q(sb.from('plataforma_config').select('*').eq('id', 1).maybeSingle())
  ]);
  const cfg = cfgRow || {};
  const pend = rows.filter(r => r.estado === 'pendiente');
  const act = rows.filter(r => r.estado === 'activa' && r.vigente);
  const porVencer = act.filter(r => r.vigente_hasta && dias(r.vigente_hasta) <= 7);
  const mes = mesActual();
  const ingresoMes = pagos.filter(p => p.fecha >= mes).reduce((a, p) => a + Number(p.valor), 0);
  const f = S.sub.f || (pend.length ? 'pendiente' : 'activa');
  const filtro = r => f === 'todas' ? true : f === 'pendiente' ? r.estado === 'pendiente' : f === 'activa' ? r.estado === 'activa' && r.vigente : (r.estado === 'suspendida' || (r.estado === 'activa' && !r.vigente));
  const lista = rows.filter(filtro);
  const tarjeta = r => { const [txt, cl] = estadoCuenta(r); return `<div class="card stack" style="gap:8px">
    <div class="row"><div class="grow"><h3>${esc(r.nombre || r.email)}${r.empresa ? ' · ' + esc(r.empresa) : ''}</h3><div class="sub">${esc(r.email)}${r.telefono ? ' · <span style="user-select:all">' + esc(r.telefono) + '</span>' : ''}${r.ciudad ? ' · ' + esc(r.ciudad) : ''}</div></div><span class="chip ${cl}">${txt}</span></div>
    <div class="mini"><span><b>${r.conjuntos}/${r.max_conjuntos}</b>conjuntos</span><span><b>${r.unidades}${r.max_unidades ? '/' + r.max_unidades : ''}</b>unidades</span><span><b>${r.vigente_hasta ? fecha(r.vigente_hasta) : '—'}</b>vigente hasta</span><span><b>${fmt(r.total_pagado)}</b>pagado</span></div>
    <div class="sub">${r.estado === 'pendiente' ? `Solicitó el ${fecha(r.created_at)}${r.conjuntos_estimados ? ' · dice administrar ' + r.conjuntos_estimados + ' conjunto(s)' : ''}` : `Último ingreso: ${r.ultimo_ingreso ? fechaHora(r.ultimo_ingreso) : 'nunca'}${r.ultimo_pago ? ' · último pago ' + fecha(r.ultimo_pago) : ''}`}${r.notas ? ' · ' + esc(r.notas) : ''}</div>
    ${S.sub.pago === r.id ? `<form class="form" data-form="pagoPlataforma" data-id="${r.id}" style="border-top:1px solid var(--line);padding-top:10px">
        <div class="two"><div><label for="pp-v">Valor recibido</label><input id="pp-v" name="valor" type="number" min="1" step="1" required></div>
        <div><label for="pp-m">Meses que paga</label><select id="pp-m" name="meses"><option value="1">1 mes</option><option value="3">3 meses</option><option value="6">6 meses</option><option value="12">12 meses</option></select></div></div>
        <div class="two"><div><label for="pp-f">Fecha del pago</label><input id="pp-f" name="fecha" type="date" value="${HOY()}" required></div>
        <div><label for="pp-md">Medio</label><select id="pp-md" name="medio"><option>Transferencia</option><option>Nequi</option><option>Daviplata</option><option>Consignación</option><option>Efectivo</option></select></div></div>
        <div><label for="pp-r">Referencia del comprobante</label><input id="pp-r" name="referencia"></div>
        <p class="sub" style="margin:0">Al guardar, la cuenta queda activa y la vigencia se extiende desde hoy o desde su fecha de vencimiento, la que sea mayor.</p>
        <div class="row" style="justify-content:flex-end;gap:8px"><button type="button" class="btn sm ghost" data-act="sub" data-k="pago" data-v="" data-keep="1">Cancelar</button><button class="btn sm" type="submit">Registrar pago y activar</button></div></form>`
      : S.sub.plan === r.id ? `<form class="form" data-form="planCuenta" data-id="${r.id}" style="border-top:1px solid var(--line);padding-top:10px">
        <div class="two"><div><label for="pl-mc">Máximo de conjuntos</label><input id="pl-mc" name="max_conjuntos" type="number" min="1" value="${r.max_conjuntos}" required></div>
        <div><label for="pl-mu">Máximo de unidades (vacío = sin límite)</label><input id="pl-mu" name="max_unidades" type="number" min="1" value="${r.max_unidades || ''}"></div></div>
        <div><label for="pl-vh">Vigente hasta (ajuste manual)</label><input id="pl-vh" name="vigente_hasta" type="date" value="${r.vigente_hasta || ''}"></div>
        <div><label for="pl-no">Notas internas</label><input id="pl-no" name="notas" value="${esc(r.notas)}"></div>
        <div class="row" style="justify-content:flex-end;gap:8px"><button type="button" class="btn sm ghost" data-act="sub" data-k="plan" data-v="" data-keep="1">Cancelar</button><button class="btn sm" type="submit">Guardar plan</button></div></form>`
      : `<div class="row" style="justify-content:flex-end;gap:8px;flex-wrap:wrap">
        ${r.estado === 'suspendida' ? `<button class="btn sm ghost" data-act="estadoCuenta" data-id="${r.id}" data-v="activa">Reactivar</button>` : r.estado === 'activa' ? `<button class="btn sm ghost danger-t" data-act="estadoCuenta" data-id="${r.id}" data-v="suspendida" data-confirm="¿Suspender?">Suspender</button>` : ''}
        ${r.estado === 'pendiente' ? `<button class="btn sm ghost" data-act="pilotoGratis" data-id="${r.id}" data-confirm="¿Activar 30 días gratis?">Piloto gratis 30 días</button>` : ''}
        <button class="btn sm ghost" data-act="sub" data-k="plan" data-v="${r.id}" data-keep="1">Plan</button>
        <button class="btn sm" data-act="sub" data-k="pago" data-v="${r.id}" data-keep="1">${r.estado === 'pendiente' ? 'Registrar pago y autorizar' : 'Registrar pago'}</button></div>`}
  </div>`; };
  return `<div class="stack">
  <div class="kpis">
    <div class="kpi"><div class="v">${act.length}</div><div class="l">Clientes activos</div></div>
    <div class="kpi"><div class="v">${pend.length}</div><div class="l">Solicitudes pendientes de pago</div></div>
    <div class="kpi"><div class="v">${porVencer.length}</div><div class="l">Vencen en los próximos 7 días</div></div>
    <div class="kpi"><div class="v">${millones(ingresoMes)}</div><div class="l">Recibido este mes</div></div>
  </div>
  <div class="seg" role="group" aria-label="Filtro de clientes">${[['pendiente', `Pendientes (${pend.length})`], ['activa', 'Activos'], ['inactiva', 'Vencidos y suspendidos'], ['todas', 'Todos']].map(([k, l]) => `<button data-act="sub" data-k="f" data-v="${k}" aria-pressed="${f === k}">${l}</button>`).join('')}</div>
  ${lista.map(tarjeta).join('') || '<div class="card sub">No hay clientes en este filtro.</div>'}
  <details class="card"><summary><b>+ Registrar un cliente manualmente</b></summary>
    <form class="form mt" data-form="nuevaCuenta"><div class="two"><div><label for="nk-e">Correo</label><input id="nk-e" name="email" type="email" required></div><div><label for="nk-n">Nombre</label><input id="nk-n" name="nombre" required></div></div>
    <div class="two"><div><label for="nk-em">Empresa</label><input id="nk-em" name="empresa"></div><div><label for="nk-t">Celular</label><input id="nk-t" name="telefono"></div></div>
    <p class="sub" style="margin:0">Queda pendiente de pago. Cuando registres su pago, podrá crear conjuntos entrando con ese correo.</p>
    <button class="btn" type="submit">Registrar cliente</button></form></details>
  <details class="card"><summary><b>Datos de pago y planes</b> <span class="sub">(lo ven los administradores al solicitar acceso)</span></summary>
    <form class="form mt" data-form="configPlataforma">
      <div><label for="cf-i">Instrucciones de pago</label><textarea id="cf-i" name="instrucciones_pago" rows="4" placeholder="Bancolombia ahorros 000-000000-00 a nombre de…&#10;Nequi 300 000 0000">${esc(cfg.instrucciones_pago)}</textarea></div>
      <div><label for="cf-c">Contacto para enviar el comprobante</label><input id="cf-c" name="contacto" value="${esc(cfg.contacto)}" placeholder="WhatsApp 300 000 0000"></div>
      <div><label for="cf-p">Planes y precios</label><textarea id="cf-p" name="planes" rows="4" placeholder="Básico: 1 conjunto hasta 100 unidades…">${esc(cfg.planes)}</textarea></div>
      <button class="btn" type="submit">Guardar</button></form></details>
  <div class="card"><h2>Pagos recibidos</h2><div class="list" style="margin-top:6px">
    ${pagos.map(p => `<div class="item"><div class="grow"><h3>${esc((p.cuentas || {}).nombre || (p.cuentas || {}).email)}</h3><div class="sub">${fecha(p.fecha)} · ${esc(p.medio || '')} · ${p.meses} mes${p.meses > 1 ? 'es' : ''}${p.referencia ? ' · ref. ' + esc(p.referencia) : ''}</div></div><span class="mono">${fmt(p.valor)}</span></div>`).join('') || '<div class="sub" style="padding-top:6px">Aún no hay pagos registrados.</div>'}
  </div></div></div>`;
};

/* ---------- inventario ---------- */
const CATS = ['Equipo', 'Mobiliario', 'Herramienta', 'Tecnología', 'Otro'];
const ESTADOS_ACT = ['Bueno', 'Regular', 'Malo', 'Fuera de servicio'];
const chipAct = { 'Bueno': 'ok', 'Regular': 'warn', 'Malo': 'bad', 'Fuera de servicio': 'bad' };
const urlQR = id => location.origin + location.pathname + '#activo-' + id;

V.inventario = async () => {
  const acts = await q(sb.from('activos').select('*').eq('conjunto_id', C()).order('codigo'));
  const cat = S.sub.cat || 'Todos', bus = (S.sub.q || '').toLowerCase();
  const lista = acts.filter(a => (cat === 'Todos' || a.categoria === cat) && (!bus || [a.codigo, a.nombre, a.ubicacion, a.marca, a.serial].join(' ').toLowerCase().includes(bus)));
  const malos = acts.filter(a => ['Malo', 'Fuera de servicio'].includes(a.estado)).length;
  const garantias = acts.filter(a => a.garantia_hasta && dias(a.garantia_hasta) >= 0 && dias(a.garantia_hasta) <= 30).length;
  const valor = acts.reduce((s, a) => s + Number(a.valor || 0), 0);
  return `<div class="stack"><div class="row"><h2>Inventario</h2>${acts.length ? '<button class="btn sm ghost" data-act="ir" data-v="qrs">Imprimir códigos QR</button>' : ''}</div>
  <div class="kpis">
    <div class="kpi"><div class="v">${acts.length}</div><div class="l">Activos registrados</div></div>
    <div class="kpi"><div class="v">${millones(valor)}</div><div class="l">Valor registrado</div></div>
    <div class="kpi"><div class="v">${malos}</div><div class="l">En mal estado o fuera de servicio</div></div>
    <div class="kpi"><div class="v">${garantias}</div><div class="l">Garantías que vencen en 30 días</div></div>
  </div>
  ${W() ? `<details class="card" ${acts.length ? '' : 'open'}><summary><b>+ Agregar activo</b></summary>${formActivo({}, 'activo')}</details>
  <details class="card"><summary><b>Cargar desde Excel</b></summary><form class="form mt" data-form="importarActivos">
    <div><label for="ia-t">Pega una fila por activo: código; nombre; categoría; ubicación; marca; modelo; serial; estado</label>
    <textarea id="ia-t" name="texto" rows="6" placeholder="ASC-T1;Ascensor torre 1;Equipo;Torre 1;Schindler;3300;SN12345;Bueno&#10;BOM-01;Bomba de agua 1;Equipo;Cuarto de bombas;Pedrollo;CP680;;Regular"></textarea></div>
    <p class="sub" style="margin:0">Si el código ya existe, se actualiza. Categorías: ${CATS.join(', ')}. Estados: ${ESTADOS_ACT.join(', ')}.</p>
    <button class="btn" type="submit">Cargar</button></form></details>` : ''}
  <div class="row"><input id="inv-q" type="search" placeholder="Buscar por código, nombre, marca, serial…" value="${esc(S.sub.q || '')}" data-chg="buscarActivo" aria-label="Buscar activo" style="flex:1;min-width:0"></div>
  <div class="qr">${['Todos', ...CATS].map(c => `<button class="btn sm ${cat === c ? '' : 'ghost'}" data-act="sub" data-k="cat" data-v="${c}" data-keep="1">${c}</button>`).join('')}</div>
  ${lista.map(a => `<button class="card navcard" data-act="sub2" data-view="activo" data-id="${a.id}"><div class="ico">${esc(a.codigo.slice(0, 3))}</div><div class="grow">
      <div class="row"><h3>${esc(a.nombre)}</h3><span class="chip ${chipAct[a.estado]}">${a.estado}</span></div>
      <div class="sub">${esc(a.codigo)}${a.ubicacion ? ' · ' + esc(a.ubicacion) : ''}${a.marca ? ' · ' + esc(a.marca) : ''}${a.garantia_hasta && dias(a.garantia_hasta) >= 0 && dias(a.garantia_hasta) <= 30 ? ' · <b style="color:var(--warn)">garantía vence ' + fecha(a.garantia_hasta) + '</b>' : ''}</div></div></button>`).join('') || `<div class="card sub">${acts.length ? 'Ningún activo coincide con el filtro.' : 'Aún no hay activos. Empieza con los equipos críticos: ascensores, bombas, planta eléctrica, puertas y extintores.'}</div>`}
  </div>`;
};

function formActivo(a, nombreForm) {
  const v = k => esc(a[k] == null ? '' : a[k]);
  return `<form class="form mt" data-form="${nombreForm}" ${a.id ? `data-id="${a.id}"` : ''}>
    <div class="two"><div><label>Código</label><input name="codigo" required value="${v('codigo')}" placeholder="ASC-T1"></div><div><label>Nombre</label><input name="nombre" required value="${v('nombre')}" placeholder="Ascensor torre 1"></div></div>
    <div class="two"><div><label>Categoría</label><select name="categoria">${CATS.map(c => `<option ${a.categoria === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div><div><label>Estado</label><select name="estado">${ESTADOS_ACT.map(c => `<option ${a.estado === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div></div>
    <div><label>Ubicación</label><input name="ubicacion" value="${v('ubicacion')}" placeholder="Torre 1, cuarto de máquinas"></div>
    <div class="two"><div><label>Marca</label><input name="marca" value="${v('marca')}"></div><div><label>Modelo</label><input name="modelo" value="${v('modelo')}"></div></div>
    <div class="two"><div><label>Serial</label><input name="serial" value="${v('serial')}"></div><div><label>Proveedor</label><input name="proveedor" value="${v('proveedor')}"></div></div>
    <div class="two"><div><label>Fecha de instalación</label><input name="fecha_instalacion" type="date" value="${v('fecha_instalacion')}"></div><div><label>Garantía hasta</label><input name="garantia_hasta" type="date" value="${v('garantia_hasta')}"></div></div>
    <div class="two"><div><label>Valor</label><input name="valor" type="number" min="0" step="1000" value="${v('valor')}"></div><div><label>Foto</label><input name="foto" type="file" accept="image/*"></div></div>
    <div><label>Notas</label><input name="notas" value="${v('notas')}"></div>
    <button class="btn" type="submit">${a.id ? 'Guardar cambios' : 'Agregar activo'}</button></form>`;
}

V.activo = async () => {
  const id = S.sub.id;
  const [a, plan, ords, docs] = await Promise.all([
    q(sb.from('activos').select('*').eq('id', id).maybeSingle()),
    q(sb.from('mant_plan').select('*').eq('activo_id', id).order('proximo')),
    q(sb.from('ordenes').select('*').eq('activo_id', id).order('created_at', { ascending: false })),
    q(sb.from('documentos').select('*').eq('activo_id', id).order('created_at', { ascending: false }))
  ]);
  if (!a) return '<div class="card">No encontramos este activo o no tienes acceso a él.</div>';
  const anual = plan.reduce((s, p) => s + Number(p.costo) * Math.max(1, Math.round(12 / p.frecuencia_meses)), 0);
  const dato = (l, v) => v ? `<div><div class="sub">${l}</div><div>${v}</div></div>` : '';
  return `<div class="stack">
  <button class="btn sm ghost" data-act="ir" data-v="inventario" style="align-self:flex-start">‹ Inventario</button>
  <div class="card stack" style="gap:10px">
    <div class="row"><div class="grow"><div class="eyebrow">${esc(a.categoria)} · ${esc(a.codigo)}</div><h2 style="margin-top:2px">${esc(a.nombre)}</h2><div class="sub">${esc(a.ubicacion || '')}</div></div><span class="chip ${chipAct[a.estado]}">${a.estado}</span></div>
    <div id="act-foto"></div>
    <div class="two">${dato('Marca', esc(a.marca))}${dato('Modelo', esc(a.modelo))}${dato('Serial', a.serial ? `<span class="mono">${esc(a.serial)}</span>` : '')}${dato('Proveedor', esc(a.proveedor))}${dato('Instalado', fecha(a.fecha_instalacion))}${dato('Garantía hasta', a.garantia_hasta ? fecha(a.garantia_hasta) + (dias(a.garantia_hasta) < 0 ? ' (vencida)' : '') : '')}${dato('Valor', a.valor ? fmt(a.valor) : '')}</div>
    ${a.notas ? `<div class="sub">${esc(a.notas)}</div>` : ''}
    ${W() ? `<div class="row" style="gap:8px;flex-wrap:wrap"><select id="act-estado" data-chg="estadoActivo" data-id="${a.id}" aria-label="Cambiar estado" style="flex:1;min-width:140px">${ESTADOS_ACT.map(c => `<option ${a.estado === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
      <button class="btn sm" data-act="otActivo" data-id="${a.id}">Reportar daño</button></div>` : ''}
  </div>
  <div class="card"><h2>Hoja de vida</h2>
    <div class="mini" style="grid-template-columns:repeat(3,1fr)"><span><b>${plan.length}</b>mantenimientos en plan</span><span><b>${ords.length}</b>órdenes de trabajo</span><span><b>${fmt(anual)}</b>costo anual del plan</span></div>
    <h3 class="mt">Mantenimiento preventivo</h3><div class="list">${plan.map(p => { const [e, cl, tx] = estadoPrev(p); return `<div class="item"><div class="grow"><h3>${esc(p.activo)}</h3><div class="sub">${FREQ[p.frecuencia_meses] || ''} · próximo ${fecha(p.proximo)} · ${tx}${p.ultimo ? ' · último ' + fecha(p.ultimo) : ''}</div></div><span class="chip ${cl}">${e}</span></div>`; }).join('') || '<div class="sub">Sin mantenimientos asociados. Al agregar uno al plan, escoge este equipo.</div>'}</div>
    <h3 class="mt">Daños y reparaciones</h3><div class="list">${ords.map(o => `<div class="item"><div class="grow"><h3>OT-${String(o.numero).padStart(4, '0')} · ${esc(o.titulo)}</h3><div class="sub">${fecha(o.created_at)}${o.responsable ? ' · ' + esc(o.responsable) : ''}${o.cerrada_at ? ' · cerrada ' + fecha(o.cerrada_at) : ''}</div></div><span class="chip ${chipEstado[o.estado]}">${o.estado}</span></div>`).join('') || '<div class="sub">Sin daños reportados.</div>'}</div>
  </div>
  <div class="card"><div class="row"><h2>Documentos</h2></div><div class="list" style="margin-top:6px">
    ${docs.map(d => filaDoc(d)).join('') || '<div class="sub">Sin documentos. Sube la factura, el manual, la garantía o el certificado.</div>'}</div>
    ${W() ? `<details class="mt"><summary><b>+ Subir documento de este equipo</b></summary>${formDoc(a.id)}</details>` : ''}</div>
  <div class="card stack" style="align-items:center;gap:8px"><h2>Código QR</h2><div id="act-qr" class="qrbox"></div>
    <div class="sub" style="text-align:center">Imprímelo y pégalo en el equipo. Al escanearlo, la administración abre esta ficha y el residente puede reportar un daño de este equipo.</div></div>
  ${W() ? `<details class="card"><summary><b>Editar datos</b></summary>${formActivo(a, 'editarActivo')}</details>
    <button class="btn sm ghost danger-t" data-act="borrarActivo" data-id="${a.id}" data-confirm="¿Borrar activo?" style="align-self:flex-start">Borrar activo</button>` : ''}
  </div>`;
};
AFTER.activo = async () => {
  const el = $('act-qr');
  if (el && window.QRCode) new QRCode(el, { text: urlQR(S.sub.id), width: 180, height: 180, correctLevel: QRCode.CorrectLevel.M });
  const a = await sb.from('activos').select('foto').eq('id', S.sub.id).maybeSingle();
  if (a.data && a.data.foto) {
    const { data } = await sb.storage.from('soportes').createSignedUrl(a.data.foto, 600);
    if (data && $('act-foto')) $('act-foto').innerHTML = `<img src="${data.signedUrl}" alt="Foto del activo" class="actfoto">`;
  }
};

V.qrs = async () => {
  const acts = await q(sb.from('activos').select('id, codigo, nombre, ubicacion').eq('conjunto_id', C()).order('codigo'));
  return `<div class="stack"><div class="row noprint"><button class="btn sm ghost" data-act="ir" data-v="inventario">‹ Inventario</button><button class="btn sm" data-act="imprimir">Imprimir</button></div>
  <div class="qrgrid">${acts.map(a => `<div class="qrcard"><div class="qrbox" data-qr="${a.id}"></div><b>${esc(a.codigo)}</b><span>${esc(a.nombre)}</span><small>${esc(S.ctx.nombre)}</small></div>`).join('')}</div></div>`;
};
AFTER.qrs = () => { if (!window.QRCode) return; document.querySelectorAll('[data-qr]').forEach(el => new QRCode(el, { text: urlQR(el.dataset.qr), width: 120, height: 120, correctLevel: QRCode.CorrectLevel.M })); };

/* ---------- documentos ---------- */
const TIPOS_DOC = ['Reglamento', 'Acta', 'Póliza', 'Certificado', 'Contrato', 'Manual', 'Factura', 'Otro'];
const filaDoc = d => { const n = d.vence ? dias(d.vence) : null; const cl = n === null ? '' : n < 0 ? 'bad' : n <= 30 ? 'warn' : 'ok';
  return `<div class="item"><div class="ico">${svg('documentos').replace('<svg', '<svg width="18" height="18"')}</div><div class="grow"><h3>${esc(d.titulo)}</h3><div class="sub">${esc(d.tipo)}${d.publico && !R() ? ' · visible para residentes' : ''}${d.vence ? ` · <span class="chip ${cl}">${n < 0 ? 'venció' : 'vence'} ${fecha(d.vence)}</span>` : ''}</div></div>
    <div class="row" style="gap:6px">${d.archivo ? `<button class="btn sm ghost" data-act="archivo" data-path="${esc(d.archivo)}">Ver</button>` : ''}${W() ? `<button class="btn sm ghost danger-t" data-act="borrar" data-tabla="documentos" data-id="${d.id}" data-confirm="¿Borrar?">Borrar</button>` : ''}</div></div>`; };
const formDoc = activoId => `<form class="form mt" data-form="documento" ${activoId ? `data-activo="${activoId}"` : ''}>
    <div><label>Título</label><input name="titulo" required placeholder="Póliza de áreas comunes 2026"></div>
    <div class="two"><div><label>Tipo</label><select name="tipo">${TIPOS_DOC.map(t => `<option>${t}</option>`).join('')}</select></div><div><label>Vence (opcional)</label><input name="vence" type="date"></div></div>
    <div><label>Archivo (PDF o foto)</label><input name="archivo" type="file" accept="application/pdf,image/*" required></div>
    <label class="check"><input type="checkbox" name="publico"> Visible para los residentes (reglamento, actas, manual de convivencia)</label>
    <button class="btn" type="submit">Subir documento</button></form>`;

V.documentos = async () => {
  const docs = await q(sb.from('documentos').select('*').eq('conjunto_id', C()).order('tipo').order('created_at', { ascending: false }));
  const venc = docs.filter(d => d.vence && dias(d.vence) <= 30);
  const grupos = TIPOS_DOC.map(t => [t, docs.filter(d => d.tipo === t)]).filter(([, l]) => l.length);
  const faltan = R() ? [] : ['Reglamento', 'Póliza', 'Certificado'].filter(t => !docs.some(d => d.tipo === t));
  return `<div class="stack"><h2>Documentos del conjunto</h2>
  ${venc.length && !R() ? `<div class="alert"><b>${venc.length} documento(s) vencidos o por vencer en 30 días:</b> ${venc.map(d => esc(d.titulo)).join(', ')}.</div>` : ''}
  ${faltan.length && W() ? `<div class="card sub">Te faltan por subir: <b>${faltan.join(', ')}</b>.</div>` : ''}
  ${W() ? `<details class="card" ${docs.length ? '' : 'open'}><summary><b>+ Subir documento</b></summary>${formDoc(null)}</details>` : ''}
  ${grupos.map(([t, l]) => `<div class="card"><h3>${t}</h3><div class="list" style="margin-top:4px">${l.map(filaDoc).join('')}</div></div>`).join('') || `<div class="card sub">${R() ? 'La administración aún no ha publicado documentos.' : 'Aún no hay documentos.'}</div>`}
  </div>`;
};

/* ---------- reportar daño desde un QR (residente) ---------- */
const _rdano = V.rdano;
V.rdano = async () => (S.sub.activo ? `<div class="alert"><b>Equipo:</b> ${esc(S.sub.activoNombre)} <span class="mono">(${esc(S.sub.activoCodigo)})</span>${S.sub.activoUbic ? ' · ' + esc(S.sub.activoUbic) : ''}</div>` : '') + await _rdano();
AFTER.rdano = () => { if (S.sub.activo) { const u = $('dn-u'); if (u && !u.value) u.value = S.sub.activoUbic || ''; } };

/* ---------- entrada por QR ---------- */
async function rutaQR() {
  const m = /^#activo-([0-9a-f-]{36})$/i.exec(location.hash);
  if (!m) return false;
  const id = m[1];
  history.replaceState(null, '', location.pathname);
  const a = await sb.from('activos').select('id, conjunto_id').eq('id', id).maybeSingle();
  if (a.data) {
    const ctx = S.ctxs.find(c => c.conjunto_id === a.data.conjunto_id && c.rol !== 'residente');
    if (ctx) { setCtx(ctx); go('activo', { id }); return true; }
  }
  const b = await sb.rpc('activo_basico', { p_id: id });
  if (b.data) {
    const ctx = S.ctxs.find(c => c.conjunto_id === b.data.conjunto_id && c.rol === 'residente');
    if (ctx) { setCtx(ctx); go('rdano', { activo: id, activoNombre: b.data.nombre, activoCodigo: b.data.codigo, activoUbic: b.data.ubicacion }); return true; }
  }
  toast('Ese código QR es de un conjunto al que no tienes acceso.');
  return false;
}

/* ---------- acciones ---------- */
Object.assign(ACT, {
  revisarCuenta: async () => { await cargarPlataforma(); render(); toast(cuentaOk() ? 'Tu cuenta está activa' : 'Aún no vemos el pago registrado'); },
  estadoCuenta: async d => { await q(sb.from('cuentas').update({ estado: d.v }).eq('id', d.id)); toast(d.v === 'activa' ? 'Cuenta reactivada' : 'Cuenta suspendida'); render(); },
  sub2: d => go(d.view, { id: d.id }),
  pilotoGratis: async d => {
    await q(sb.from('cuentas').update({ estado: 'activa', vigente_hasta: addDays(HOY(), 30), notas: 'Piloto gratis desde ' + fecha(HOY()) }).eq('id', d.id));
    toast('Piloto activado por 30 días'); S.sub = { f: 'activa' }; render();
  },
  otActivo: async d => {
    const a = await q(sb.from('activos').select('*').eq('id', d.id).single());
    await q(sb.from('ordenes').insert({ conjunto_id: C(), titulo: 'Daño en ' + a.nombre, ubicacion: a.ubicacion, prioridad: 'Alta', origen: 'Inventario ' + a.codigo, activo_id: a.id }));
    toast('Orden de trabajo creada para ' + a.codigo); render();
  },
  borrarActivo: async d => { await q(sb.from('activos').delete().eq('id', d.id)); toast('Activo borrado'); go('inventario'); },
  imprimir: () => window.print()
});
Object.assign(CHG, {
  buscarActivo: el => { S.sub = { ...S.sub, q: el.value }; render(); },
  estadoActivo: async el => { try { await q(sb.from('activos').update({ estado: el.value }).eq('id', el.dataset.id)); toast('Estado actualizado'); render(); } catch (e) { toast(traducir(e)); } }
});

/* ---------- formularios ---------- */
const datosActivo = f => ({
  codigo: f.codigo.trim().toUpperCase(), nombre: f.nombre.trim(), categoria: f.categoria, estado: f.estado,
  ubicacion: f.ubicacion || null, marca: f.marca || null, modelo: f.modelo || null, serial: f.serial || null, proveedor: f.proveedor || null,
  fecha_instalacion: f.fecha_instalacion || null, garantia_hasta: f.garantia_hasta || null, valor: f.valor ? Number(f.valor) : null, notas: f.notas || null
});
Object.assign(FORM, {
  solicitar: async f => {
    await q(sb.rpc('solicitar_acceso', { p_nombre: f.nombre, p_empresa: f.empresa || null, p_telefono: f.telefono, p_ciudad: f.ciudad || null, p_conjuntos: Number(f.conjuntos) || 1 }));
    toast('Solicitud enviada. Te mostramos cómo pagar.'); render();
  },
  pagoPlataforma: async (f, form) => {
    const hasta = await q(sb.rpc('registrar_pago_plataforma', { p_cuenta: form.dataset.id, p_valor: Number(f.valor), p_fecha: f.fecha, p_medio: f.medio, p_meses: Number(f.meses), p_referencia: f.referencia || null, p_nota: null }));
    toast('Pago registrado. Cuenta activa hasta el ' + fecha(hasta), 4000); S.sub = { f: 'activa' }; render();
  },
  planCuenta: async (f, form) => {
    await q(sb.from('cuentas').update({ max_conjuntos: Number(f.max_conjuntos), max_unidades: f.max_unidades ? Number(f.max_unidades) : null, vigente_hasta: f.vigente_hasta || null, notas: f.notas || null }).eq('id', form.dataset.id));
    toast('Plan actualizado'); S.sub = { f: S.sub.f }; render();
  },
  nuevaCuenta: async f => {
    await q(sb.from('cuentas').insert({ email: f.email.trim().toLowerCase(), nombre: f.nombre, empresa: f.empresa || null, telefono: f.telefono || null }));
    toast('Cliente registrado como pendiente de pago'); S.sub = { f: 'pendiente' }; render();
  },
  configPlataforma: async f => {
    await q(sb.from('plataforma_config').update({ instrucciones_pago: f.instrucciones_pago || null, contacto: f.contacto || null, planes: f.planes || null }).eq('id', 1));
    toast('Datos de pago guardados'); render();
  },
  activo: async (f, form) => {
    const foto = await subir(form.foto.files[0], 'activos');
    await q(sb.from('activos').insert({ ...datosActivo(f), conjunto_id: C(), foto }));
    toast('Activo agregado'); render();
  },
  editarActivo: async (f, form) => {
    const foto = await subir(form.foto.files[0], 'activos');
    const datos = datosActivo(f); if (foto) datos.foto = foto;
    await q(sb.from('activos').update(datos).eq('id', form.dataset.id));
    toast('Cambios guardados'); render();
  },
  importarActivos: async f => {
    const filas = f.texto.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => {
      const sep = l.includes(';') ? ';' : l.includes('\t') ? '\t' : ',';
      const [codigo, nombre, categoria, ubicacion, marca, modelo, serial, estado] = l.split(sep).map(s => (s || '').trim());
      return { conjunto_id: C(), codigo: (codigo || '').toUpperCase(), nombre, categoria: CATS.includes(categoria) ? categoria : 'Otro', ubicacion: ubicacion || null, marca: marca || null, modelo: modelo || null, serial: serial || null, estado: ESTADOS_ACT.includes(estado) ? estado : 'Bueno' };
    }).filter(r => r.codigo && r.nombre && !/^c[oó]digo$/i.test(r.codigo));
    if (!filas.length) throw new Error('No encontré activos en el texto pegado. Revisa que cada fila tenga al menos código y nombre.');
    await q(sb.from('activos').upsert(filas, { onConflict: 'conjunto_id,codigo' }));
    toast(filas.length + ' activos cargados'); render();
  },
  documento: async (f, form) => {
    const archivo = await subir(form.archivo.files[0], 'docs');
    await q(sb.from('documentos').insert({ conjunto_id: C(), activo_id: form.dataset.activo || null, titulo: f.titulo, tipo: f.tipo, vence: f.vence || null, publico: !!f.publico, archivo }));
    toast('Documento subido'); render();
  },
  dano: async (f, form) => {
    const foto = await subir(form.foto.files[0], 'danos');
    await q(sb.from('ordenes').insert({ conjunto_id: C(), titulo: f.titulo, ubicacion: f.ubicacion, origen: 'Residente ' + (S.ctx.unidad_codigo || ''), foto, activo_id: S.sub.activo || null }));
    toast('Reporte enviado a la administración'); S.sub = {}; render();
  }
});
