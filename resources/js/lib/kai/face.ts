/**
 * Rostro de KAI: ojos, boca y rubor.
 *
 * Los ojos son trazos con extremos redondeados. Un solo parámetro (`close`)
 * los lleva de la cápsula vertical a un trazo horizontal pasando por un punto,
 * y `bend` curva ese trazo: +1 «◠» alegre, 0 «—» cerrado, -1 «◡» contento.
 */

import { R } from './shape';

/** Medidas base relativas a R (tomadas de la propuesta aprobada). */
export const EYE = {
    width: 0.105,
    height: 0.235,
    /** Separación angular de cada ojo sobre la «esfera» de la cara (rad). */
    spread: 0.27,
    y: -0.04,
};

/** Radio de la esfera imaginaria sobre la que se mueven ojos y boca. */
export const FACE_RADIUS = 0.92;

function n2(v: number): string {
    return (Math.round(v * 100) / 100).toString();
}

export type EyeStroke = { d: string; width: number };

export function eyeStroke(
    close: number,
    bend: number,
    heightScale: number,
    widthScale: number,
): EyeStroke {
    const w = EYE.width * R * widthScale;
    const half = Math.max(0, (EYE.height * R * heightScale - w) / 2);
    const c = Math.min(1.1, Math.max(0, close));

    if (c <= 0.5) {
        const hl = half * (1 - c / 0.5);

        return {
            d: `M0 ${n2(-hl)}L0 ${n2(hl + 0.001)}`,
            width: w * (1 - 0.15 * (c / 0.5)),
        };
    }

    const v = (c - 0.5) / 0.5;
    const aw = w * 1.25 * v;
    // Extremos y punto de control opuestos según la curvatura.
    const ends = w * 0.42 * bend * v;
    const ctrl = -w * 0.95 * bend * v;
    const shift = -w * 0.1 * bend * v;

    return {
        d: `M${n2(-aw)} ${n2(ends + shift)}Q0 ${n2(ctrl + shift)} ${n2(aw)} ${n2(ends + shift)}`,
        width: w * (0.85 - 0.07 * Math.min(1, v)),
    };
}

/** Espiral de mareo (se gira con `transform`). Radio ~1 en unidades de ojo. */
export function spiralPath(size: number): string {
    let d = '';
    const turns = 2.4;
    const steps = 42;

    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const a = t * turns * Math.PI * 2;
        const r = size * (0.08 + 0.92 * t);
        d += `${i ? 'L' : 'M'}${n2(Math.cos(a) * r)} ${n2(Math.sin(a) * r)}`;
    }

    return d;
}

/** Corazón relleno centrado en 0,0 con alto ~2·size. */
export function heartPath(size: number): string {
    const s = size;

    return (
        `M0 ${n2(s * 0.95)}` +
        `C${n2(-s * 0.2)} ${n2(s * 0.75)} ${n2(-s * 1.15)} ${n2(s * 0.15)} ${n2(-s * 1.05)} ${n2(-s * 0.35)}` +
        `C${n2(-s * 0.95)} ${n2(-s * 0.95)} ${n2(-s * 0.2)} ${n2(-s * 1.05)} 0 ${n2(-s * 0.45)}` +
        `C${n2(s * 0.2)} ${n2(-s * 1.05)} ${n2(s * 0.95)} ${n2(-s * 0.95)} ${n2(s * 1.05)} ${n2(-s * 0.35)}` +
        `C${n2(s * 1.15)} ${n2(s * 0.15)} ${n2(s * 0.2)} ${n2(s * 0.75)} 0 ${n2(s * 0.95)}Z`
    );
}

export type MouthShape = {
    /** -1 triste … +1 sonrisa. */
    smile: number;
    /** 0 cerrada … 1 muy abierta. */
    open: number;
    /** Ancho relativo (1 = normal). */
    wide: number;
    /** Ondulada (mareo, duda). */
    wave: number;
    /** Boca de gatito «w». */
    cat: number;
};

export type MouthPaths = { d: string; tongue: string; stroke: number };

/**
 * Boca como una lente: labio superior y labio inferior. Cerrada, los dos
 * coinciden y se ve como un trazo; abierta, se rellena por dentro.
 */
export function mouthPath(m: MouthShape): MouthPaths {
    const w = R * 0.17 * Math.max(0.3, m.wide);
    const steps = 12;
    const top: [number, number][] = [];
    const bottom: [number, number][] = [];
    const open = Math.max(0, m.open);

    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = (t - 0.5) * w;
        const arc = 4 * t * (1 - t);
        let y = m.smile * 0.3 * w * arc;
        y += m.cat * 0.16 * w * Math.abs(Math.sin(2 * Math.PI * t));
        y += m.wave * 0.08 * w * Math.sin(4 * Math.PI * t);
        top.push([x, y - open * 0.08 * w * arc]);
        bottom.push([
            x,
            y + open * 0.62 * w * Math.pow(Math.sin(Math.PI * t), 0.8),
        ]);
    }

    let d = `M${n2(top[0][0])} ${n2(top[0][1])}`;

    for (let i = 1; i <= steps; i++) {
        d += `L${n2(top[i][0])} ${n2(top[i][1])}`;
    }

    for (let i = steps; i >= 0; i--) {
        d += `L${n2(bottom[i][0])} ${n2(bottom[i][1])}`;
    }

    const ty = bottom[steps / 2][1];
    const tr = w * 0.22 * Math.min(1, open * 1.4);
    const tongue = `M${n2(-tr)} ${n2(ty)}A${n2(tr)} ${n2(tr * 0.75)} 0 0 1 ${n2(tr)} ${n2(ty)}Z`;

    return { d: `${d}Z`, tongue, stroke: R * 0.036 };
}
