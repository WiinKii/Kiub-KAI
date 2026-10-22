/**
 * Entorno de viaje del inicio de sesión («galaxia»), dibujado en un
 * `<canvas>` sobre el degradado azul noche → violeta del panel, como en la
 * referencia.
 *
 * Se desplaza en sentido contrario a KAI, en planos de distinta velocidad:
 * volúmenes de luz lentos al fondo, destellos de cuatro puntas, trazos
 * azules anchos que pasan muy rápido y reflejos finos aún más rápidos. La
 * velocidad del fondo es la que da la sensación de que KAI va rápido. Todo
 * se repite sobre un toro mayor que el panel: el ciclo es continuo y nunca
 * se ve un reinicio.
 */

export type TravelLayers = {
    /** Velocidad objetivo: ~0 reposo, 1 viaje, 2+ impulso. */
    setSpeed: (value: number) => void;
    /** Empujón instantáneo (velocidad/s): el arranque sobrepasa un poco. */
    kick: (value: number) => void;
    /** Dirección del viaje (radianes; el entorno va al revés). */
    setHeading: (angle: number) => void;
    resize: (width: number, height: number) => void;
    /** Avanza y dibuja; `dt` en segundos. */
    frame: (dt: number) => void;
    readonly speed: number;
};

type Glow = { x: number; y: number; r: number; color: string; alpha: number };
type Stroke = { x: number; y: number; len: number; w: number; alpha: number };
type Sparkle = { x: number; y: number; r: number; phase: number };
type Streak = { x: number; y: number; len: number; alpha: number };

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

/** Velocidad de cada plano en px/s a velocidad 1. */
const DEPTH = { glow: 50, sparkle: 380, stroke: 1250, streak: 1800 };
/** Margen del toro: los elementos salen del todo antes de reaparecer. */
const WRAP = 360;

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
    /** Ritmo de cambio de la velocidad (muelle, sin tirones). */
    let accel = 0;
    let heading = 0.55;
    let time = 0;
    let travel = 0;

    const glows: Glow[] = [
        { x: 0.15, y: 0.1, r: 0.6, color: '40,90,220', alpha: 0.28 },
        { x: 0.85, y: 0.25, r: 0.5, color: '90,70,220', alpha: 0.2 },
        { x: 0.35, y: 0.9, r: 0.7, color: '120,50,200', alpha: 0.2 },
    ];
    // Trazos azules anchos (los que pasan rápido en la referencia).
    const strokes: Stroke[] = Array.from({ length: 6 }, () => ({
        x: rand(),
        y: rand(),
        len: 150 + rand() * 210,
        w: 16 + rand() * 14,
        alpha: 0.55 + rand() * 0.3,
    }));
    const sparkles: Sparkle[] = Array.from({ length: 11 }, () => ({
        x: rand(),
        y: rand(),
        r: 3 + rand() * 4.5,
        phase: rand() * Math.PI * 2,
    }));
    const streaks: Streak[] = Array.from({ length: 12 }, () => ({
        x: rand(),
        y: rand(),
        len: 0.5 + rand() * 0.9,
        alpha: 0.18 + rand() * 0.3,
    }));

    /** Desplazamiento acumulado de cada plano (px). */
    const offset = { glow: 0, sparkle: 0, stroke: 0, streak: 0 };

    /** Posición envuelta de un elemento (`x`, `y` en 0-1) en un plano. */
    function place(x: number, y: number, shift: number) {
        const spanX = width + WRAP * 2;
        const spanY = height + WRAP * 2;
        const dx = -Math.cos(heading) * shift;
        const dy = -Math.sin(heading) * shift;
        let px = (x * spanX + dx) % spanX;
        let py = (y * spanY + dy) % spanY;

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

        // Dirección de las líneas: la del viaje.
        const ux = Math.cos(heading);
        const uy = Math.sin(heading);
        const s = Math.min(speed, 4);

        for (const g of glows) {
            const p = place(g.x, g.y, offset.glow);
            const r = g.r * Math.max(width, height);
            const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
            grad.addColorStop(0, `rgba(${g.color},${g.alpha})`);
            grad.addColorStop(1, `rgba(${g.color},0)`);
            ctx.fillStyle = grad;
            ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
        }

        // Destellos de cuatro puntas que titilan.
        ctx.fillStyle = '#ffffff';

        for (const sp of sparkles) {
            const p = place(sp.x, sp.y, offset.sparkle);
            const tw = 0.5 + 0.5 * Math.sin(time * 3.4 + sp.phase);
            const a = (0.35 + 0.55 * travel) * tw;

            if (a < 0.03) {
                continue;
            }

            const r = sp.r * (0.65 + 0.35 * tw);
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
        ctx.lineCap = 'round';

        // Trazos azules anchos: aparecen con el viaje.
        if (travel > 0.01) {
            for (const st of strokes) {
                const p = place(st.x, st.y, offset.stroke);
                const len = st.len * (0.8 + 0.25 * s);
                ctx.strokeStyle = `rgba(36,72,226,${st.alpha * travel})`;
                ctx.lineWidth = st.w;
                ctx.beginPath();
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(p.x - ux * len, p.y - uy * len);
                ctx.stroke();
            }

            // Reflejos finos, los más rápidos.
            for (const st of streaks) {
                const p = place(st.x, st.y, offset.streak);
                const len = (30 + 90 * Math.min(s, 3)) * st.len;
                const g = ctx.createLinearGradient(
                    p.x,
                    p.y,
                    p.x - ux * len,
                    p.y - uy * len,
                );
                g.addColorStop(0, `rgba(255,255,255,${st.alpha * travel})`);
                g.addColorStop(1, 'rgba(190,210,255,0)');
                ctx.strokeStyle = g;
                ctx.lineWidth = 2.6;
                ctx.beginPath();
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(p.x - ux * len, p.y - uy * len);
                ctx.stroke();
            }
        }
    }

    return {
        setSpeed(value) {
            target = value;
        },
        kick(value) {
            accel += value;
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
            // Un muelle amortiguado: arranca con suavidad, acelera y llega
            // sin tirones; frena más despacio de lo que acelera.
            const omega = target > speed ? 4.6 : 3;
            accel +=
                (omega * omega * (target - speed) - 2 * omega * accel) * step;
            speed = Math.max(0, speed + accel * step);
            travel = Math.min(1, Math.max(0, (speed - 0.1) / 0.6));
            offset.glow += DEPTH.glow * speed * step;
            offset.sparkle += DEPTH.sparkle * (0.15 + speed) * step;
            offset.stroke += DEPTH.stroke * speed * step;
            offset.streak += DEPTH.streak * speed * step;
            draw();
        },
        get speed() {
            return speed;
        },
    };
}
