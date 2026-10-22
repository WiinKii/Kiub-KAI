/**
 * Entorno de viaje del inicio de sesión, dibujado en un `<canvas>`.
 *
 * Tres profundidades que se desplazan en sentido contrario a KAI, cada una
 * a su velocidad: degradados amplios y lentos al fondo, trazos suaves y
 * gotas en el plano medio, y reflejos alargados y rápidos delante. Todo se
 * repite sobre un toro mayor que el panel, así el ciclo es continuo y nunca
 * se ve un reinicio. En reposo deriva muy despacio.
 */

export type TravelLayers = {
    /** Velocidad objetivo: ~0 reposo, 1 viaje, 2,4 impulso, 3+ salida. */
    setSpeed: (value: number) => void;
    /** Dirección del viaje (radianes; el entorno va al revés). */
    setHeading: (angle: number) => void;
    resize: (width: number, height: number) => void;
    /** Avanza y dibuja; `dt` en segundos. */
    frame: (dt: number) => void;
    readonly speed: number;
};

type Far = { x: number; y: number; r: number; color: string; alpha: number };
type Stroke = { x: number; y: number; len: number; w: number; alpha: number };
type Bubble = { x: number; y: number; r: number; alpha: number };
type Streak = {
    x: number;
    y: number;
    len: number;
    w: number;
    alpha: number;
    tw: number;
};

