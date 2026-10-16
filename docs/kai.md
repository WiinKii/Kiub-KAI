# KAI · la presencia viva de Kiub

Segunda versión del personaje: un organismo fluido con dos ojitos que se divide,
saca manitas, suelta gotas y vuelve a fundirse, guiado por el video de
referencia de Interflow. Sigue encapsulado: solo aparece en el laboratorio de
desarrollo y no se muestra en ninguna página de colaboradores.

## Abrir el laboratorio

1. Copia `routes/dev.php` en el proyecto e inclúyelo al final de `routes/web.php`:

    ```php
    require __DIR__.'/dev.php';
    ```

2. Con `APP_ENV=local`, inicia sesión y abre **`/dev/kai`**.

La ruta solo se registra en el entorno local (con `route:cache` en producción no
existe), usa los middleware `auth` y `verified`, y no está enlazada desde la
navegación.

En el laboratorio:

- **Estados** (interacción y emociones), **reacciones** y **secuencias**.
- **Apariencia**: boca (apagada por defecto), rubor, ambiente (lóbulos y motas),
  selector de los cuatro colores, preajustes y **«Reiniciar color original»**.
  Los colores elegidos se recuerdan en este navegador.
- **Movimiento**: intensidad, velocidad, pausa, movimiento reducido y depuración.
- **KAI flotante**: el compañero abajo a la derecha, con sus tamaños, el
  estiramiento al final del scroll y el tiempo hasta que se duerme (nunca,
  30 s o 2 min).
- **Juegos**: da vueltas con el cursor alrededor de KAI hasta marearlo,
  arrástralo para estirarlo como gelatina; un clic le hace cosquillas.
- **Chat guiado (sin IA)**: simula la sección de la intranet en la que estás,
  recibe avisos de ejemplo y prueba el chat del KAI flotante. En el
  laboratorio los enlaces no navegan: se anota qué abrirían.

## Archivos

| Archivo | Responsabilidad |
| --- | --- |
| `resources/js/components/kai/KaiCharacter.vue` | Dibujo SVG, ciclo de vida, juegos, accesibilidad y API pública. |
| `resources/js/components/kai/KaiDock.vue` | Compañero flotante abajo a la derecha (mínimo / normal / grande), chat, avisos y señalar elementos. |
| `resources/js/components/kai/KaiChat.vue` | Panel del chat guiado: conversación, opciones, pasos, acciones y buscador. |
| `resources/js/components/kai/useKaiOverscroll.ts` | Estiramiento elástico de la página al llegar al final del scroll. |
| `resources/js/lib/kai/engine.ts` | Motor: transiciones, rigs, satélites (lóbulos, manos, gotas), partículas y composición del fotograma. |
| `resources/js/lib/kai/field.ts` | Campo de metabolas y contorno (marching squares + spline). |
| `resources/js/lib/kai/shape.ts` | Cuerpo radial: armónicos, hervor, conservación del área y transformación. |
| `resources/js/lib/kai/face.ts` | Ojos (cápsula, «◠», «◡», «—»), espiral, corazón y boca. |
| `resources/js/lib/kai/sprites.ts` | Partículas: notas, corazones, zetas, estrellas, puntos. |
| `resources/js/lib/kai/palette.ts` | Colores, preajustes y tonos derivados (`--kai-*`). |
| `resources/js/lib/kai/guide.ts` | Contenido del chat por sección (de ejemplo), búsqueda por palabras y sección según la URL. |
| `resources/js/lib/kai/motion.ts` | Canales de pose, muelles y tiempos. |
| `resources/js/lib/kai/states.ts` | Estados y reacciones: pose, cues y rig de cada uno. |
| `resources/js/lib/kai/ticker.ts` | Un único `requestAnimationFrame` compartido por todas las instancias. |
| `resources/js/lib/kai/types.ts`, `catalog.ts` | Tipos públicos y textos de la interfaz. |
| `resources/js/pages/dev/KaiLab.vue` | Página del laboratorio. |
| `resources/js/components/kai/lab/*` | Controles, galería, tamaños, demostración contextual y secuencias (solo laboratorio). |
| `routes/dev.php` | Ruta local del laboratorio. |

