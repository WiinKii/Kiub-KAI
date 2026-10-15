/**
 * Geometría de KAI: contorno, transformaciones del cuerpo y trazo de los ojos.
 *
 * El contorno nace de una función radial r(θ) (círculo + armónicos orgánicos +
 * protuberancias), se normaliza para conservar el área y después se comprime,
 * inclina y gira alrededor de la base. El resultado se dibuja como una spline
 * cerrada de Bézier, así el borde es siempre continuo.
 */

/** Radio en reposo, en unidades del viewBox. */
export const R = 50;

/** Caja de dibujo: el cuerpo ocupa ~78 % y los gestos amplios desbordan. */
export const VIEWBOX = '-64 -70 128 128';

/** Puntos de control del contorno. */
export const POINTS = 28;

const TAU = Math.PI * 2;

/** Área del polígono regular de POINTS lados inscrito en el círculo unidad. */
const UNIT_AREA = (POINTS / 2) * Math.sin(TAU / POINTS);

/** Irregularidad propia de KAI: lo que le hace reconocible en reposo. */
const SIGNATURE = [
    { k: 2, a: 0.02, p: 0.7 },
    { k: 3, a: 0.014, p: 2.4 },
    { k: 5, a: 0.005, p: 4.1 },
];

/** Ondulación lenta y viva; las velocidades son rev/s. */
const WOBBLE = [
    { k: 2, a: 0.009, s: 0.07, p: 0.3 },
    { k: 3, a: 0.007, s: -0.055, p: 1.9 },
    { k: 4, a: 0.005, s: 0.09, p: 3.7 },
    { k: 5, a: 0.0035, s: -0.12, p: 5.2 },
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
    /** Tiempo del motor, en segundos. */
    t: number;
};

export type Vec = { x: number; y: number };

/**
 * Transformación del espacio "cuerpo" (círculo unidad centrado) al viewBox.
 * Se comparte con ojos y gotas para que sigan la deformación del contorno.
 */
export class BodyTransform {
    private sx = 1;
    private sy = 1;
    private lean = 0;
    private cos = 1;
    private sin = 0;
    private tx = 0;
    private ty = 0;

    set(s: BodyShape): void {
        this.sx = s.sx * s.scale;
        this.sy = s.scale / s.sx;
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
        // Giro alrededor de la base.
        const dy = y - R;
        const rx = x * this.cos - dy * this.sin;
        const ry = x * this.sin + dy * this.cos + R;
        out.x = rx + this.tx;
        out.y = ry + this.ty;

        return out;
    }