function mulberry32(seed: number): () => number {
    let a = seed >>> 0;

    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Velocidad del plano en px/s a velocidad 1. */
const DEPTH = { far: 26, mid: 150, near: 520 };
/** Margen del toro: los elementos salen del todo antes de reaparecer. */
const WRAP = 160;

export function createTravelLayers(
    canvas: HTMLCanvasElement,
    seed = 7,
): TravelLayers {
    const ctx = canvas.getContext('2d');
    const rand = mulberry32(seed);
    let width = 1;
    let height = 1;
    let dpr = 1;
    let speed = 0.04;
    let target = 0.04;
    let heading = -0.72;
    let time = 0;
    const offset = { x: 0, y: 0 };

    const far: Far[] = [
        { x: 0.18, y: 0.22, r: 0.55, color: '92,157,255', alpha: 0.34 },
        { x: 0.82, y: 0.3, r: 0.48, color: '139,123,255', alpha: 0.3 },
        { x: 0.32, y: 0.86, r: 0.6, color: '169,193,211', alpha: 0.16 },
        { x: 0.9, y: 0.88, r: 0.42, color: '74,120,255', alpha: 0.26 },
        { x: 0.55, y: 0.55, r: 0.36, color: '120,170,255', alpha: 0.14 },
    ];
    const strokes: Stroke[] = Array.from({ length: 14 }, () => ({
        x: rand(),
        y: rand(),
        len: 40 + rand() * 120,
        w: 6 + rand() * 14,
        alpha: 0.1 + rand() * 0.2,
    }));
    const sparkles: Bubble[] = Array.from({ length: 10 }, () => ({
        x: rand(),
        y: rand(),
        r: 3 + rand() * 4,
        alpha: rand() * Math.PI * 2,
    }));
    const bubbles: Bubble[] = Array.from({ length: 12 }, () => ({
        x: rand(),
        y: rand(),
        r: 2.5 + rand() * 9,
        alpha: 0.35 + rand() * 0.45,
    }));
    const streaks: Streak[] = Array.from({ length: 26 }, () => ({
        x: rand(),
        y: rand(),
        len: 0.4 + rand() * 0.9,
        w: 1 + rand() * 1.8,
        alpha: 0.25 + rand() * 0.5,
        tw: rand() * Math.PI * 2,
    }));

    /** Posición envuelta de un elemento (`x`, `y` en 0-1) en el plano `depth`. */
    function place(x: number, y: number, depth: number) {
        const spanX = width + WRAP * 2;
        const spanY = height + WRAP * 2;
        let px = (x * spanX + offset.x * depth) % spanX;
        let py = (y * spanY + offset.y * depth) % spanY;

        if (px < 0) {
            px += spanX;
        }

        if (py < 0) {
            py += spanY;
        }

        return { x: px - WRAP, y: py - WRAP };
    }

    function draw() {
        if (!ctx) {
            return;
        }

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);

        const dx = -Math.cos(heading);
        const dy = -Math.sin(heading);
        const angle = Math.atan2(dy, dx);
        const s = Math.min(speed, 4);

        // Fondo: volúmenes de luz amplios que apenas se mueven.
        for (const b of far) {
            const p = place(b.x, b.y, DEPTH.far / DEPTH.near);
            const r = b.r * Math.max(width, height);
            const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
            g.addColorStop(0, `rgba(${b.color},${b.alpha})`);
            g.addColorStop(1, `rgba(${b.color},0)`);
            ctx.fillStyle = g;
            ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
        }

        // Plano medio: trazos suaves orientados con el viaje y gotas.
        ctx.lineCap = 'round';

        // En reposo casi no se ven: el viaje los hace aparecer.
        const travel = Math.min(1, s);

        for (const st of strokes) {
            const p = place(st.x, st.y, DEPTH.mid / DEPTH.near);
            const len = st.len * (1 + s * 0.55);
            ctx.strokeStyle = `rgba(86,128,255,${st.alpha * (0.18 + 0.82 * travel)})`;
            ctx.lineWidth = st.w;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(
                p.x - Math.cos(angle) * len,
                p.y - Math.sin(angle) * len,
            );
            ctx.stroke();
        }

        for (const b of bubbles) {
            const p = place(b.x, b.y, (DEPTH.mid * 1.25) / DEPTH.near);
            const g = ctx.createRadialGradient(
                p.x - b.r * 0.35,
                p.y - b.r * 0.4,
                b.r * 0.1,
                p.x,
                p.y,
                b.r,
            );
            g.addColorStop(0, `rgba(255,255,255,${0.55 * b.alpha})`);
            g.addColorStop(0.55, `rgba(150,190,255,${0.18 * b.alpha})`);
            g.addColorStop(1, `rgba(92,157,255,${0.32 * b.alpha})`);
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(p.x, p.y, b.r, 0, Math.PI * 2);
            ctx.fill();
        }

        // Destellos de cuatro puntas que titilan (plano medio-cercano).
        ctx.fillStyle = '#ffffff';

        for (const sp of sparkles) {
            const p = place(sp.x, sp.y, 0.7);
            const tw = 0.5 + 0.5 * Math.sin(time * 3.1 + sp.alpha);
            const a = (0.25 + 0.6 * travel) * tw;

            if (a < 0.03) {
                continue;
            }

            const r = sp.r * (0.7 + 0.3 * tw);
            ctx.globalAlpha = a;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y - r);
            ctx.quadraticCurveTo(p.x, p.y, p.x + r, p.y);
            ctx.quadraticCurveTo(p.x, p.y, p.x, p.y + r);
            ctx.quadraticCurveTo(p.x, p.y, p.x - r, p.y);
            ctx.quadraticCurveTo(p.x, p.y, p.x, p.y - r);
            ctx.fill();
        }

        ctx.globalAlpha = 1;

        // Delante: reflejos alargados y rápidos, solo cuando hay viaje.
        const visible = Math.min(1, Math.max(0, (s - 0.12) / 0.6));

        if (visible > 0.01) {
            for (const st of streaks) {
                const p = place(st.x, st.y, 1);
                const len = (14 + 110 * Math.min(s, 3)) * st.len;
                const twinkle = 0.75 + 0.25 * Math.sin(time * 7 + st.tw);
                const a = st.alpha * visible * twinkle;
                const tx = p.x - Math.cos(angle) * len;
                const ty = p.y - Math.sin(angle) * len;
                const g = ctx.createLinearGradient(p.x, p.y, tx, ty);
                g.addColorStop(0, `rgba(255,255,255,${a})`);
                g.addColorStop(1, 'rgba(200,220,255,0)');
                ctx.strokeStyle = g;
                ctx.lineWidth = st.w;
                ctx.beginPath();
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(tx, ty);
                ctx.stroke();
            }
        }
    }

    return {
        setSpeed(value) {
            target = value;
        },
        setHeading(angle) {
            heading = angle;
        },
        resize(w, h) {
            width = Math.max(1, w);
            height = Math.max(1, h);
            dpr = Math.min(2, window.devicePixelRatio || 1);
            canvas.width = Math.round(width * dpr);
            canvas.height = Math.round(height * dpr);
            draw();
        },
        frame(dt) {
            const step = Math.min(dt, 0.05);
            time += step;
            // Acelera con algo de inercia y frena más despacio.
            const rate = target > speed ? 2.6 : 1.7;
            speed += (target - speed) * Math.min(1, step * rate);
            const v = speed * DEPTH.near;
            offset.x -= Math.cos(heading) * v * step;
            offset.y -= Math.sin(heading) * v * step;
            draw();
        },
        get speed() {
            return speed;
        },
    };
}