No añade dependencias: usa Vue, `@vueuse/core` (ya presente en el proyecto) y SVG.

## Cómo está hecho

- **Cuerpo fluido.** El cuerpo es una función radial (círculo + armónicos que
  ondulan + hervor) con el área normalizada. Los lóbulos, manos y gotas son
  *satélites* con su propio muelle. Cuerpo y satélites se suman en un campo de
  metabolas cuyo contorno se traza con marching squares y se suaviza con una
  spline: por eso las manos brotan del cuerpo, se estiran, se desprenden y
  vuelven a fundirse sin costuras. Cada satélite tiene su caída en el campo:
  baja se funde ancho; alta deja un cuello visible (manos, lóbulos).
- **Contorno estable.** La rejilla del campo viaja anclada al cuerpo y el
  contorno se suaviza antes de aligerarse, sin depender del punto de inicio:
  al flotar, el borde no «hierve» (la mitad de temblor que antes a 300 px).
- **Rigs.** Cada estado y reacción tiene una función que, en cada fotograma,
  pide los satélites que necesita (posición, tamaño, muelle) y emite
  partículas. Los que deja de pedir se reabsorben solos, así que cualquier
  interrupción termina fundiéndose de forma natural.
- **Movimiento.** Todos los canales (forma, mirada, ojos, boca, rubor) persiguen
  su objetivo con muelles amortiguados y desfasados entre sí. Además flota, deriva
  despacio, se inclina con la inercia al moverse y se aplasta al aterrizar.
  Parpadea a veces dos veces seguidas y suele parpadear al cambiar mucho la
  mirada; en reposo largo, cada 20–30 s hace un gesto breve y distinto. La
  flotación combina dos armónicos y el cuerpo se estira al subir y se ensancha
  al bajar. La física va en pasos fijos y el dibujo extrapola el resto del
  paso: sin tirones en pantallas de 90, 120 o 144 Hz.
- **Material de vidrio.** Degradado iridiscente derivado de los colores
  elegidos (cielo en el centro → azul → violeta en el borde) y cuatro manchas de
  color (violeta, cielo, profundo, orquídea) que orbitan con paralaje. Como en
  la referencia, no hay contorno: el borde se satura (fresnel), la luz que
  atraviesa la gota se concentra en la base (cáustica) y una línea iridiscente
  fina ilumina solo la parte inferior. Cada lóbulo que asoma tiene su propio
  brillo, y se lee como otra esfera de vidrio superpuesta. El destello
  especular es suave.
- **Rostro.** Los ojos viven sobre una esfera (giran con escorzo al mirar a los
  lados) y cambian de forma: cápsula, «◠» alegre, «◡» contento, «—» cerrado,
  guiño, espiral y corazón. Rubor bajo los ojos que aparece en las emociones.
  Boca opcional y minimalista: un solo trazo blanco, como los ojos («◡»,
  «ω», ondulada) que se abre en una «o» pequeña, sin relleno.

### Por qué SVG

- Vectorial: nítido de 40 a 300 px sin recursos por tamaño.
- Cada fotograma solo reescribe unos pocos atributos; Vue no vuelve a renderizar.
- Fácil de tematizar con variables CSS (`--kai-*`) y de inspeccionar.
- WebGL daría refracción real, pero con límite de contextos por página y más
  coste de mantenimiento a esta escala.

## Uso

```vue
<script setup lang="ts">
import { ref } from 'vue';
import KaiCharacter from '@/components/kai/KaiCharacter.vue';
import type { KaiController, KaiState } from '@/lib/kai/types';

const kai = ref<KaiController | null>(null);
const estado = ref<KaiState>('idle');

async function guardar() {
    // «Trabajando» mientras la promesa está pendiente; después éxito o error.
    await kai.value?.track(enviarFormulario(), { failure: 'error' });
}
</script>

<template>
    <KaiCharacter ref="kai" v-model:state="estado" size="sm" />
</template>
```

### Compañero flotante

