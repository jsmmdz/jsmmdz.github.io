/**
 * El controlador del home (T33): junta el titular, su entrada, la tinta, el video y el lavado.
 *
 * Contrato de estados (`#act-n1[data-tinta]`, lo leen las pruebas):
 *   inactiva  desde que se llega al home hasta que termina la entrada del titular
 *   activa    la simulación corre
 *   dormida   ≥ 3,5 s sin movimiento y sin tinta visible: ni simula ni dibuja
 *   pausada   fuera del home (el menú y más allá, o pasada la mitad de la caída), sin soltar el contexto
 *   apagada   movimiento reducido o sin WebGL: sin canvas, el titular queda quieto en el DOM
 *
 * three y la tinta se cargan con `import()` cuando termina (o empieza) la entrada: nunca en el JS
 * inicial de `/` (compuerta `three-fuera-del-inicio`).
 *
 * T36: además de la tinta, junta el paralaje del personaje y la capa de atrás (el titular, la tinta y el
 * video: `[data-n1-capa-atras]`) y la entrada de los textos de las columnas.
 */
import gsap from 'gsap';
import { suscribirProgresoCaida } from '@/lib/pelicula/caida-hook';
import { ajustarTitular, animarEntrada, esconderLetras, mostrarLetras } from './titular';
import { animarTextos, esconderTextos, mostrarTextos } from './entrada-textos';
import { iniciarParalaje, type ControladorParalaje } from './paralaje';
import { montarPersonaje, type PersonajeMontado } from './personaje';
import type { ControladorTinta, EstadoTinta } from './tinta';

type EstadoHome = EstadoTinta | 'inactiva' | 'apagada';
type ModuloTinta = typeof import('./tinta');

/** Pasada la mitad de la caída, la escena ya es el menú (caida-hook.ts: el home se oculta). */
const CAIDA_FUERA_DEL_HOME = 0.5;
/** El lavado termina antes de que empiece el destello de la caída (en 0,20). */
const CAIDA_FIN_DEL_LAVADO = 0.16;
/** Toda espera tiene salida: si el módulo de la tinta no llega a tiempo, el titular queda en el DOM. */
const ESPERA_MAXIMA_MODULO_MS = 8000;
/** Y si la entrada no avisa que terminó (pestaña en segundo plano), se da por terminada. */
const ESPERA_MAXIMA_ENTRADA_MS = 6000;
/** Cuánto se espera, la primera vez, entre pasar a activa y pedir el video. */
const ESPERA_PRIMER_VIDEO_MS = 400;
/** Retardo para agrupar los cambios de tamaño seguidos. */
const RETARDO_REDIMENSIONAR_S = 0.08;

const suavizar = (t: number): number => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
};

/** El lavado (K8): 0 en el home, 1 cuando el crema ya es el fondo del menú. */
export function lavadoDeLaCaida(progreso: number): number {
  return suavizar(progreso / CAIDA_FIN_DEL_LAVADO);
}

export interface ControladorHome {
  destruir: () => void;
}

