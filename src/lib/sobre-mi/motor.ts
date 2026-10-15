/**
 * El motor de «Sobre mí y contacto» (T45): arma el contexto, inicia cada módulo y los mueve con el reloj único
 * (`gsap.ticker`, docs/2-TECNICO.md § Motor; sin ScrollTrigger y sin `requestAnimationFrame` propio).
 *
 * Patrón de las coreografías de Tonami (K2): cada módulo mide una vez sus límites (y de nuevo al cambiar de tamaño,
 * con un debounce de 150 ms, y al llegar las fuentes) y en cada cuadro calcula su avance con `window.scrollY`. Los
 * módulos se crean sin tocar el diseño: lo que lo necesita va en `medir()`, que corre cuando la sección ya ocupa
 * lugar (en el home y el preloader está oculta).
 */
import gsap from 'gsap';
import { leerConfig } from './config';
import type { Contexto, Modulo } from './contexto';
import { iniciarTema } from './tema';
import { iniciarRieles } from './rieles';
import { iniciarInterruptor } from './interruptor';
import { iniciarPortada } from './portada';
import { iniciarSobre } from './sobre';
import { iniciarPuente } from './puente';
import { iniciarHistoria } from './historia';
import { iniciarCursor } from './cursor';
import { iniciarOrbes } from './orbes';
import { iniciarFormulario } from './formulario';
import { movimientoReducido, conRaton } from './util';

export interface ControladorSobreMi {
  destruir: () => void;
}

/** Cuánto se espera después del último cambio de tamaño para volver a medir (K2). */
const DEBOUNCE_MEDIR_MS = 150;
const COMPOSICION_ANGOSTA = '(max-width: 767px), (max-aspect-ratio: 1/1)';

/** Cuántas veces arrancó la sección en este documento: con el router de Astro, el regreso a la página la crea de nuevo. */
let inicios = 0;

/** ¿La página se abrió con «recargar» o «atrás»? Una entrada nueva (escribir la dirección, un enlace) no cuenta como volver. */
function abiertaDeNuevo(): boolean {
  const entrada = performance.getEntriesByType('navigation')[0];
  return entrada instanceof PerformanceNavigationTiming && (entrada.type === 'reload' || entrada.type === 'back_forward');
}

export function iniciarSobreMi(seccion: HTMLElement): ControladorSobreMi {
  const config = leerConfig(seccion);
  const tema = iniciarTema(seccion, () => undefined);
  if (!config) return { destruir: () => tema.destruir() };

  const reducido = movimientoReducido();
  const angosta = window.matchMedia(COMPOSICION_ANGOSTA);
  const vuelve = abiertaDeNuevo() || inicios > 0;
  inicios++;
  const abort = new AbortController();
  const { signal } = abort;
  const fijo = seccion.querySelector<HTMLElement>('.sm-fondo-fijo');

  const ctx: Contexto = {
    seccion,
    config,
    reducido,
    ratonFino: !reducido && conRaton(),
    angosta: () => angosta.matches,
    alto: window.innerHeight,
    ancho: window.innerWidth,
    y: window.scrollY,
    t: 0,
    dt: 0,
    vuelve,
    nivel: () => document.body.dataset.currentLevel ?? '',
    tema: () => tema.actual(),
    oscuro: 0,
  };

  // El orden importa: la historia escribe `oscuro` antes de que lo lean los orbes; el interruptor mide primero, antes
  // de que los demás escriban estilos en este cuadro (así su lectura no obliga a recalcular el diseño).
  const modulos: Modulo[] = [
    iniciarInterruptor(ctx),
    iniciarRieles(ctx),
    iniciarPortada(ctx),
    iniciarSobre(ctx),
    iniciarPuente(ctx),
    iniciarHistoria(ctx),
    iniciarCursor(ctx),
    iniciarOrbes(ctx),
    iniciarFormulario(ctx),
  ];

  let destruido = false;
  let sucio = true;
  let ocupaLugar = false;
  let temporizador: number | undefined;

  const medirTodo = (): void => {
    const caja = fijo?.getBoundingClientRect();
    ctx.alto = caja && caja.height > 0 ? caja.height : window.innerHeight;
    ctx.ancho = seccion.clientWidth || window.innerWidth;
    for (const m of modulos) m.medir?.();
  };

  const pedirMedida = (): void => {
    sucio = true;
  };

  const alRedimensionar = (): void => {
    if (temporizador !== undefined) window.clearTimeout(temporizador);
    temporizador = window.setTimeout(pedirMedida, DEBOUNCE_MEDIR_MS);
  };

  const tick = (tiempo: number, deltaMs: number): void => {
    if (destruido) return;
    // En el home y en el preloader la sección no ocupa lugar: no hay nada que mover (y no se toca el diseño).
    const nivel = document.body.dataset.currentLevel;
    if (nivel === 'N0' || nivel === 'N1' || seccion.getClientRects().length === 0) {
      ocupaLugar = false;
      return;
    }
    if (!ocupaLugar || sucio) {
      ocupaLugar = true;
      sucio = false;
      medirTodo();
    }
    ctx.y = window.scrollY;
    ctx.t = tiempo;
    ctx.dt = Math.min(0.1, deltaMs / 1000);
    for (const m of modulos) m.actualizar?.(ctx);
  };

  window.addEventListener('resize', alRedimensionar, { passive: true, signal });
  angosta.addEventListener('change', pedirMedida, { signal });
  // Las fuentes cambian el ancho de las palabras y el alto de las líneas; el alto de la sección, las imágenes.
  void document.fonts?.ready.then(() => {
    if (!destruido) pedirMedida();
  });
  const observador = new ResizeObserver(pedirMedida);
  observador.observe(seccion);
  gsap.ticker.add(tick);

  return {
    destruir: () => {
      destruido = true;
      abort.abort();
      observador.disconnect();
      if (temporizador !== undefined) window.clearTimeout(temporizador);
      gsap.ticker.remove(tick);
      for (const m of modulos) m.destruir();
      tema.destruir();
    },
  };
}
