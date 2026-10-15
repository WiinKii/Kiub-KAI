/**
 * Un único requestAnimationFrame para todas las instancias de KAI.
 * Solo corre mientras haya alguna instancia visible y activa.
 */

type Tick = (dt: number) => void;

const subscribers = new Set<Tick>();
let frame = 0;
let last = 0;

function loop(now: number): void {
    const dt = Math.max(0, (now - last) / 1000);
    last = now;

    for (const tick of subscribers) {
        tick(dt);
    }

    frame = subscribers.size ? requestAnimationFrame(loop) : 0;
}

export function subscribeTick(tick: Tick): () => void {
    subscribers.add(tick);

    if (!frame) {
        last = performance.now();
        frame = requestAnimationFrame(loop);
    }

    return () => {
        subscribers.delete(tick);

        if (!subscribers.size && frame) {
            cancelAnimationFrame(frame);
            frame = 0;
        }
    };
}

/** Número de instancias animándose (útil para comprobar la limpieza). */
export function activeTicks(): number {
    return subscribers.size;
}
