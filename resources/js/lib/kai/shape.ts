/**
 * Contorno del cuerpo principal de KAI.
 *
 * Nace de una función radial r(θ) (círculo + armónicos orgánicos +
 * protuberancias + hervor), se normaliza para conservar el área y después se
 * comprime, inclina y gira. El resultado alimenta el campo de metabolas
 * (`field.ts`), que lo funde con lóbulos, manos y gotas.
 */

/** Radio en reposo, en unidades del viewBox. */
export const R = 50;

/** Caja de dibujo: el cuerpo ocupa ~70 %; gestos y gotas pueden desbordar. */
export const VIEWBOX = '-72 -80 144 144';

/** Puntos de control del contorno radial. */
export const POINTS = 40;

const TAU = Math.PI * 2;

/** Área del polígono regular de POINTS lados inscrito en el círculo unidad. */
const UNIT_AREA = (POINTS / 2) * Math.sin(TAU / POINTS);

/** Irregularidad propia de KAI: lo que le hace reconocible en reposo. */
const SIGNATURE = [
    { k: 2, a: 0.018, p: 0.7 },
    { k: 3, a: 0.012, p: 2.4 },
    { k: 5, a: 0.004, p: 4.1 },
];

/** Ondulación lenta y viva; las velocidades son rev/s. */
const WOBBLE = [
    { k: 2, a: 0.011, s: 0.09, p: 0.3 },
    { k: 3, a: 0.009, s: -0.07, p: 1.9 },
    { k: 4, a: 0.006, s: 0.11, p: 3.7 },
    { k: 5, a: 0.004, s: -0.14, p: 5.2 },
];

/** Hervor: ondas cortas y rápidas que recorren el borde (procesando). */
const BOIL = [
    { k: 5, a: 0.018, s: 0.55, p: 0.4 },
    { k: 7, a: 0.013, s: -0.7, p: 2.2 },
    { k: 9, a: 0.008, s: 0.9, p: 4.4 },
    { k: 3, a: 0.012, s: -0.35, p: 1.1 },
];

export type BodyShape = {
    x: number;
    y: number;
    sx: number;
    lean: number;
    rot: number;
    bx: number;
    by: number;
    flat: number;
    scale: number;
    wob: number;
    ripple: number;
    boil: number;
    /** Estiramiento vertical anclado en la base (0-1). */
    pull: number;
    /** Tiempo del motor, en segundos. */
    t: number;
    /**
     * Ondas que recorren el contorno desde un impacto (ángulo local, edad en
     * s y amplitud en radios): dos frentes que se separan y se apagan.
     */
    waves?: { angle: number; age: number; amp: number }[];
};

export type Vec = { x: number; y: number };

/**
 * Transformación del espacio «cuerpo» (círculo unidad centrado) al viewBox.
 * Se comparte con el rostro para que siga la deformación.
 */
export class BodyTransform {
    private sx = 1;
    private sy = 1;
    private lean = 0;
    private cos = 1;
    private sin = 0;
    private tx = 0;
    private ty = 0;

    private scale = 1;

    set(s: BodyShape): void {
        // Estirado se alarga hacia arriba y adelgaza (como goma).
        const pull = 1 + s.pull * 0.45;
        this.sx = s.sx / Math.pow(pull, 0.75);
        this.sy = pull / s.sx;
        this.scale = s.scale;
        this.lean = s.lean;
        this.cos = Math.cos(s.rot);
        this.sin = Math.sin(s.rot);
        this.tx = s.x * R;
        this.ty = s.y * R;
    }

    /** Punto en unidades del cuerpo (radio 1) → viewBox. */
    apply(ux: number, uy: number, out: Vec): Vec {
        // Comprimir y estirar con pivote en la base (y = R).
        let x = ux * R * this.sx;
        let y = R + (uy * R - R) * this.sy;
        // Cizalla: la parte alta se desplaza más que la base.
        x += this.lean * (R - y);
        // La escala global encoge alrededor del centro, no de la base.
        const cy = R - R * this.sy;
        x *= this.scale;
        y = cy + (y - cy) * this.scale;
        // Giro alrededor del centro del cuerpo.
        const dy = y;
        out.x = x * this.cos - dy * this.sin + this.tx;
        out.y = x * this.sin + dy * this.cos + this.ty;

        return out;
    }

