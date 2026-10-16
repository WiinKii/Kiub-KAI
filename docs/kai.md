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
- **KAI flotante**: el compañero abajo a la derecha, con sus tamaños y el
  estiramiento al final del scroll.
- **Juegos**: da vueltas con el cursor alrededor de KAI hasta marearlo; un clic
  le hace cosquillas.

## Archivos

| Archivo | Responsabilidad |
| --- | --- |
| `resources/js/components/kai/KaiCharacter.vue` | Dibujo SVG, ciclo de vida, juegos, accesibilidad y API pública. |
| `resources/js/components/kai/KaiDock.vue` | Compañero flotante abajo a la derecha (mínimo / normal / grande). |
| `resources/js/components/kai/useKaiOverscroll.ts` | Estiramiento elástico de la página al llegar al final del scroll. |
| `resources/js/lib/kai/engine.ts` | Motor: transiciones, rigs, satélites (lóbulos, manos, gotas), partículas y composición del fotograma. |
| `resources/js/lib/kai/field.ts` | Campo de metabolas y contorno (marching squares + spline). |
| `resources/js/lib/kai/shape.ts` | Cuerpo radial: armónicos, hervor, conservación del área y transformación. |
| `resources/js/lib/kai/face.ts` | Ojos (cápsula, «◠», «◡», «—»), espiral, corazón y boca. |
| `resources/js/lib/kai/sprites.ts` | Partículas: notas, corazones, zetas, estrellas, puntos. |
| `resources/js/lib/kai/palette.ts` | Colores, preajustes y tonos derivados (`--kai-*`). |
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
- **Rigs.** Cada estado y reacción tiene una función que, en cada fotograma,
  pide los satélites que necesita (posición, tamaño, muelle) y emite
  partículas. Los que deja de pedir se reabsorben solos, así que cualquier
  interrupción termina fundiéndose de forma natural.
- **Movimiento.** Todos los canales (forma, mirada, ojos, boca, rubor) persiguen
  su objetivo con muelles amortiguados y desfasados entre sí. Además flota, deriva
  despacio, se inclina con la inercia al moverse y se aplasta al aterrizar.
- **Material.** Degradado base con un tercer color (acento) y cuatro manchas de
  color que orbitan dentro del cuerpo con paralaje, brillo interior en el borde,
  línea de luz abajo y destello especular. Los lóbulos se tiñen con tonos
  distintos del cuerpo.
- **Rostro.** Los ojos viven sobre una esfera (giran con escorzo al mirar a los
  lados) y cambian de forma: cápsula, «◠» alegre, «◡» contento, «—» cerrado,
  guiño, espiral y corazón. Rubor bajo los ojos que aparece en las emociones.
  Boca opcional: sonrisa, «o», bostezo, ondulada y «:3».

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
    <KaiDock v-model:state="estado" v-model:size="tamano" />
</template>
```

| Prop | Tipo | Por defecto | Descripción |
| --- | --- | --- | --- |
| `v-model:state` | `KaiState` | `'idle'` | Estado persistente. |
| `v-model:size` | `'mini' \| 'normal' \| 'grande'` | `'normal'` | 56 / 96 / 144 px. En mínimo, sin lóbulos de ambiente y con la mitad de intensidad. Botones − / + al pasar el cursor o con el foco. |
| `overscroll` | `boolean` | `true` | Al llegar al final del scroll, la página se estira un poco con resistencia y KAI se estira con ella; al soltar, ambos vuelven con rebote. |
| `stretchTarget` | `() => HTMLElement \| null` | `<main>` | Elemento que sube durante el estiramiento. |
| `colors`, `mouth`, `intensity`, `paused`, `reducedMotion` | — | — | Igual que en `KaiCharacter`. |

Expone `kai` (el `KaiController` del personaje) para llamar a `react`,
`track`, etc.

### Props de `KaiCharacter`

| Prop | Tipo | Por defecto | Descripción |
| --- | --- | --- | --- |
| `v-model:state` | `KaiState` | `'idle'` | Estado persistente. |
| `size` | `number \| 'sm' \| 'md' \| 'lg'` | `'md'` | Lado de la caja (48 / 120 / 240 px). Por debajo de 64 px el movimiento se contiene. |
| `colors` | `Partial<KaiColors>` | colores de Kiub | `primary`, `secondary`, `accent` (tercer color del degradado) y `blush`. |
| `mouth` | `boolean` | `false` | Boca integrada en estados y reacciones. |
| `blush` | `boolean` | `true` | Rubor en las emociones. |
| `ambient` | `boolean` | `true` | Lóbulos y motas en reposo (apagar en tamaños mínimos). |
| `playful` | `boolean` | `false` | Juegos: marearlo dando vueltas con el cursor y cosquillas al pulsarlo. |
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

### Eventos

`state-change` (`{ from, to }`), `reaction-start` (`{ name }`) y
`reaction-end` (`{ name, interrupted }`).

## Estados

| Estado | Clave | Cómo se distingue |
| --- | --- | --- |
| Reposo | `idle` | Flota y respira; cada ~15 s le salen un lóbulo grande abajo a la izquierda y otro pequeño al lado, y entre ciclos una gotita brota arriba, se suelta, flota y vuelve. Dos motas orbitan. |
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
| Mareado | `dizzy` | Ojos de espiral, tambaleo y estrellas en órbita. |
| Explorar | `explore` | Viaja a un lado con una gota rezagada y vuelve. |
| Bostezo | `yawn` | Se estira hacia arriba con la boca muy abierta. |
| Rebote | `boing` | Aplastamiento y estiramiento rápido (también al cambiar de tamaño). |

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

- **Marearlo**: con `playful`, si el cursor da unas dos vueltas y media
  seguidas alrededor de KAI (dentro de una zona cercana), se marea unos
  segundos. Después descansa 5 s antes de poder marearse otra vez. El listener
  es pasivo y solo existe mientras KAI es visible.
- **Cosquillas**: un clic o toque lo hace reír.

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
- Coste medido en Chromium: ~0,6 ms por fotograma en reposo a 300 px, ~0,25 ms
  a 112 px; la galería del laboratorio (25 instancias) se mantiene en ~56–60 fps.

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
  Para la intranet basta con añadir `<KaiDock>` una vez en el layout principal.
- **Validación.** Probado en Chromium (escritorio y móvil emulado) sobre el
  starter kit oficial de Laravel + Inertia v3 + Vue con `AppHeader.vue`, porque
  este repositorio es un extracto. Falta comprobarlo en Safari y Firefox y en el
  repositorio completo de Kiub. No hay backend implicado (SQL Server no
  interviene).
- **Ruta.** El enlace de las migas usa `'/dev/kai'` literal; puede sustituirse
  por el helper que genere Wayfinder para `dev.kai`.
- **Fuente.** El laboratorio declara Raleway y depende de que la aplicación la
  cargue (como el resto de Kiub).
