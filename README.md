# NavBar Intra · Kiub

Nueva barra de navegación de la intranet (`resources/js/components/AppHeader.vue`).
Conserva los colores, secciones y botones de la barra actual y añade los efectos
y el movimiento de la referencia en video.

## Qué incluye

- **Barra de cristal que respira**: se expande al entrar el cursor y vuelve con
  rebote al salir; se mantiene expandida mientras hay un menú o la búsqueda abierta.
- **Brillo que sigue al cursor** en el borde y la superficie de la barra.
- **Enlaces**: el texto sube y crece levemente, un subrayado crece desde la izquierda
  (y se retrae hacia la izquierda), y el chevron de «Módulos» gira.
- **Píldora activa deslizante** con punto pulsante; se mueve al instante al hacer clic,
  incluso entre visitas de Inertia.
- **Búsqueda que se transforma**: el botón circular se estira hasta un campo con `ESC`
  y botón de cierre; al cerrarse se encoge con un pequeño rebote.
- **Campana** que se balancea al pasar el cursor y contador opcional.
- **Tarjeta de usuario** con ola de letras en el nombre, avatar que gira y menú.
- **Móvil**: panel lateral con entrada escalonada y submenú de módulos plegable.
- Respeta `prefers-reduced-motion` y el modo oscuro (`.dark` en `<html>`).

## Uso

```vue
<AppHeader
    :breadcrumbs="breadcrumbs"
    :modules="[
        { title: 'Recursos Humanos', href: '/rrhh', description: 'Vacaciones y nómina' },
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
| `modules` | `(NavItem & { description?: string })[]` | `[]` | Elementos del desplegable «Módulos». |
| `userSubtitle` | `string` | email del usuario | Segunda línea de la tarjeta de usuario. |
| `notificationCount` | `number` | `0` | Muestra el contador sobre la campana si es mayor que 0. |
| `animatedMark` | `boolean` | `true` | Barras animadas junto al logo. |

Eventos: `search` (texto buscado al pulsar Enter) y `notifications` (clic en la campana).

Las rutas de **Comunicaciones** y **Calendario** están como `/comunicaciones` y
`/calendario` en `navEntries`; cámbialas por tus rutas de Wayfinder.

## KAI · compañero digital (laboratorio)

**KAI**, la presencia viva de Kiub: un organismo fluido con dos ojitos que se
divide, saca manitas y suelta gotas (campo de metabolas en SVG, sin
dependencias nuevas). Componentes `KaiCharacter.vue` y `KaiDock.vue`
(compañero flotante abajo a la derecha, con tamaños y estiramiento al final del
scroll) en `resources/js/components/kai/`, y su motor en `resources/js/lib/kai/`.
De momento solo se muestra en el laboratorio de desarrollo **`/dev/kai`**
(colores, boca, rubor, juegos y todos los estados), que se registra únicamente
en local (`routes/dev.php`, incluido desde `routes/web.php`).

Estados, API, decisiones técnicas y limitaciones: [`docs/kai.md`](docs/kai.md).