```vue
<script setup lang="ts">
import { ref } from 'vue';
import KaiDock from '@/components/kai/KaiDock.vue';
import type { KaiDockSize, KaiState } from '@/lib/kai/types';

const estado = ref<KaiState>('idle');
const tamano = ref<KaiDockSize>('normal');
</script>

<template>
    <!-- En el layout de la intranet, una sola vez. -->
    <KaiDock
        v-model:state="estado"
        v-model:size="tamano"
        :notices="avisos"
        @read="(ids) => marcarLeidos(ids)"
        @navigate="(href, event) => { event.preventDefault(); router.visit(href); }"
    />
</template>
```

| Prop | Tipo | Por defecto | Descripción |
| --- | --- | --- | --- |
| `v-model:state` | `KaiState` | `'idle'` | Estado persistente. |
| `v-model:size` | `'mini' \| 'normal' \| 'grande'` | `'normal'` | 56 / 96 / 144 px. En mínimo, sin lóbulos de ambiente y con la mitad de intensidad. Botones − / + al pasar el cursor o con el foco. |
| `overscroll` | `boolean` | `true` | Al llegar al final del scroll, la página se estira un poco con resistencia y KAI se estira con ella; al soltar, ambos vuelven con rebote. |
| `stretchTarget` | `() => HTMLElement \| null` | `<main>` | Elemento que sube durante el estiramiento. |
| `sleepAfter` | `number` | `90` | Segundos sin actividad (ratón, teclado, scroll, toques) hasta que se duerme; `0` = nunca. Solo tapa el reposo: cualquier estado real lo despierta. Al volver el usuario, despierta con un bostezo. |
| `greet` | `boolean` | `true` | Saluda una vez por sesión al aparecer (se recuerda en `sessionStorage`). |
| `chat` | `boolean` | `true` | Pulsarlo abre el chat guiado (KAI pasa a ser un botón con nombre accesible). |
| `guide` | `KaiGuide` | `KIUB_GUIDE` | Contenido del chat (`lib/kai/guide.ts`). |
| `section` | `string` | `''` | Sección actual (id de la guía). Vacío: se deduce de la URL al abrir el chat. |
| `notices` | `KaiNotice[]` | `[]` | Avisos sin leer: globito con el número sobre KAI, estado «Aviso» y primer mensaje del chat. |
| `colors`, `mouth`, `intensity`, `paused`, `reducedMotion` | — | — | Igual que en `KaiCharacter`. |

Además, mira al cursor cuando se acerca y, al desplazarse la página, la masa
se mece como gelatina y mira un momento hacia el contenido.

Eventos: `navigate` (`href`, `event`; un enlace del chat; con
`event.preventDefault()` se navega con Inertia) y `read` (ids de los avisos que
el usuario ha visto; la app decide si los marca como leídos).

Expone `kai` (el `KaiController` del personaje) para llamar a `react`,
`track`, etc., `asleep` (si está dormido), `chatOpen`, `openChat()` y
`closeChat()`.

### Chat guiado

Sin IA: es una guía escrita. Al abrirlo, KAI saluda según la sección (o enseña
primero los avisos) y ofrece temas como botones. Cada respuesta puede llevar
pasos numerados y acciones: abrir otro tema, ir a una página o **señalar un
elemento de la pantalla** (un anillo lo rodea y KAI saca una manita hacia
él). Incluye un recorrido por la barra superior y un buscador por palabras
(sin acentos ni mayúsculas); si no encuentra nada, lo dice. KAI «escribe»
(expresión de pensar) un momento proporcional a la respuesta, asiente al
contestar y mira la conversación.

- Accesible: diálogo no modal con título, conversación como `role="log"`
  (`aria-live="polite"`), opciones como botones, foco al panel al abrir;
  Escape lo cierra y devuelve el foco a KAI. Sin animaciones con movimiento
  reducido.
- KAI no hace gestiones por el usuario: le guía. El contenido de
  `KIUB_GUIDE` es de ejemplo; hay que ajustarlo a los módulos reales.
- La sección se deduce del prefijo de la URL (`paths` de cada sección) o se
  pasa con `section`.