    /** Matriz lineal (sin traslación) suavizada para los ojos. */
    eyeMatrix(follow: number): [number, number, number, number] {
        const sx = Math.pow(this.sx, follow);
        const sy = Math.pow(this.sy, follow);
        const k = -this.lean * follow;
        // Escala → cizalla → giro.
        const a = sx;
        const b = 0;
        const c = k * sy;
        const d = sy;

        return [
            this.cos * a - this.sin * b,
            this.sin * a + this.cos * b,
            this.cos * c - this.sin * d,
            this.sin * c + this.cos * d,
        ];
    }
}

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

        if (s.ripple) {
            r +=
                s.ripple *
                (0.045 * Math.sin(3 * th - 1.35 * t) +
                    0.022 * Math.sin(2 * th + 0.85 * t + 1.1));
        }

        if (mag > 1e-4) {
            const d = wrap(th - dir);
            const back = wrap(th - dir - Math.PI);
            // La masa se desplaza: crece hacia un lado y cede un poco del otro.
            r += mag * Math.exp(-(d * d) / (2 * 0.55 * 0.55));
            r -= mag * 0.3 * Math.exp(-(back * back) / (2 * 0.9 * 0.9));
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

    // Normalizar el área para que deformarse no sea "engordar".
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

/** Relación entre el área dibujada y la del círculo en reposo. */
export function areaRatio(world: Float64Array): number {
    return polygonArea(world, POINTS) / (UNIT_AREA * R * R);
}

function n2(v: number): string {
    return (Math.round(v * 100) / 100).toString();
}

/** Spline Catmull-Rom cerrada convertida a curvas cúbicas. */
export function smoothClosedPath(pts: Float64Array, n: number): string {
    let d = `M${n2(pts[0])} ${n2(pts[1])}`;

    for (let i = 0; i < n; i++) {
        const i0 = ((i - 1 + n) % n) * 2;
        const i1 = i * 2;
        const i2 = ((i + 1) % n) * 2;
        const i3 = ((i + 2) % n) * 2;
        const c1x = pts[i1] + (pts[i2] - pts[i0]) / 6;
        const c1y = pts[i1 + 1] + (pts[i2 + 1] - pts[i0 + 1]) / 6;
        const c2x = pts[i2] - (pts[i3] - pts[i1]) / 6;
        const c2y = pts[i2 + 1] - (pts[i3 + 1] - pts[i1 + 1]) / 6;
        d += `C${n2(c1x)} ${n2(c1y)} ${n2(c2x)} ${n2(c2y)} ${n2(pts[i2])} ${n2(pts[i2 + 1])}`;
    }

    return `${d}Z`;
}

/** Punto del contorno local en una dirección (interpolado). */
export function localRadiusAt(local: Float64Array, angle: number): number {
    const u = ((((angle + Math.PI / 2) / TAU) % 1) + 1) % 1;
    const f = u * POINTS;
    const i = Math.floor(f) % POINTS;
    const j = (i + 1) % POINTS;
    const ri = Math.hypot(local[i * 2], local[i * 2 + 1]);
    const rj = Math.hypot(local[j * 2], local[j * 2 + 1]);

    return ri + (rj - ri) * (f - Math.floor(f));
}

/**
 * Puente tipo metaball entre el cuerpo (aproximado como círculo local) y una
 * gota. Devuelve '' cuando ya están separados.
 */
/**
 * Punto donde un rayo desde `c` corta el contorno (polígono de control).
 * El cuerpo es estrellado respecto a su centro: solo hay un corte.
 */
export function rayHit(
    pts: Float64Array,
    n: number,
    c: Vec,
    angle: number,
): Vec {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let best = 0;

    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const ax = pts[i * 2] - c.x;
        const ay = pts[i * 2 + 1] - c.y;
        const ex = pts[j * 2] - pts[i * 2];
        const ey = pts[j * 2 + 1] - pts[i * 2 + 1];
        const den = dx * ey - dy * ex;

        if (Math.abs(den) < 1e-9) {
            continue;
        }

        const t = (ax * ey - ay * ex) / den;
        const u = (ax * dy - ay * dx) / den;

        if (t > best && u >= 0 && u <= 1) {
            best = t;
        }
    }

    return { x: c.x + dx * best, y: c.y + dy * best };
}

/**
 * Puente tipo metaball entre el cuerpo y una gota. Si se da `surface`, los
 * extremos se anclan al contorno real (el cuerpo deformado no es un círculo).
 * Devuelve '' cuando ya están separados.
 */
