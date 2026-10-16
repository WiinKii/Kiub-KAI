/**
 * Estiramiento al final del scroll.
 *
 * Al llegar al final de la página y seguir desplazando (rueda o dedo), el
 * contenido sube un poco con resistencia y `pull` (0-1) crece para que KAI se
 * estire con él. Al soltar, todo vuelve con un pequeño rebote.
 */
import { useEventListener } from '@vueuse/core';
import type { Ref } from 'vue';
import { onBeforeUnmount, ref } from 'vue';
import { springStep } from '@/lib/kai/motion';
import { subscribeTick } from '@/lib/kai/ticker';

type Options = {
    enabled: Ref<boolean>;
    /** Elemento que se desplaza (el contenido de la página). */
    target: () => HTMLElement | null;
    /** Desplazamiento máximo en px. */
    max?: number;
};

export function useKaiOverscroll({ enabled, target, max = 84 }: Options) {
    const pull = ref(0);
    let amount = 0;
    let offset = 0;
    let velocity = 0;
    let lastInput = 0;
    let touchY: number | null = null;
    let unsubscribe: (() => void) | null = null;

    function atBottom(): boolean {
        const el = document.scrollingElement ?? document.documentElement;

        return el.scrollTop + window.innerHeight >= el.scrollHeight - 2;
    }

    function apply(): void {
        const el = target();

        if (el) {
            el.style.transform =
                offset > 0.4
                    ? `translate3d(0, ${(-offset).toFixed(1)}px, 0)`
                    : '';
        }

        pull.value = Math.max(0, offset) / max;
    }

    function tick(dt: number): void {
        const releasing = performance.now() - lastInput > 140;

        if (releasing) {
            amount = 0;
        }

        // Resistencia: cuanto más se estira, menos cede.
        const goal = max * (1 - Math.exp(-amount / max));
        const spring = releasing ? { w: 13, z: 0.42 } : { w: 22, z: 0.95 };
        [offset, velocity] = springStep(
            offset,
            velocity,
            goal,
            spring,
            Math.min(dt, 0.05),
        );
        apply();

        if (releasing && Math.abs(offset) < 0.2 && Math.abs(velocity) < 0.5) {
            offset = 0;
            velocity = 0;
            apply();
            unsubscribe?.();
            unsubscribe = null;
        }
    }

    function push(delta: number): void {
        if (!enabled.value || delta <= 0 || !atBottom()) {
            return;
        }

        amount = Math.min(amount + delta, max * 4);
        lastInput = performance.now();
        unsubscribe ??= subscribeTick(tick);
    }

    useEventListener(
        window,
        'wheel',
        (event: WheelEvent) => push(event.deltaY * 0.45),
        { passive: true },
    );
    useEventListener(
        window,
        'touchstart',
        (event: TouchEvent) => {
            touchY = event.touches[0]?.clientY ?? null;
        },
        { passive: true },
    );
    useEventListener(
        window,
        'touchmove',
        (event: TouchEvent) => {
            const y = event.touches[0]?.clientY;

            if (touchY !== null && y !== undefined) {
                push((touchY - y) * 0.6);
                touchY = y;
            }
        },
        { passive: true },
    );
    useEventListener(
        window,
        'touchend',
        () => {
            touchY = null;
        },
        { passive: true },
    );

    onBeforeUnmount(() => {
        unsubscribe?.();
        offset = 0;
        apply();
    });

    return { pull };
}