### Props de `KaiCharacter`

| Prop | Tipo | Por defecto | Descripción |
| --- | --- | --- | --- |
| `v-model:state` | `KaiState` | `'idle'` | Estado persistente. |
| `size` | `number \| 'sm' \| 'md' \| 'lg'` | `'md'` | Lado de la caja (48 / 120 / 240 px). Por debajo de 64 px el movimiento se contiene. |
| `colors` | `Partial<KaiColors>` | colores de Kiub | `primary`, `secondary`, `accent` (tercer color del degradado) y `blush`. |
| `mouth` | `boolean` | `false` | Boca integrada en estados y reacciones. |
| `blush` | `boolean` | `true` | Rubor en las emociones. |
| `ambient` | `boolean` | `true` | Lóbulos y motas en reposo (apagar en tamaños mínimos). |
| `playful` | `boolean` | `false` | Juegos: marearlo dando vueltas con el cursor, estirarlo arrastrándolo y cosquillas al pulsarlo. |
| `tickle` | `boolean` | `true` | Con `playful`, pulsarlo le hace cosquillas (el dock lo apaga: el clic abre el chat). |
| `badge` | `number \| string \| boolean` | `false` | Globito de avisos arriba a la derecha, sobre el cuerpo (viaja con la gelatina): número (9+ desde 10), texto corto o `true` para un punto. |
| `pull` | `number` | `0` | Estiramiento vertical externo (0–1), por ejemplo el del scroll. |
| `animateSize` | `boolean` | `false` | Cambios de `size` con transición. |
| `intensity` | `number` | `1` | Amplitud de los gestos (0–1.5). |
| `paused` | `boolean` | `false` | Congela la animación. |
| `reducedMotion` | `'auto' \| 'reduce' \| 'no-preference'` | `'auto'` | `auto` respeta `prefers-reduced-motion`. |
| `surface` | `'auto' \| 'light' \| 'dark'` | `'auto'` | Fondo sobre el que se dibuja; `auto` sigue `.dark` en `<html>`. |
| `followPointer` | `boolean` | `false` | Mira al puntero solo mientras está sobre el componente. |
| `label` | `string` | `''` | Nombre accesible. Vacío = decorativo (`aria-hidden`). |
| `timeScale`, `debug` | — | — | Ajustes para el laboratorio. |

### Métodos (`ref`)

| Método | Descripción |
| --- | --- |
| `setState(estado)` | Cambia el estado persistente (igual que `v-model`). |
| `react(gesto, { next? })` | Gesto temporal. Devuelve una promesa con `{ name, interrupted }`. Al terminar vuelve al estado vigente o a `next`. |
| `track(promesa, { success?, next?, failure? })` | Acompaña una operación real: `working` hasta que se resuelve; luego `success` → `next` (por defecto `idle`) o `failure` (por defecto `error`). Si llega otra operación, solo cuenta el último resultado. |
| `lookAt({ x, y } \| null)` | Dirige la mirada (-1…1) o la libera. |
| `blink()`, `pause()`, `resume()` | Parpadeo puntual y pausa manual. |
| `nudge(vx, vy)` | Empujón elástico externo, en radios/s: la masa se desplaza, se deforma por inercia y vuelve con rebote. Se ignora con movimiento reducido. |
| `point({ x, y } \| null)` | Saca una manita hacia una dirección de la pantalla (y mira hacia allí), o la recoge. |

### Atributos

La raíz del personaje refleja `data-kai-state` (estado persistente) y
`data-kai-reaction` (gesto en curso). Solo cambian con el estado, no en cada
fotograma: sirven para estilos y pruebas.

### Eventos

`state-change` (`{ from, to }`), `reaction-start` (`{ name }`) y
`reaction-end` (`{ name, interrupted }`).

## Estados

