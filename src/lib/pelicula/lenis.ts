import Lenis from 'lenis';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import gsap from 'gsap';

gsap.registerPlugin(ScrollTrigger);

let lenisInstancia: Lenis | null = null;
let tickerCallback: ((time: number) => void) | null = null;

export function obtenerLenis(): Lenis | null {
  return lenisInstancia;
}

export function iniciarLenis(): void {
  destruirLenis();

  if (typeof window === 'undefined') return;

  // Con movimiento reducido no se inicia y queda el scroll nativo
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  lenisInstancia = new Lenis({
    autoRaf: false,
  });

  lenisInstancia.on('scroll', ScrollTrigger.update);

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
