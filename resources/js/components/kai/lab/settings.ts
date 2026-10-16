import { KAI_DEFAULT_COLORS, isHexColor } from '@/lib/kai/palette';
import type { KaiColors } from '@/lib/kai/palette';
import type { KaiDockSize, KaiReducedMotion } from '@/lib/kai/types';

/** Ajustes exclusivos del laboratorio. */
export type LabSettings = {
    paused: boolean;
    motion: KaiReducedMotion;
    intensity: number;
    timeScale: number;
    followPointer: boolean;
    debug: boolean;
    surface: 'light' | 'dark';
    mouth: boolean;
    blush: boolean;
    ambient: boolean;
    playful: boolean;
    colors: KaiColors;
    dock: boolean;
    dockSize: KaiDockSize;
    overscroll: boolean;
    /** Segundos sin actividad hasta que el KAI flotante se duerme (0 = nunca). */
    dockSleep: number;
};

export const DEFAULT_SETTINGS: LabSettings = {
    paused: false,
    motion: 'auto',
    intensity: 1,
    timeScale: 1,
    followPointer: false,
    debug: false,
    surface: 'light',
    mouth: false,
    blush: true,
    ambient: true,
    playful: true,
    colors: { ...KAI_DEFAULT_COLORS },
    dock: true,
    dockSize: 'normal',
    overscroll: true,
    dockSleep: 30,
};

const COLOR_KEY = 'kiub.kai-lab.colors';

/** Colores guardados en este navegador (solo comodidad del laboratorio). */
export function loadLabColors(): KaiColors {
    try {
        const raw = window.localStorage.getItem(COLOR_KEY);
        const saved = raw ? (JSON.parse(raw) as Partial<KaiColors>) : {};
        const colors = { ...KAI_DEFAULT_COLORS };

        for (const key of Object.keys(colors) as (keyof KaiColors)[]) {
            const value = saved[key];

            if (typeof value === 'string' && isHexColor(value)) {
                colors[key] = value;
            }
        }

        return colors;
    } catch {
        return { ...KAI_DEFAULT_COLORS };
    }
}

export function saveLabColors(colors: KaiColors): void {
    try {
        window.localStorage.setItem(COLOR_KEY, JSON.stringify(colors));
    } catch {
        // Sin almacenamiento disponible: los colores duran lo que la visita.
    }
}