| Estado | Clave | Cómo se distingue |
| --- | --- | --- |
| Reposo | `idle` | Flota y respira; cada ~15 s le salen un lóbulo grande abajo a la izquierda y otro pequeño al lado, y entre ciclos una gotita brota arriba, se suelta, flota y vuelve. Dos motas orbitan. Cada 20–30 s, un gesto breve al azar (nunca el mismo dos veces): mirar alrededor, sacudirse como un cachorro mojado o tararear una nota. Si alguien le está mirando, no aparta la vista. |
| Atento | `attentive` | Los ojos van primero; el cuerpo se inclina después. |
| Curioso | `curious` | Se estira hacia donde mira y asoma un lóbulo. |
| Pensando | `thinking` | Ondula; una gota sube como una idea y vuelve. |
| Trabajando | `working` | Ojos cerrados, el contorno hierve y dos motas giran. Se mantiene hasta que llega un resultado. |
| Cargando | `loading` | Se encoge y se divide en una fila de gotas que laten en onda. |
| Duda | `doubt` | Inclinación lateral, un ojo entrecerrado, tono azul grisáceo. |
| Error recuperable | `error` | Retrocede con suavidad y queda atento a la solución (sin tristeza ni culpa). |
| Esperando | `waiting` | Se sienta sobre dos patitas y mira con calma. |
| Contento | `content` | Ojos «◡◡», rubor y lóbulos que se mecen. |
| Escuchando música | `music` | Se balancea y se desplaza al ritmo; le salen notas en ráfagas. |
| Dormido | `sleeping` | Respira hondo, se asienta y suelta zetas. |
| Tímido | `shy` | Se encoge, se sonroja, pone las manitas junto a las mejillas y mira de reojo. |
| Aviso | `notice` | Tiene algo para ti: mira el globito, alza una manita a su lado, te mira y da un saltito de vez en cuando. El KAI flotante lo usa solo con avisos pendientes. |

## Reacciones

| Reacción | Clave | Qué hace |
| --- | --- | --- |
| Bienvenida | `welcome` | Le crece un brazo que se suelta como manita, saluda y guiña con rubor. |
| Alegre / éxito | `success` | Anticipación, salto elástico, manitas que se agitan y destellos. |
| Sorprendido | `surprised` | Estiramiento, ojos muy abiertos y dos gotitas que saltan. |
| Baile | `dance` | Brazos que giran con el balanceo y se desplaza. |
| Encantado | `love` | Ojos de corazón, rubor y corazones. |
| Cosquillas | `giggle` | Se sacude de risa. También al pulsarlo (con `playful`). |
| ¡Idea! | `idea` | Una gota salta por arriba y vuelve como antena. |
| Mareado | `dizzy` | Cuerpo completo: «¡uy!», tambaleo en ocho con el fluido chapoteando alrededor, traspié que lo aplasta como un charco (con salpicadura), sacudida con los ojos apretados y un saltito de alivio. Estrellas en órbita y ojos de espiral. |
| Explorar | `explore` | Viaja a un lado con una gota rezagada y vuelve. |
| Bostezo | `yawn` | Se estira hacia arriba con la boca muy abierta. |
| Rebote | `boing` | Aplastamiento y estiramiento rápido (también al cambiar de tamaño). |
| Asentir | `nod` | Asiente dos veces, con mirada amable: «entendido» (lo usa el chat al responder). |

Reglas de transición:

- Los cambios y las interrupciones nunca saltan: todo canal y todo satélite va
  con muelle, y lo que un estado deja de usar se reabsorbe.
- Los gestos programados viven en el reloj del motor (no hay `setTimeout`
  compitiendo) y se pausan con la animación.
- Un gesto nuevo corta el anterior; un cambio de estado distinto también. Pedir
  el estado al que el gesto ya iba a volver no lo corta.
- KAI nunca anuncia una acción que no ocurrió: `track` solo celebra cuando la
  promesa real se resuelve.

## Juegos

- **Marearlo**: con `playful`, hay que dar unas cuatro vueltas netas seguidas
  alrededor de KAI (dentro de una zona cercana). Desde la primera vuelta se
  nota: el fluido chapotea hacia el cursor, el cuerpo se tambalea cada vez más
  y los ojos se entornan; al completarlas, se marea. Después descansa 6 s. El
  listener es pasivo y solo existe mientras KAI es visible.
