/**
 * Colores de KAI.
 *
 * Cuatro colores base configurables; el resto de tonos (profundo, claro,
 * borde) se derivan mezclándolos con blanco y con el oscuro de Kiub.
 */

export type KaiColors = {
    /** Azul principal del cuerpo. */
    primary: string;
    /** Azul grisáceo: borde translúcido y estados que piden atención. */
    secondary: string;
    /** Tercer color del degradado que fluye dentro del cuerpo. */
    accent: string;
    /** Rubor bajo los ojos. */
    blush: string;
};

export const KAI_INK = '#151924';

export const KAI_DEFAULT_COLORS: KaiColors = {
    primary: '#5c9dff',
    secondary: '#a9c1d3',
    accent: '#9b82ff',
    blush: '#ff9cc8',
};

export type KaiPalettePreset = { id: string; label: string; colors: KaiColors };

export const KAI_PRESETS: KaiPalettePreset[] = [
    { id: 'kiub', label: 'Kiub (original)', colors: KAI_DEFAULT_COLORS },
    {
        id: 'aurora',
        label: 'Aurora',
        colors: {
            primary: '#5c8dff',
            secondary: '#a9c1d3',
            accent: '#b77dff',
            blush: '#ff8fc0',
        },
    },
    {
        id: 'cielo',
        label: 'Cielo',
        colors: {
            primary: '#5c9dff',
            secondary: '#a9c1d3',
            accent: '#6fd0ff',
            blush: '#ffa3c4',
        },
    },
    {
        id: 'sereno',
        label: 'Sereno',
        colors: {
            primary: '#5c9dff',
            secondary: '#a9c1d3',
            accent: '#a9c1d3',
            blush: '#f5a9c4',
        },
    },
];

function parse(hex: string): [number, number, number] {
    const h = hex.replace('#', '');
    const full =
        h.length === 3
            ? h
                  .split('')
                  .map((c) => c + c)
                  .join('')
            : h.padEnd(6, '0').slice(0, 6);
    const n = Number.parseInt(full, 16);

    return Number.isNaN(n)
        ? [92, 157, 255]
        : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hex([r, g, b]: [number, number, number]): string {
    return `#${[r, g, b]
        .map((v) =>
            Math.round(Math.min(255, Math.max(0, v)))
                .toString(16)
                .padStart(2, '0'),
        )
        .join('')}`;
}

/** Mezcla `a` hacia `b` en proporción `t` (0-1). */
export function mix(a: string, b: string, t: number): string {
    const x = parse(a);
    const y = parse(b);

    return hex([
        x[0] + (y[0] - x[0]) * t,
        x[1] + (y[1] - x[1]) * t,
        x[2] + (y[2] - x[2]) * t,
    ]);
}

export function isHexColor(value: string): boolean {
    return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value);
}

/** Variables CSS que consume el dibujo del personaje. */
export function paletteVars(colors: KaiColors): Record<string, string> {
    const { primary, secondary, accent, blush } = colors;

    return {
        '--kai-primary': primary,
        '--kai-secondary': secondary,
        '--kai-accent': accent,
        '--kai-blush': blush,
        '--kai-deep': mix(mix(primary, accent, 0.3), KAI_INK, 0.2),
        '--kai-mid': mix(primary, '#ffffff', 0.22),
        '--kai-light': mix(primary, '#ffffff', 0.6),
        '--kai-accent-light': mix(accent, '#ffffff', 0.45),
        '--kai-rim': mix(secondary, '#ffffff', 0.55),
        '--kai-halo': mix(mix(primary, accent, 0.4), KAI_INK, 0.55),
        '--kai-shadow': primary,
    };
}