export function iniciarHome(): ControladorHome | null {
  const seccion = document.getElementById('act-n1');
  const titular = seccion?.querySelector<HTMLElement>('h1[data-n1-titular]');
  const video = seccion?.querySelector<HTMLVideoElement>('video[data-n1-materiales]');
  const capaAtras = seccion?.querySelector<HTMLElement>('[data-n1-capa-atras]');
  if (!seccion || !titular || !video || !capaAtras) return null;

  const consultaReducido = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reducido = consultaReducido.matches;
  // No se abre un contexto de prueba (2-TECNICO: los atributos del contexto se fijan en un solo lugar):
  // si el navegador ni siquiera tiene WebGL 2, no hay tinta; si falla al crearla, se apaga igual.
  const sinWebGL = typeof WebGL2RenderingContext === 'undefined';

  let destruido = false;
  let apagada = reducido || sinWebGL;
  let entradaPendiente = !apagada && document.body.dataset.currentLevel === 'N0';
  let entrando = false;
  let montando = false;
  let tinta: ControladorTinta | null = null;
  let lienzo: HTMLCanvasElement | null = null;
  let progreso = 0;
  let promesaModulo: Promise<ModuloTinta> | null = null;
  let cancelarEntrada: (() => void) | null = null;
  let cancelarTextos: (() => void) | null = null;
  let personaje: PersonajeMontado | null = null;
  let paralaje: ControladorParalaje | null = null;
  let respaldoEntrada: number | null = null;
  let esperaRedimensionar: gsap.core.Tween | null = null;

  const nivel = (): string => document.body.dataset.currentLevel ?? '';
  const fuera = (): boolean => {
    const n = nivel();
    return n === 'N2' || n === 'N3' || n === 'N4' || n === 'SM' || progreso >= CAIDA_FUERA_DEL_HOME;
  };

  const preloaderTerminado = (): boolean => {
    const preloader = document.getElementById('act-n0');
    return !preloader || preloader.hasAttribute('data-completado') || preloader.hasAttribute('hidden');
  };

  const fijarEstado = (estado: EstadoHome): void => {
    if (seccion.dataset.tinta !== estado) seccion.dataset.tinta = estado;
  };

  // El video solo se pide (play) cuando la tinta pasa a activa; fuera de ahí se pausa. La primera vez se
  // espera un momento: el estado `activa` se ve antes de que salga la petición, y la descarga y la
  // decodificación no compiten con los primeros cuadros de la tinta.
  let videoPedido = false;
  let esperaVideo: number | null = null;
  const reproducirVideo = (): void => {
    videoPedido = true;
    // Si el autoplay se bloquea, la capa revelada queda negra: la tinta sigue funcionando.
    video.play().catch(() => undefined);
  };
  const sincronizarVideo = (estado: EstadoHome): void => {
    if (esperaVideo !== null) window.clearTimeout(esperaVideo);
    esperaVideo = null;
    if (estado !== 'activa') {
      video.pause();
    } else if (videoPedido) {
      reproducirVideo();
    } else {
      esperaVideo = window.setTimeout(reproducirVideo, ESPERA_PRIMER_VIDEO_MS);
    }
  };

  const apagar = (): void => {
    apagada = true;
    tinta?.destruir();
    tinta = null;
    lienzo?.remove();
    lienzo = null;
    delete seccion.dataset.tintaLienzo;
    sincronizarVideo('apagada');
    fijarEstado('apagada');
  };

  const aplicarCaida = (p: number): void => {
    progreso = p;
    if (!reducido) {
      const lavado = lavadoDeLaCaida(p);
      seccion.style.setProperty('--n1-lavado', lavado.toFixed(3));
      tinta?.ajustarCaida(p, lavado);
    }
    evaluar();
  };

  const precargarModulo = (): Promise<ModuloTinta> => {
    promesaModulo ??= import('./tinta');
    return promesaModulo;
  };

  const montar = async (): Promise<void> => {
    montando = true;
    let limite: number | null = null;
    try {
      const modulo = await Promise.race([
        precargarModulo(),
        new Promise<never>((_, rechazar) => {
          limite = window.setTimeout(() => rechazar(new Error('La tinta del home tardó demasiado en cargar.')), ESPERA_MAXIMA_MODULO_MS);
        }),
      ]);
      if (limite !== null) window.clearTimeout(limite);
      if (destruido || apagada) return;
      // Mientras cargaba se pudo salir del home: se vuelve a evaluar, sin montar nada fuera de lugar.
      if (fuera()) {
        montando = false;
        evaluar();
        return;
      }
      const nuevo = document.createElement('canvas');
      nuevo.setAttribute('data-n1-tinta', '');
      nuevo.setAttribute('aria-hidden', 'true');
      nuevo.className = 'n1-tinta';
      // El canvas va dentro de la capa de atrás: se corre con el paralaje junto con el titular y el video.
      capaAtras.prepend(nuevo);
      lienzo = nuevo;
      try {
        tinta = modulo.crearTinta({
          seccion,
          lienzo: nuevo,
          titular,
          video,
          alCambiarEstado: (estado) => {
            fijarEstado(estado);
            sincronizarVideo(estado);
          },
          alPerderContexto: apagar,
        });
      } catch {
        // Sin contexto WebGL: el titular se queda en el DOM, quieto.
        apagar();
        return;
      }
      seccion.dataset.tintaCuadros = '0';
      // Desde aquí el canvas dibuja el titular y el h1 queda solo para los lectores de pantalla.
      seccion.setAttribute('data-tinta-lienzo', '');
      tinta.ajustarCaida(progreso, lavadoDeLaCaida(progreso));
    } catch {
      if (limite !== null) window.clearTimeout(limite);
      apagar();
    } finally {
      montando = false;
    }
  };

  const terminarEntrada = (): void => {
    if (!entrando) return;
    entrando = false;
    entradaPendiente = false;
    cancelarEntrada?.();
    cancelarEntrada = null;
    cancelarTextos?.();
    cancelarTextos = null;
    if (respaldoEntrada !== null) window.clearTimeout(respaldoEntrada);
    respaldoEntrada = null;
    mostrarLetras(titular);
    mostrarTextos(seccion);
    evaluar();
  };

  const iniciarEntrada = (): void => {
    entrando = true;
    // Mientras las letras suben se va trayendo el módulo de la tinta; se monta al terminar.
    void precargarModulo().catch(() => undefined);
    cancelarEntrada = animarEntrada(titular, terminarEntrada);
    cancelarTextos = animarTextos(seccion);
    respaldoEntrada = window.setTimeout(terminarEntrada, ESPERA_MAXIMA_ENTRADA_MS);
  };

  const evaluar = (): void => {
    if (destruido || apagada) return;
    // Con el preloader a la vista (N0) todavía no se llegó al home.
    if (nivel() === 'N0') return;
    // Al cargar, Astro pone un instante el nivel en N1 y el preloader lo devuelve a N0: eso no es llegar al
    // home. La entrada espera a que el preloader diga que terminó (`data-completado`, antes del cambio a N1).
    if (entradaPendiente && !preloaderTerminado()) return;
    const afuera = fuera();

    if (entradaPendiente) {
      if (afuera) {
        // Se llegó directo al menú: el titular ya está entero cuando se vuelva al home.
        entradaPendiente = false;
        mostrarLetras(titular);
        mostrarTextos(seccion);
        fijarEstado('pausada');
      } else if (!entrando) {
        iniciarEntrada();
      }
      return;
    }
    if (entrando) return;

    if (afuera) {
      if (tinta) tinta.pausar();
      else fijarEstado('pausada');
      return;
    }
    if (!tinta) {
      if (!montando) void montar();
      return;
    }
    tinta.reanudar();
  };

  // ---- Arranque ----

  const redimensionar = (): void => {
    ajustarTitular(titular);
    tinta?.redimensionar();
  };
  const alCambiarTamano = (): void => {
    esperaRedimensionar?.kill();
    esperaRedimensionar = gsap.delayedCall(RETARDO_REDIMENSIONAR_S, redimensionar);
  };
  ajustarTitular(titular);
  const observadorTamano = new ResizeObserver(alCambiarTamano);
  observadorTamano.observe(seccion);
  // La fuente real cambia las medidas: se vuelve a ajustar y a rasterizar cuando llega.
  void document.fonts.load('800 100px Unbounded').then(alCambiarTamano, () => undefined);
  void document.fonts.ready.then(alCambiarTamano, () => undefined);

  if (apagada) {
    fijarEstado('apagada');
  } else {
    fijarEstado('inactiva');
    if (entradaPendiente) {
      esconderLetras(titular);
      esconderTextos(seccion);
    }
  }

  // El paralaje del ratón: solo con movimiento normal y mientras se está en el home.
  personaje = montarPersonaje(seccion);
  if (personaje && !reducido) {
    paralaje = iniciarParalaje({
      personaje: personaje.elemento,
      capaAtras,
      activo: () => nivel() === 'N1' && progreso < CAIDA_FUERA_DEL_HOME,
    });
  }

  // Si el visitante activa el movimiento reducido con la página abierta: se apaga la tinta y el titular queda entero.
  const alCambiarMovimiento = (): void => {
    if (destruido || !consultaReducido.matches) return;
    reducido = true;
    apagar();
    terminarEntrada();
    mostrarLetras(titular);
    mostrarTextos(seccion);
    paralaje?.destruir();
    paralaje = null;
  };
  consultaReducido.addEventListener('change', alCambiarMovimiento);

  const observadorNivel = new MutationObserver(evaluar);
  observadorNivel.observe(document.body, { attributes: true, attributeFilter: ['data-current-level'] });
  const soltarCaida = suscribirProgresoCaida(aplicarCaida);
  evaluar();

  return {
    destruir: (): void => {
      destruido = true;
      consultaReducido.removeEventListener('change', alCambiarMovimiento);
      observadorNivel.disconnect();
      observadorTamano.disconnect();
      soltarCaida();
      esperaRedimensionar?.kill();
      cancelarEntrada?.();
      cancelarTextos?.();
      paralaje?.destruir();
      personaje?.destruir();
      if (respaldoEntrada !== null) window.clearTimeout(respaldoEntrada);
      if (esperaVideo !== null) window.clearTimeout(esperaVideo);
      video.pause();
      tinta?.destruir();
      tinta = null;
      lienzo?.remove();
      lienzo = null;
    },
  };
}