- **Estirarlo**: arrástralo y le sale una mano unida por un hilo de fluido que
  sigue al puntero (hasta 2,3 radios), con el cuerpo cediendo hacia el tirón;
  al soltar, la masa corre hacia allí y vuelve con rebote. Soltar tras
  arrastrar no cuenta como clic.
- **Cosquillas**: un clic o toque lo hace reír.
- **Mirada**: también con `playful`, mira al cursor cuando pasa cerca (hasta
  ~300–560 px según su tamaño).

## Accesibilidad y rendimiento

- Con `prefers-reduced-motion` (o `reducedMotion="reduce"`): sin saltos,
  desplazamientos, gotas, satélites ni partículas; los estados se leen por los
  ojos, el rubor y una inclinación estática, y el bucle se detiene por completo
  cuando no hay cambios. El estiramiento del scroll también se desactiva.
- El personaje es decorativo por defecto (`aria-hidden`) y no tiene regiones
  `aria-live`. Los mensajes importantes deben ir en texto de la interfaz, como
  en la demostración contextual (`role="status"`). Los botones del compañero
  flotante tienen nombre accesible y se ven con el foco del teclado.
- La animación se detiene fuera de la vista (IntersectionObserver), con la
  pestaña oculta y en pausa. Todas las instancias comparten un único
  `requestAnimationFrame`; con más de cuatro activas, las pequeñas van a 30 fps.
- Coste medido en Chromium: ~0,7 ms por fotograma en reposo a 300 px, ~0,3 ms
  a 112 px; un KAI solo va a 60 fps y la galería del laboratorio (27
  instancias animadas a la vez) a ~56–57 fps.
- Con movimiento reducido no hay gelatina con el scroll ni estiramiento; el
  saludo y el sueño se leen solo por la expresión.

## Limitaciones y ajustes pendientes

- **Enfado.** El video muestra un estado rojo y enfadado; no se implementa
  porque el encargo original excluye enfado, culpa y tristeza exagerada.
- **Colores.** Se mantienen los azules de Kiub y se añade un tercer color
  (violeta) para el degradado. El magenta y cian intensos del video están
  disponibles como inspiración en los preajustes «Aurora» y «Cielo»; el
  original se recupera con «Reiniciar color original».
- **Materialidad.** La translucidez se aproxima con degradados, manchas
  desenfocadas y brillos; no hay refracción ni cáusticas reales como en el
  render de referencia.
- **Tamaños pequeños.** Por debajo de ~64 px las gotas diminutas se dibujan
  como puntos y las asimetrías se leen poco; en el tamaño mínimo del compañero
  se apagan los lóbulos de ambiente.
- **Estiramiento.** Responde a la rueda del ratón, al trackpad y al gesto
  táctil al final de la página. Arrastrar la barra de desplazamiento o pulsar
  `Fin` no lo activa.
- **Integración.** El compañero flotante solo se monta en el laboratorio.
  Para la intranet basta con añadir `<KaiDock>` una vez en el layout principal,
  pasarle los avisos reales y navegar con Inertia en `navigate`.
- **Chat.** Es una guía escrita, no entiende lenguaje libre: el buscador
  compara palabras. El contenido de `KIUB_GUIDE` (rutas, nombres de módulos y
  pasos) es de ejemplo y hay que revisarlo con cada área. «Muéstrame dónde»
  solo encuentra elementos visibles; en móvil, los del menú ☰ no lo están y
  KAI lo dice.
- **Validación.** Probado en Chromium (escritorio y móvil emulado) sobre el
  starter kit oficial de Laravel + Inertia v3 + Vue con `AppHeader.vue`, porque
  este repositorio es un extracto. Falta comprobarlo en Safari y Firefox y en el
  repositorio completo de Kiub. No hay backend implicado (SQL Server no
  interviene).
- **Ruta.** El enlace de las migas usa `'/dev/kai'` literal; puede sustituirse
  por el helper que genere Wayfinder para `dev.kai`.
- **Fuente.** El laboratorio declara Raleway y depende de que la aplicación la
  cargue (como el resto de Kiub).
