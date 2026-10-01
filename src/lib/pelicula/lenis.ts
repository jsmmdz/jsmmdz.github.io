import Lenis from 'lenis';
import gsap from 'gsap';

let lenisInstancia: Lenis | null = null;
let tickerCallback: ((time: number) => void) | null = null;

export function obtenerLenis(): Lenis | null {
  return lenisInstancia;
}

// Idempotente: si ya hay una instancia viva, no crea otra. Al irse de la página, `astro:before-swap`
// la destruye y `astro:page-load` la vuelve a crear.
export function iniciarLenis(): void {
  if (lenisInstancia) return;

  if (typeof window === 'undefined') return;

  // Con movimiento reducido no se inicia y queda el scroll nativo
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  // El caso de estudio (N4) tiene su propio scroll virtual: Lenis no mueve el N4
  if (document.body?.dataset.currentLevel === 'N4') {
    return;
  }

  lenisInstancia = new Lenis({
    autoRaf: false,
  });

  // Un solo reloj (D2): el ticker de GSAP mueve Lenis y el render de three
  tickerCallback = (time: number) => {
    lenisInstancia?.raf(time * 1000);
  };

  gsap.ticker.add(tickerCallback);
  gsap.ticker.lagSmoothing(0);
}

export function destruirLenis(): void {
  if (tickerCallback) {
    gsap.ticker.remove(tickerCallback);
    tickerCallback = null;
  }
  if (lenisInstancia) {
    lenisInstancia.destroy();
    lenisInstancia = null;
  }
}

// Conectar con el ciclo de vida de Astro ClientRouter
if (typeof document !== 'undefined') {
  document.addEventListener('astro:page-load', iniciarLenis);
  document.addEventListener('astro:before-swap', destruirLenis);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciarLenis, { once: true });
  } else {
    iniciarLenis();
  }
}
