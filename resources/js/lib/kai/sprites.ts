/**
 * Partículas decorativas: notas, corazones, zetas y destellos. No forman parte
 * del fluido; nacen cerca del cuerpo, flotan y se desvanecen.
 */

export type SpriteKind = 'note' | 'notes' | 'heart' | 'z' | 'star' | 'dot';

/** Trazados en una caja de ~2×2 centrada en 0,0. */
export const SPRITE_PATHS: Record<SpriteKind, string> = {
    note:
        'M-0.67 0.55 A0.42 0.32 -20 1 0 0.17 0.55 A0.42 0.32 -20 1 0 -0.67 0.55Z' +
        'M0.03 0.52 L0.03 -1 L0.19 -1 L0.19 0.52Z' +
        'M0.19 -1 Q0.32 -0.55 0.8 -0.42 Q0.6 -0.18 0.72 0.1 Q0.92 -0.52 0.19 -0.7Z',
    notes:
        'M-1.11 0.6 A0.36 0.27 -20 1 0 -0.39 0.6 A0.36 0.27 -20 1 0 -1.11 0.6Z' +
        'M0.09 0.45 A0.36 0.27 -20 1 0 0.81 0.45 A0.36 0.27 -20 1 0 0.09 0.45Z' +
        'M-0.52 0.55 L-0.52 -0.85 L-0.38 -0.85 L-0.38 0.55Z' +
        'M0.68 0.4 L0.68 -1 L0.82 -1 L0.82 0.4Z' +
        'M-0.52 -0.85 L0.82 -1 L0.82 -0.72 L-0.52 -0.57Z',
    heart: 'M0 0.85 C-0.2 0.68 -1 0.15 -0.95 -0.32 C-0.9 -0.85 -0.2 -0.95 0 -0.42 C0.2 -0.95 0.9 -0.85 0.95 -0.32 C1 0.15 0.2 0.68 0 0.85Z',
    z: 'M-0.6 -0.62 L0.6 -0.62 L-0.6 0.62 L0.6 0.62',
    star: 'M0 -1 Q0.12 -0.12 1 0 Q0.12 0.12 0 1 Q-0.12 0.12 -1 0 Q-0.12 -0.12 0 -1Z',
    dot: 'M0 -1 A1 1 0 1 1 0 1 A1 1 0 1 1 0 -1Z',
};

/** Las zetas se dibujan con trazo; el resto con relleno. */
export const STROKED: Record<SpriteKind, boolean> = {
    note: false,
    notes: false,
    heart: false,
    z: true,
    star: false,
    dot: false,
};

export type Sprite = {
    active: boolean;
    kind: SpriteKind;
    x: number;
    y: number;
    vx: number;
    vy: number;
    /** Aceleración vertical (negativa: sube). */
    ay: number;
    size: number;
    rot: number;
    spin: number;
    age: number;
    life: number;
    /** Balanceo lateral mientras sube. */
    sway: number;
    phase: number;
    /** Variante de color (0 primario, 1 acento, 2 rubor, 3 claro). */
    tint: number;
    /** Órbita alrededor de un punto que acompaña al cuerpo (0 = libre). */
    orbit: number;
    orbitW: number;
    orbitPhase: number;
};

export type EmitOptions = {
    x: number;
    y: number;
    vx?: number;
    vy?: number;
    ay?: number;
    size?: number;
    life?: number;
    spin?: number;
    sway?: number;
    tint?: number;
    rot?: number;
    orbit?: number;
    orbitW?: number;
    orbitPhase?: number;
};

export const MAX_SPRITES = 12;

export function createSprites(): Sprite[] {
    return Array.from({ length: MAX_SPRITES }, () => ({
        active: false,
        kind: 'dot' as SpriteKind,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        ay: 0,
        size: 1,
        rot: 0,
        spin: 0,
        age: 0,
        life: 1,
        sway: 0,
        phase: 0,
        tint: 0,
        orbit: 0,
        orbitW: 0,
        orbitPhase: 0,
    }));
}

export function emitSprite(
    pool: Sprite[],
    kind: SpriteKind,
    o: EmitOptions,
    random: () => number,
): void {
    // Reutiliza la más vieja si no queda hueco.
    let slot = pool.find((s) => !s.active);

    if (!slot) {
        slot = pool.reduce((a, b) => (a.age / a.life > b.age / b.life ? a : b));
    }

    Object.assign(slot, {
        active: true,
        kind,
        x: o.x,
        y: o.y,
        vx: o.vx ?? 0,
        vy: o.vy ?? -12,
        ay: o.ay ?? 0,
        size: o.size ?? 5,
        rot: o.rot ?? (random() - 0.5) * 0.6,
        spin: o.spin ?? (random() - 0.5) * 1.2,
        age: 0,
        life: o.life ?? 1.6,
        sway: o.sway ?? 0,
        phase: random() * Math.PI * 2,
        tint: o.tint ?? 0,
        orbit: o.orbit ?? 0,
        orbitW: o.orbitW ?? 0,
        orbitPhase: o.orbitPhase ?? 0,
    });
}

/**
 * Avanza las partículas. Las que orbitan guardan en `x`/`y` su centro de giro
 * relativo al cuerpo, y su posición final la calcula `spritePosition`.
 */
export function updateSprites(pool: Sprite[], dt: number): void {
    for (const s of pool) {
        if (!s.active) {
            continue;
        }

        s.age += dt;

        if (s.age >= s.life) {
            s.active = false;
            continue;
        }

        s.vy += s.ay * dt;
        s.x += (s.vx + Math.cos(s.age * 5 + s.phase) * s.sway) * dt;
        s.y += s.vy * dt;
        s.rot += s.spin * dt;
    }
}

export function spritePosition(
    s: Sprite,
    cx: number,
    cy: number,
): { x: number; y: number } {
    if (!s.orbit) {
        return { x: s.x, y: s.y };
    }

    const a = s.orbitPhase + s.age * s.orbitW;

    return {
        x: cx + s.x + Math.cos(a) * s.orbit,
        y: cy + s.y + Math.sin(a) * s.orbit * 0.35,
    };
}

/** Opacidad y escala con entrada y salida suaves. */
export function spriteFade(s: Sprite): { opacity: number; scale: number } {
    const t = s.age / s.life;
    const fadeIn = Math.min(1, t / 0.15);
    const fadeOut = Math.min(1, (1 - t) / 0.35);
    const pop = 1 - Math.pow(1 - fadeIn, 3);

    return { opacity: Math.min(fadeIn, fadeOut), scale: 0.4 + 0.6 * pop };
}
