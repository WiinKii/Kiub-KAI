# NavBar Intra · Kiub

Nueva barra de navegación de la intranet (`resources/js/components/AppHeader.vue`),
versión 2 («NavBar v2 · Escritorio»): logo «Kiub», secciones Inicio, Servicios
KH, HR.Space, Kaizen University, Comunicaciones (Noticias y Calendario) y
Koupons; búsqueda, menú «Herramientas», campana y tarjeta de usuario.

## Qué incluye

- **Barra de cristal que respira**: se expande al entrar el cursor y vuelve con
  rebote al salir; se mantiene expandida mientras hay un menú o la búsqueda abierta.
- **Brillo que sigue al cursor** en el borde y la superficie de la barra.
- **Enlaces**: el texto sube y crece levemente, un subrayado crece desde la izquierda
  (y se retrae hacia la izquierda), y el chevron de «Comunicaciones» gira.
- **Herramientas** (llave inglesa): menú de administración en dos columnas con
  entrada escalonada; la llave gira al abrirlo.
- **Píldora activa deslizante** con punto pulsante; se mueve al instante al hacer clic,
  incluso entre visitas de Inertia.
- **Búsqueda que se transforma**: el botón circular se estira hasta un campo con `ESC`
  y botón de cierre; al cerrarse se encoge con un pequeño rebote.
- **Campana** que se balancea al pasar el cursor y contador opcional.
- **Tarjeta de usuario** con ola de letras en el nombre, avatar que gira y menú
  (Configuración y Cerrar sesión). Al buscar se recoge al avatar.
- **Responsivo**: ≤ 1430 px la búsqueda se abre sobre las secciones, que se
  desvanecen; ≤ 1380 px la tarjeta queda en el avatar; ≤ 1180 px las secciones
  pasan al menú lateral; ≤ 720 px barra compacta y sin el botón Herramientas
  (sigue en el menú lateral).
- **Móvil**: panel lateral flotante con entrada escalonada, Comunicaciones
  plegable y, bajo «Administración», Herramientas plegable.
- Respeta `prefers-reduced-motion` y el modo oscuro (`.dark` en `<html>`).

## Uso

```vue
<AppHeader
    :breadcrumbs="breadcrumbs"
    :tools="[
        { title: 'Vacaciones', href: '/herramientas/vacaciones', icon: Plane },
    ]"
    user-subtitle="Kaizen Holdings · IT Tecnología"
    :notification-count="3"
    @search="(q) => router.get('/buscar', { q })"
    @notifications="abrirNotificaciones"
/>
```

| Prop | Tipo | Por defecto | Descripción |
| --- | --- | --- | --- |
| `breadcrumbs` | `BreadcrumbItem[]` | `[]` | Igual que antes. |
| `tools` | `{ title, href, icon }[]` | las 13 del diseño | Accesos del menú «Herramientas». Vacío oculta el menú. |
| `userSubtitle` | `string` | email del usuario | Segunda línea de la tarjeta de usuario. |
| `notificationCount` | `number` | `0` | Muestra el contador sobre la campana si es mayor que 0. |
| `animatedMark` | `boolean` | `true` | Barras animadas junto al logo. |

Eventos: `search` (texto buscado al pulsar Enter) y `notifications` (clic en la campana).

Las rutas de las secciones (`navEntries`) y de las herramientas
(`DEFAULT_TOOLS`) son provisionales (`/servicios-kh`, `/noticias`,
`/herramientas/vacaciones`…); cámbialas por tus rutas de Wayfinder.
«Configuración» lleva al perfil y «Cerrar sesión» usa `logout()`.

## KAI · compañero digital (laboratorio)

**KAI**, la presencia viva de Kiub: un organismo fluido con dos ojitos que se
divide, saca manitas y suelta gotas (campo de metabolas en SVG, sin
dependencias nuevas). Componentes `KaiCharacter.vue` y `KaiDock.vue`
(compañero flotante abajo a la derecha, con tamaños y estiramiento al final del
scroll; saluda, mira al cursor, se mece con el scroll y se duerme si no hay
actividad; al pulsarlo abre un chat guiado por sección, sin IA, y enseña los
avisos en un globito) en `resources/js/components/kai/`, y su motor en
`resources/js/lib/kai/`.
Incluye una aparición, «Convergencia: KAI cobra vida», en la que las gotas se
funden y KAI despierta.
La **pantalla de inicio de sesión** (`resources/js/pages/auth/Login.vue`) usa
la autenticación real de Fortify y presenta a KAI: entra como una corriente que
cobra vida y saluda, viaja con una estela blanca al pasar por «Ingresar», se
impulsa al enviar y, si el acceso es correcto, sale disparado del recuadro; el
navbar se crea y KAI llega a su sitio en la intranet, abajo a la derecha. De momento solo se muestra en el laboratorio de
desarrollo **`/dev/kai`** (aparición, colores, boca, rubor, juegos y todos los
estados), que se registra únicamente
en local (`routes/dev.php`, incluido desde `routes/web.php`).

Estados, API, decisiones técnicas y limitaciones: [`docs/kai.md`](docs/kai.md).
