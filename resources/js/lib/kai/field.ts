/**
 * Campo de metabolas de KAI.
 *
 * El cuerpo (con su contorno radial deformado) y sus satélites (lóbulos,
 * manos, gotas, puntos) suman un campo escalar; la silueta es la curva de
 * nivel 1. Así las partes se funden y se separan solas, como un fluido.
 * El contorno se extrae con marching squares y se suaviza con una
 * B-spline cuadrática.
 */

/**
 * `k`: exponente propio (más alto = gota más «sólida», se funde menos).
 * `stretch`: gota alargada (elipse de área constante) a lo largo de la
 * dirección (`c`, `s`) = (cos, sin); así se estira hacia donde va.
 */
export type Ball = {
    x: number;
    y: number;
    r: number;
    k?: number;
    stretch?: number;
    c?: number;
    s?: number;
};

export type BodyField = {
    cx: number;
    cy: number;
    /** Radio del contorno del cuerpo por ángulo (BINS valores, desde θ = -π). */
    radii: Float64Array;
};

export const BINS = 96;

const TAU = Math.PI * 2;

export type FieldOptions = {
    /** Tamaño de celda en unidades del viewBox. */
    cell: number;
    /**
     * Exponente de caída (2 = metaball clásica, de largo alcance). Con 3 la
     * fusión se parece más a la tensión superficial de una gota.
     */
    falloff?: number;
    /**
     * Origen de la rejilla. Anclada al cuerpo, la rejilla viaja con él: al
     * flotar, el contorno no «hierve» por cambiar de celdas.
     */
    anchor?: { x: number; y: number };
    /** Decimales del trazado: 1 basta en tamaños pequeños (cadena más corta). */
    decimals?: 1 | 2;
};

export type FieldResult = {
    /** Trazado SVG con todas las siluetas (cuerpo y gotas sueltas). */
    path: string;
    /** Área total (unidades²). */
    area: number;
};

/**
 * Tabla de radios del cuerpo por ángulo a partir de su contorno en el mundo
 * (polígono estrellado respecto a su centro).
 */
export function radiiFromContour(
    world: Float64Array,
    n: number,
    cx: number,
    cy: number,
    out: Float64Array,
): void {
    const angles: number[] = [];
    const radii: number[] = [];

    for (let i = 0; i < n; i++) {
        const dx = world[i * 2] - cx;
        const dy = world[i * 2 + 1] - cy;
        angles.push(Math.atan2(dy, dx));
        radii.push(Math.hypot(dx, dy));
    }

    // Ordena por ángulo para interpolar alrededor del círculo.
    const order = angles.map((_, i) => i).sort((a, b) => angles[a] - angles[b]);
    const as = order.map((i) => angles[i]);
    const rs = order.map((i) => radii[i]);
    let k = 0;

    for (let b = 0; b < BINS; b++) {
        const th = -Math.PI + (b / BINS) * TAU;

        while (k < n && as[k] < th) {
            k++;
        }

        const i1 = k % n;
        const i0 = (k - 1 + n) % n;
        let a0 = as[i0];
        let a1 = as[i1];

        if (a0 > th) {
            a0 -= TAU;
        }

        if (a1 < th) {
            a1 += TAU;
        }

        const u = a1 - a0 > 1e-9 ? (th - a0) / (a1 - a0) : 0;
        out[b] = rs[i0] + (rs[i1] - rs[i0]) * u;
    }
}

/** atan2 aproximado (error < 0,002 rad): el campo lo evalúa miles de veces. */
function fastAtan2(y: number, x: number): number {
    const ax = Math.abs(x);
    const ay = Math.abs(y);
    const a = Math.min(ax, ay) / (Math.max(ax, ay) + 1e-12);
    const s = a * a;
    let r = ((-0.0464964749 * s + 0.15931422) * s - 0.327622764) * s * a + a;

    if (ay > ax) {
        r = 1.57079637 - r;
    }

    if (x < 0) {
        r = 3.14159274 - r;
    }

    return y < 0 ? -r : r;
}

let values = new Float32Array(0);
let pointsX = new Float32Array(0);
let pointsY = new Float32Array(0);
let link1 = new Int32Array(0);
let link2 = new Int32Array(0);
let seen = new Uint8Array(0);

function ensure(samples: number, edges: number): void {
    if (values.length < samples) {
        values = new Float32Array(samples);
    }

    if (pointsX.length < edges) {
        pointsX = new Float32Array(edges);
        pointsY = new Float32Array(edges);
        link1 = new Int32Array(edges);
        link2 = new Int32Array(edges);
        seen = new Uint8Array(edges);
    }
}

function r2(v: number): string {
    return (Math.round(v * 100) / 100).toString();
}

