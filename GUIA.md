# Copropiedad 360 · Guía para montar el piloto

Esta carpeta es la app completa. Para que funcione necesitas dos cosas gratuitas:

- **Supabase**: guarda los datos, los usuarios, los comprobantes y el chat.
- **Un hosting de páginas**: publica la app para abrirla desde cualquier celular. Puede ser Netlify o Render.

Tiempo estimado: 30 a 45 minutos la primera vez.

---

## 1. Crear la base de datos en Supabase

1. Entra a https://supabase.com y crea una cuenta. Puedes entrar con Google.
2. Toca **New project**:
   - Nombre: `copropiedad360`.
   - Contraseña de base de datos: inventa una segura y guárdala.
   - Región: **East US (North Virginia)** o **South America (São Paulo)**.
3. Espera uno o dos minutos a que el proyecto quede listo.
4. En el menú izquierdo abre **SQL Editor** y toca **New query**.
5. Abre el archivo `supabase/01_esquema.sql` de esta carpeta, copia todo, pégalo y toca **Run**. Debe decir *Success. No rows returned*.
6. Ve a **Project Settings → API** y copia dos datos:
   - **Project URL** (algo como `https://abcd1234.supabase.co`).
   - **anon public** (una clave larga que empieza por `eyJ…`).
7. Abre el archivo `config.js` de esta carpeta y reemplaza los dos valores:

```js
window.C360 = {
  SUPABASE_URL: 'https://abcd1234.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOi...'
};
```

> La clave *anon public* puede ir en la app sin problema. Lo que protege los datos son las reglas de seguridad del archivo SQL: cada persona solo ve lo de su conjunto y su rol. La clave **service_role** nunca se pone en la app.

## 2. Publicar la app

**Opción A: Netlify (la más rápida, sin GitHub)**
1. Entra a https://app.netlify.com/drop.
2. Arrastra esta carpeta completa a la página.
3. Te da una dirección como `https://nombre-raro.netlify.app`. En *Site configuration* le puedes cambiar el nombre.

**Opción B: Render (como hiciste con Turno)**
1. Sube esta carpeta a un repositorio de GitHub.
2. En Render: **New → Static Site** → escoge el repositorio.
3. Deja *Build command* vacío y pon *Publish directory* en `.`

## 3. Conectar los correos de acceso

En Supabase, ve a **Authentication → URL Configuration**:
- **Site URL**: la dirección de tu app (la de Netlify o Render).
- **Redirect URLs**: agrega esa misma dirección.

Sin esto, los enlaces de "confirma tu correo" y "olvidé mi contraseña" no llevan a la app.

> **No desactives la confirmación de correo** (en Authentication → Sign In / Providers → Email, la opción *Confirm email* debe quedar activa). Es lo que garantiza que nadie entre con el correo de otro residente.

> El servicio de correos que trae Supabase envía pocos correos por hora. Para el piloto alcanza. Antes de cargar conjuntos grandes, conecta tu propio correo en **Authentication → Emails → SMTP Settings**; sirve Gmail Workspace, Zoho o SendGrid.

## 4. Primer uso como administrador

1. Abre la app, toca **Crear cuenta** y confirma el correo.
2. Entra y toca **Crear un conjunto**. Escribe el nombre, el NIT, la ciudad y el **presupuesto mensual** de cuotas ordinarias.
3. En **Ajustes → Unidades** pega desde Excel una unidad por línea, con este formato:
   ```
   T1-101;0,52;Laura Méndez;laura@correo.com
   T1-102;0,48;Andrés Ríos;andres@correo.com
   ```
   El formato es código; coeficiente; propietario; correo. Puedes copiar cuatro columnas de Excel y pegarlas directo.
4. En **Ajustes → Zonas comunes** crea el salón social, el BBQ y lo demás, con sus horarios.
5. En **Cartera → Liquidar cuotas del mes** se generan las cuotas de todas las unidades según su coeficiente.
6. Repite los pasos 2 a 5 para cada conjunto. El botón **Todos mis conjuntos** te lleva al panel consolidado.

## 5. Cómo entran los residentes

- El residente abre la dirección de la app y crea su cuenta **con el mismo correo que cargaste en su unidad**. Queda conectado a su apartamento automáticamente.
- Para tenerla como app: en Android, menú de Chrome → **Agregar a pantalla principal**. En iPhone, Safari → Compartir → **Agregar a inicio**.
- Mensaje sugerido para el grupo del conjunto:

> Vecinos: ya pueden pagar, reservar zonas, radicar PQRS y escribirle a la administración desde el celular. Entren a [dirección de la app], creen su cuenta con el correo que tienen registrado en la administración y agréguenla a la pantalla de inicio.

## 6. Dar acceso al consejo o a otro administrador

En **Ajustes → Equipo de gestión** escribe el correo y escoge el rol:
- **Consejo**: ve cartera, mantenimientos, PQRS y asambleas, pero no puede cambiar nada ni leer el chat privado de los residentes.
- **Administración**: tiene todos los permisos.

## Qué hace cada rol

| Módulo | Administración | Consejo | Residente |
|---|---|---|---|
| Panel de todos los conjuntos | ✔ | ✔ (solo consulta) | — |
| Cartera: liquidar, aprobar comprobantes | ✔ | Ve | Ve su saldo y reporta pagos |
| Mantenimiento preventivo y órdenes | ✔ | Ve | Reporta daños |
| Reservas | Todas | Ve | Las de su unidad |
| Chat | Con todas las unidades | — | Con la administración |
| PQRS | Responde | Ve | Radica y ve las suyas |
| Asambleas y votación | Crea, abre y cierra | Ve resultados | Vota (pesa por coeficiente) |
| Circulares | Publica | Ve | Ve |

## Límites del piloto, a propósito

- **Pagos**: el residente paga por su banco o Nequi y sube el comprobante, y la administración lo aprueba. No hay pasarela todavía.
- **Intereses de mora**: no se liquidan automáticamente. La app muestra el saldo y las cuotas atrasadas.
- **Facturación electrónica**: no está incluida. Se integra después con un proveedor autorizado por la DIAN.
- **Supabase gratis** pausa el proyecto si pasa una semana sin uso. En un piloto con uso diario eso no pasa. Para clientes que pagan, conviene el plan de pago, que incluye copias de seguridad diarias.
- Un residente con dos apartamentos en el mismo conjunto ve solo uno. Se ajusta en la siguiente versión.

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `index.html` | Página principal |
| `app.js` | Toda la lógica de la app |
| `styles.css` | Diseño |
| `config.js` | Conexión a tu Supabase (lo único que editas) |
| `supabase/01_esquema.sql` | Tablas, reglas de seguridad y funciones |
| `manifest.webmanifest`, `sw.js`, íconos | Para instalarla como app en el celular |