    /** Matriz lineal (sin traslación) suavizada para el rostro. */
    faceMatrix(follow: number): [number, number, number, number] {
        const sx = Math.pow(this.sx, follow) * this.scale;
        const sy = Math.pow(this.sy, follow) * this.scale;
        const k = -this.lean * follow;
        const a = sx;
        const c = k * sy;
        const d = sy;

        return [
            this.cos * a,
            this.sin * a,
            this.cos * c - this.sin * d,
            this.sin * c + this.cos * d,
        ];
    }
}

/** Velocidad angular de las ondas de impacto (rad/s). */
const WAVE_SPEED = 3.6;

function wrap(angle: number): number {
    return Math.atan2(Math.sin(angle), Math.cos(angle));
}

/**
 * Calcula el contorno en unidades del cuerpo (radio ~1, área normalizada).
 * `local` recibe 2·POINTS valores (x, y) intercalados, empezando arriba.
 */
export function computeLocalContour(s: BodyShape, local: Float64Array): void {
    const mag = Math.hypot(s.bx, s.by);
    const dir = Math.atan2(s.by, s.bx);
    const t = s.t;

    for (let i = 0; i < POINTS; i++) {
        const th = (i / POINTS) * TAU - Math.PI / 2;
        let r = 1;

        for (const h of SIGNATURE) {
            r += h.a * Math.sin(h.k * th + h.p);
        }

        for (const h of WOBBLE) {
            r += s.wob * h.a * Math.sin(h.k * th + h.p + h.s * TAU * t);
        }

        if (s.boil) {
            for (const h of BOIL) {
                r += s.boil * h.a * Math.sin(h.k * th + h.p + h.s * TAU * t);
            }
        }

        if (s.ripple) {
            r +=
                s.ripple *
                (0.045 * Math.sin(3 * th - 1.35 * t) +
                    0.022 * Math.sin(2 * th + 0.85 * t + 1.1));
        }

        if (s.waves) {
            for (const w of s.waves) {
                // Sube rápido, se apaga despacio y se ensancha al viajar.
                const a =
                    w.amp *
                    (1 - Math.exp(-w.age / 0.05)) *
                    Math.exp(-w.age * 2.4);
                const spread = 0.42 + 0.3 * w.age;
                const d1 = wrap(th - w.angle - WAVE_SPEED * w.age);
                const d2 = wrap(th - w.angle + WAVE_SPEED * w.age);
                const k = 2 * spread * spread;
                r +=
                    a *
                    0.5 *
                    (Math.exp(-(d1 * d1) / k) + Math.exp(-(d2 * d2) / k));
            }
        }

        if (mag > 1e-4) {
            const d = wrap(th - dir);
            const back = wrap(th - dir - Math.PI);
            // La masa se desplaza: crece hacia un lado y cede un poco del otro.
            r += mag * Math.exp(-(d * d) / (2 * 0.6 * 0.6));
            r -= mag * 0.35 * Math.exp(-(back * back) / (2 * 0.9 * 0.9));
        }

        let x = r * Math.cos(th);
        let y = r * Math.sin(th);

        if (s.flat && y > 0) {
            const k = y * y;
            y *= 1 - s.flat * 0.17 * k;
            x *= 1 + s.flat * 0.07 * k;
        }

        local[i * 2] = x;
        local[i * 2 + 1] = y;
    }

    // Normalizar el área para que deformarse no sea «engordar».
    const area = polygonArea(local, POINTS);
    const k = Math.sqrt(UNIT_AREA / Math.max(area, 1e-6));

    for (let i = 0; i < POINTS * 2; i++) {
        local[i] *= k;
    }
}

export function polygonArea(pts: Float64Array, n: number): number {
    let sum = 0;

    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        sum += pts[i * 2] * pts[j * 2 + 1] - pts[j * 2] * pts[i * 2 + 1];
    }

    return Math.abs(sum) / 2;
}

/** Relación entre el área del cuerpo y la del círculo en reposo. */
export function areaRatio(world: Float64Array): number {
    return polygonArea(world, POINTS) / (UNIT_AREA * R * R);
}

/** Radio del contorno local en una dirección (interpolado). */
export function localRadiusAt(local: Float64Array, angle: number): number {
    const u = ((((angle + Math.PI / 2) / TAU) % 1) + 1) % 1;
    const f = u * POINTS;
    const i = Math.floor(f) % POINTS;
    const j = (i + 1) % POINTS;
    const ri = Math.hypot(local[i * 2], local[i * 2 + 1]);
    const rj = Math.hypot(local[j * 2], local[j * 2 + 1]);

    return ri + (rj - ri) * (f - Math.floor(f));
}