function r1(v: number): string {
    return (Math.round(v * 10) / 10).toString();
}

/** Suavizado laplaciano [1 2 1]/4 de un bucle cerrado, en su sitio. */
function relax(xs: number[], ys: number[], passes: number): void {
    const n = xs.length;

    for (let p = 0; p < passes; p++) {
        let prevX = xs[n - 1];
        let prevY = ys[n - 1];
        const firstX = xs[0];
        const firstY = ys[0];

        for (let i = 0; i < n; i++) {
            const nextX = i + 1 < n ? xs[i + 1] : firstX;
            const nextY = i + 1 < n ? ys[i + 1] : firstY;
            const x = xs[i];
            const y = ys[i];
            xs[i] = (prevX + 2 * x + nextX) / 4;
            ys[i] = (prevY + 2 * y + nextY) / 4;
            prevX = x;
            prevY = y;
        }
    }
}

/** q^(k/2) sin `Math.pow` para los exponentes habituales (va por celda). */
function falloffPow(q: number, k: number): number {
    switch (k) {
        case 2:
            return q;
        case 3:
            return q * Math.sqrt(q);
        case 4:
            return q * q;
        case 5:
            return q * q * Math.sqrt(q);
        case 6:
            return q * q * q;
        default:
            return Math.pow(q, k / 2);
    }
}

/**
 * Extrae la silueta del cuerpo y los satélites.
 * `bounds`: [x0, y0, x1, y1] del área a muestrear (con margen).
 */
