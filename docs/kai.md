# KAI · la presencia viva de Kiub

Primera versión del personaje y de su sistema de interacción. Está encapsulada:
solo aparece en el laboratorio de desarrollo y no se muestra en ninguna página
de colaboradores.

## Abrir el laboratorio

1. Copia `routes/dev.php` en el proyecto e inclúyelo al final de `routes/web.php`:

    ```php
    require __DIR__.'/dev.php';
    ```

2. Con `APP_ENV=local`, inicia sesión y abre **`/dev/kai`**.

La ruta solo se registra en el entorno local (con `route:cache` en producción no
existe), usa los middleware `auth` y `verified`, y no está enlazada desde la
navegación.

## Archivos

| Archivo | Responsabilidad |
| --- | --- |
| `resources/js/components/kai/KaiCharacter.vue` | Dibujo SVG, ciclo de vida, accesibilidad y API pública. |
| `resources/js/lib/kai/shape.ts` | Geometría: contorno, conservación del área, spline, ojos, puente de gotas. |
| `resources/js/lib/kai/motion.ts` | Parámetros de movimiento: canales de pose, muelles, tiempos. |
| `resources/js/lib/kai/states.ts` | Estados y reacciones (pose, entrada escalonada, comportamiento). |
| `resources/js/lib/kai/engine.ts` | Motor: transiciones, interrupciones, eventos, composición del fotograma. |
| `resources/js/lib/kai/ticker.ts` | Un único `requestAnimationFrame` compartido por todas las instancias. |
| `resources/js/lib/kai/types.ts`, `catalog.ts` | Tipos públicos y textos de la interfaz. |
| `resources/js/pages/dev/KaiLab.vue` | Página del laboratorio. |
| `resources/js/components/kai/lab/*` | Controles, galería, tamaños, demostración contextual y secuencias (solo laboratorio). |
| `routes/dev.php` | Ruta local del laboratorio. |

No añade dependencias: usa Vue, `@vueuse/core` (ya presente en el proyecto) y SVG.

## Por qué SVG

- Vectorial: nítido de 40 a 260 px sin recursos por tamaño.
- Ligero: cada fotograma solo reescribe unos pocos atributos (`d`, `transform`);
  Vue no vuelve a renderizar.
- Fácil de tematizar con variables CSS (`--kai-*`) y de inspeccionar.
- Canvas exigiría gestionar la densidad de píxeles y repintar a mano; WebGL
  (metaballs) sería más espectacular pero más pesado, con límite de contextos
  por página y más difícil de mantener a esta escala.

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

### Props

| Prop | Tipo | Por defecto | Descripción |
| --- | --- | --- | --- |
| `v-model:state` | `KaiState` | `'idle'` | Estado persistente. |
| `size` | `number \| 'sm' \| 'md' \| 'lg'` | `'md'` | Lado de la caja (48 / 120 / 240 px). Por debajo de 64 px el movimiento se contiene. |
| `intensity` | `number` | `1` | Amplitud de los gestos (0–1.5). No altera la forma de los ojos. |
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

| Estado | Clave | Tipo | Cómo se distingue |
| --- | --- | --- | --- |
| Reposo | `idle` | persistente | Casi circular, respiración de 4,2 s (±1,1 %), parpadeo cada 2,6–6 s, miradas breves. |
| Atento | `attentive` | persistente | Los ojos van primero hacia la interacción; la masa se inclina después siguiendo a los ojos. |
| Curioso | `curious` | persistente | Protuberancia lateral y cuerpo estirado hacia la mirada; ojo cercano mayor; pequeños «asomos» periódicos. |
| Pensando | `thinking` | persistente | Ondulación lenta que recorre el contorno; mirada hacia arriba que deriva. |
| Trabajando | `working` | persistente | Pulso regular (1,05 s) de compresión y brillo interior; ojos entrecerrados, juntos y quietos. Se mantiene hasta que llega un resultado. |
| Duda | `doubt` | persistente | Mira arriba y luego inclina la masa; un ojo entrecerrado; leve tono azul grisáceo. |
| Error recuperable | `error` | persistente | Sobresalto contenido, retroceso suave inclinándose hacia atrás, base asentada, ojos abiertos hacia el mensaje, tono azul grisáceo. |
| Esperando | `waiting` | persistente | Se asienta (base plana, más ancho), ojos relajados mirando al usuario; mira a un lado cada 8–13 s, sin insistir. |
| Bienvenida | `welcome` | reacción | Se comprime, asciende con una gota que se separa, se balancea con ojos alegres y se asienta. |
| Alegre / éxito | `success` | reacción | Anticipación con ojos apretados, salto elástico, ojos en arco, dos gotas y aterrizaje gelatinoso. |
| Sorprendido | `surprised` | reacción | Estiramiento vertical breve con ojos más grandes y recuperación rápida. |

