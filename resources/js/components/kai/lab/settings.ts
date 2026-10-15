import type { KaiReducedMotion } from '@/lib/kai/types';

/** Ajustes exclusivos del laboratorio. */
export type LabSettings = {
    paused: boolean;
    motion: KaiReducedMotion;
    intensity: number;
    timeScale: number;
    followPointer: boolean;
    debug: boolean;
    surface: 'light' | 'dark';
};

export const DEFAULT_SETTINGS: LabSettings = {
    paused: false,
    motion: 'auto',
    intensity: 1,
    timeScale: 1,
    followPointer: false,
    debug: false,
    surface: 'light',
};