export function traceField(
    body: BodyField,
    balls: Ball[],
    bounds: [number, number, number, number],
    { cell, falloff = 3, anchor = { x: 0, y: 0 }, decimals = 2 }: FieldOptions,
): FieldResult {
    const fmt = decimals === 1 ? r1 : r2;
    // Celdas de tamaño fijo alineadas con el ancla (no con la caja, que
    // cambia en cada respiración).
    const bx0 = anchor.x + Math.floor((bounds[0] - anchor.x) / cell) * cell;
    const by0 = anchor.y + Math.floor((bounds[1] - anchor.y) / cell) * cell;
    const nx = Math.max(4, Math.ceil((bounds[2] - bx0) / cell));
    const ny = Math.max(4, Math.ceil((bounds[3] - by0) / cell));
    const hx = cell;
    const hy = cell;
    const stride = nx + 1;
    const hCount = (ny + 1) * nx;
    const edges = hCount + ny * (nx + 1);

    ensure(stride * (ny + 1), edges);

    const { cx, cy, radii } = body;

    // 1. Campo en los vértices de la rejilla.
    for (let j = 0; j <= ny; j++) {
        const y = by0 + j * hy;

        for (let i = 0; i <= nx; i++) {
            const x = bx0 + i * hx;
            const dx = x - cx;
            const dy = y - cy;
            const d2 = dx * dx + dy * dy + 1e-6;
            const f = ((fastAtan2(dy, dx) + Math.PI) / TAU) * BINS;
            // La aproximación puede pasarse de ±π por milésimas: índice siempre válido.
            const b0 = ((Math.floor(f) % BINS) + BINS) % BINS;
            const b1 = (b0 + 1) % BINS;
            const rr =
                radii[b0] + (radii[b1] - radii[b0]) * (f - Math.floor(f));
            let v = falloffPow((rr * rr) / d2, falloff);

            for (let k = 0; k < balls.length; k++) {
                const ball = balls[k];
                const ex = x - ball.x;
                const ey = y - ball.y;
                let d2 = ex * ex + ey * ey;

                if (ball.stretch) {
                    // En los ejes de la gota: larga en `u`, estrecha en `v`.
                    const a = ball.stretch;
                    const u = ex * (ball.c ?? 1) + ey * (ball.s ?? 0);
                    const v = ey * (ball.c ?? 1) - ex * (ball.s ?? 0);
                    d2 = (u * u) / (a * a) + v * v * a * a;
                }

                const q = (ball.r * ball.r) / (d2 + 1e-6);

                // Lejos de la gota su aporte es despreciable (< 0,03 %).
                if (q > 0.004) {
                    v += falloffPow(q, ball.k ?? falloff);
                }
            }

            values[j * stride + i] = v;
        }
    }

    // 2. Cruces en las aristas y enlaces entre ellas (marching squares).
    link1.fill(-1, 0, edges);
    link2.fill(-1, 0, edges);

    const crossH = (i: number, j: number): number => {
        const id = j * nx + i;
        const a = values[j * stride + i];
        const b = values[j * stride + i + 1];
        const t = (1 - a) / (b - a);
        pointsX[id] = bx0 + (i + t) * hx;
        pointsY[id] = by0 + j * hy;

        return id;
    };

    const crossV = (i: number, j: number): number => {
        const id = hCount + j * stride + i;
        const a = values[j * stride + i];
        const b = values[(j + 1) * stride + i];
        const t = (1 - a) / (b - a);
        pointsX[id] = bx0 + i * hx;
        pointsY[id] = by0 + (j + t) * hy;

        return id;
    };

    const join = (a: number, b: number): void => {
        if (link1[a] < 0) {
            link1[a] = b;
        } else {
            link2[a] = b;
        }

        if (link1[b] < 0) {
            link1[b] = a;
        } else {
            link2[b] = a;
        }
    };

    for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
            const tl = values[j * stride + i] >= 1 ? 8 : 0;
            const tr = values[j * stride + i + 1] >= 1 ? 4 : 0;
            const br = values[(j + 1) * stride + i + 1] >= 1 ? 2 : 0;
            const bl = values[(j + 1) * stride + i] >= 1 ? 1 : 0;
            const c = tl | tr | br | bl;

            if (c === 0 || c === 15) {
                continue;
            }

            const top = (): number => crossH(i, j);
            const bottom = (): number => crossH(i, j + 1);
            const left = (): number => crossV(i, j);
            const right = (): number => crossV(i + 1, j);

            switch (c) {
                case 1:
                case 14:
                    join(left(), bottom());
                    break;
                case 2:
                case 13:
                    join(bottom(), right());
                    break;
                case 3:
                case 12:
                    join(left(), right());
                    break;
                case 4:
                case 11:
                    join(top(), right());
                    break;
                case 6:
                case 9:
                    join(top(), bottom());
                    break;
                case 7:
                case 8:
                    join(left(), top());
                    break;
                case 5:
                case 10: {
                    const center =
                        (values[j * stride + i] +
                            values[j * stride + i + 1] +
                            values[(j + 1) * stride + i] +
                            values[(j + 1) * stride + i + 1]) /
                        4;
                    // Centro dentro: se aíslan las esquinas de fuera; si no,
                    // las de dentro (5 = TR+BL dentro, 10 = TL+BR dentro).
                    const isFive = c === 5;
                    const centerInside = center >= 1;
                    const cutTopLeft = isFive === centerInside;

                    if (cutTopLeft) {
                        join(left(), top());
                        join(bottom(), right());
                    } else {
                        join(left(), bottom());
                        join(top(), right());
                    }

                    break;
                }
            }
        }
    }

    // 3. Recorre los bucles y los suaviza.
    seen.fill(0, 0, edges);
    let path = '';
    let area = 0;
    const loopX: number[] = [];
    const loopY: number[] = [];
    const minArea = cell * cell * 1.2;

    for (let e = 0; e < edges; e++) {
        if (seen[e] || link1[e] < 0) {
            continue;
        }

        loopX.length = 0;
        loopY.length = 0;
        let prev = -1;
        let cur = e;
        let closed = false;

        while (cur >= 0 && !seen[cur]) {
            seen[cur] = 1;
            loopX.push(pointsX[cur]);
            loopY.push(pointsY[cur]);
            const next = link1[cur] !== prev ? link1[cur] : link2[cur];
            prev = cur;
            cur = next;

            if (cur === e) {
                closed = true;
                break;
            }
        }

        const n = loopX.length;

        if (!closed || n < 3) {
            continue;
        }

        let a = 0;

        for (let i = 0; i < n; i++) {
            const k = (i + 1) % n;
            a += loopX[i] * loopY[k] - loopX[k] * loopY[i];
        }

        if (Math.abs(a / 2) < minArea) {
            continue;
        }

        area += Math.abs(a / 2);

        // Suaviza primero (no depende de qué punto inicia el bucle) y solo
        // después aligera: como los puntos ya están sobre una curva suave,
        // quedarse con uno de cada dos no hace temblar el borde. Al final,
        // B-spline cuadrática (curvas entre puntos medios), sin esquinas.
        relax(loopX, loopY, 2);
        const step = n > 48 ? 2 : 1;
        const m = Math.floor(n / step);
        const px = (i: number): number => loopX[(i % m) * step];
        const py = (i: number): number => loopY[(i % m) * step];
        path += `M${fmt((px(m - 1) + px(0)) / 2)} ${fmt((py(m - 1) + py(0)) / 2)}`;

        for (let i = 0; i < m; i++) {
            path += `Q${fmt(px(i))} ${fmt(py(i))} ${fmt((px(i) + px(i + 1)) / 2)} ${fmt((py(i) + py(i + 1)) / 2)}`;
        }

        path += 'Z';
    }

    return { path, area };
}