Reglas de transición:

- Cada canal (forma, mirada, ojos) persigue su objetivo con un muelle
  amortiguado: los cambios y las interrupciones nunca saltan.
- Los gestos programados viven en el reloj del motor (no hay `setTimeout`
  compitiendo) y se pausan con la animación.
- Un gesto nuevo corta el anterior; un cambio de estado distinto también. Pedir
  el estado al que el gesto ya iba a volver no lo corta.
- El área se normaliza en cada fotograma (100 % en reposo y en los gestos;
  96 % en el pulso de trabajo).

## Accesibilidad y rendimiento

- Con `prefers-reduced-motion` (o `reducedMotion="reduce"`): sin saltos,
  desplazamientos, gotas ni capas oscilantes; los estados se leen por los ojos y
  una inclinación estática, y el bucle se detiene por completo cuando no hay
  cambios.
- El personaje es decorativo por defecto (`aria-hidden`) y no tiene regiones
  `aria-live`. Los mensajes importantes (error, confirmación) deben ir en texto
  de la interfaz, como en la demostración contextual (`role="status"`).
- La animación se detiene fuera de la vista (IntersectionObserver), con la
  pestaña oculta y en pausa. Todas las instancias comparten un único
  `requestAnimationFrame`, que se cancela cuando no queda ninguna activa.
- La mirada solo sigue al puntero dentro del propio componente (o del escenario
  del laboratorio); en pantallas táctiles mira el punto tocado y vuelve.

## Limitaciones y ajustes pendientes

- **Referencia de movimiento.** El GIF de Interflow no llegó como animación: se
  recibió una cuadrícula estática de 9 fotogramas (WebP sin animación) en la
  que solo se aprecia un reposo casi inmóvil (área ±1 %, contorno ±2 px). El
  sistema de movimiento se basa en la descripción del encargo, no en
  movimientos observados en ese archivo.
- **Materialidad.** La translucidez se aproxima con degradados y un único
  desenfoque recortado al contorno; no hay refracción ni cáusticas reales como
  en el render de referencia. El centro cian de la propuesta se trasladó a
  azules de la paleta.
- **Tamaños pequeños.** Por debajo de ~48 px las asimetrías (curioso, duda) se
  leen poco; en ese tamaño conviene apoyarse en el texto de la interfaz.
- **Gotas.** El puente se calcula como un metaball anclado al contorno; en el
  instante de separación puede verse una cuña breve (1–2 fotogramas).
- **Por ajustar con diseño:** diferencia entre «duda» y «curioso» en tamaño
  medio, apertura de ojos en «trabajando», duración de la bienvenida y
  presencia de las gotas en el éxito.
- **Validación.** Probado en Chromium (escritorio y móvil emulado) sobre el
  starter kit oficial de Laravel + Inertia v3 + Vue con `AppHeader.vue`, porque
  este repositorio es un extracto. Falta comprobarlo en Safari y Firefox y en el
  repositorio completo de Kiub. No hay backend implicado (SQL Server no
  interviene).
- **Ruta.** El enlace de las migas usa `'/dev/kai'` literal; puede sustituirse
  por el helper que genere Wayfinder para `dev.kai`.
- **Fuente.** El laboratorio declara Raleway y depende de que la aplicación la
  cargue (como el resto de Kiub).