export function bridgePath(
    c1: Vec,
    r1: number,
    c2: Vec,
    r2: number,
    surface?: (angle: number) => Vec,
    spread = 0.56,
    handle = 2.4,
): string {
    const d = Math.hypot(c2.x - c1.x, c2.y - c1.y);
    const maxDist = r1 + r2 * 2.6;

    if (r2 < 0.3 || d > maxDist || d <= Math.abs(r1 - r2)) {
        return '';
    }

    let u1 = 0;
    let u2 = 0;

    if (d < r1 + r2) {
        u1 = Math.acos((r1 * r1 + d * d - r2 * r2) / (2 * r1 * d));
        u2 = Math.acos((r2 * r2 + d * d - r1 * r1) / (2 * r2 * d));
    }

    const between = Math.atan2(c2.y - c1.y, c2.x - c1.x);
    const maxSpread = Math.acos(Math.min(1, Math.max(-1, (r1 - r2) / d)));
    // La base del cuello no se abre más que unas veces el tamaño de la gota:
    // con un cuerpo mucho mayor, el metaball clásico forma una «vela» ancha.
    const base = Math.min(
        u1 + (maxSpread - u1) * spread,
        Math.atan((r2 * 2.2) / r1),
    );
    const a1 = between + base;
    const a2 = between - base;
    const a3 = between + Math.PI - u2 - (Math.PI - u2 - maxSpread) * spread;
    const a4 = between - Math.PI + u2 + (Math.PI - u2 - maxSpread) * spread;

    const at = (c: Vec, a: number, r: number): Vec => ({
        x: c.x + r * Math.cos(a),
        y: c.y + r * Math.sin(a),
    });

    const p1 = surface ? surface(a1) : at(c1, a1, r1);
    const p2 = surface ? surface(a2) : at(c1, a2, r1);
    const p3 = at(c2, a3, r2);
    const p4 = at(c2, a4, r2);
    const total = r1 + r2;
    const d2 =
        Math.min(
            spread * handle,
            Math.hypot(p3.x - p1.x, p3.y - p1.y) / total,
        ) * Math.min(1, (d * 2) / total);
    const h1 = at(p1, a1 - Math.PI / 2, r1 * d2);
    const h2 = at(p2, a2 + Math.PI / 2, r1 * d2);
    const h3 = at(p3, a3 + Math.PI / 2, r2 * d2);
    const h4 = at(p4, a4 - Math.PI / 2, r2 * d2);
    const large = d > r1 ? 1 : 0;

    return (
        `M${n2(p1.x)} ${n2(p1.y)}` +
        `C${n2(h1.x)} ${n2(h1.y)} ${n2(h3.x)} ${n2(h3.y)} ${n2(p3.x)} ${n2(p3.y)}` +
        `A${n2(r2)} ${n2(r2)} 0 ${large} 0 ${n2(p4.x)} ${n2(p4.y)}` +
        `C${n2(h4.x)} ${n2(h4.y)} ${n2(h2.x)} ${n2(h2.y)} ${n2(p2.x)} ${n2(p2.y)}` +
        // Cierra siguiendo el contorno: una cuerda larga asomaría sobre el borde.
        (surface ? 'Z' : `A${n2(r1)} ${n2(r1)} 0 0 1 ${n2(p1.x)} ${n2(p1.y)}Z`)
    );
}

/** Medidas base de un ojo, relativas a R (tomadas de la propuesta aprobada). */
export const EYE = {
    width: 0.105,
    height: 0.235,
    spacing: 0.5,
    y: -0.03,
};

export type EyeStroke = { d: string; width: number };

/**
 * Trazo de un ojo en coordenadas locales (centro del ojo en 0,0).
 *
 * La sonrisa transforma la cápsula vertical en un arco: primero se recoge en
 * un punto (como entrecerrar) y después se abre en horizontal. Así nunca pasa
 * por diagonales que parezcan cejas enfadadas o tristes.
 */
export function eyeStroke(
    smile: number,
    heightScale: number,
    widthScale: number,
): EyeStroke {
    const w = EYE.width * R * widthScale;
    const half = Math.max(0, (EYE.height * R * heightScale - w) / 2);
    const s = Math.min(1.15, Math.max(0, smile));

    if (s <= 0.5) {
        const u = s / 0.5;
        const hl = half * (1 - u);

        return {
            d: `M0 ${n2(-hl)}L0 ${n2(hl + 0.001)}`,
            width: w * (1 - 0.15 * u),
        };
    }

    const v = (s - 0.5) / 0.5;
    const aw = w * 1.3 * v;
    const ab = w * 0.42 * v;
    const ac = w * 0.95 * v;
    const shift = -w * 0.12 * v;

    return {
        d: `M${n2(-aw)} ${n2(ab + shift)}Q0 ${n2(-ac + shift)} ${n2(aw)} ${n2(ab + shift)}`,
        width: w * (0.85 - 0.07 * Math.min(1, v)),
    };
}
