/**
 * El fondo de orbes con grano (T45, K9): crea el lienzo de WebGL con `import()` cuando la sección se acerca (nunca
 * en el JS inicial de `/`) y lo dibuja con el reloj único solo mientras la sección está en pantalla y la pestaña es
 * visible. Los colores salen de los tokens (`--ciruela-*`) y el cambio de tema los mezcla en 0,8 s (K28). Recupera la
 * pérdida de contexto y baja la calidad según los cuadros (K1): con una mediana de 90 duraciones de cuadro por encima
 * de 33,3 ms baja a nivel 1 (menos resolución) y por encima de 50 ms a nivel 2 (se dibuja un cuadro de cada dos); no
 * vuelve a subir. Sin WebGL queda el fondo plano del tema.
 */
import gsap from 'gsap';
import type { Contexto, Modulo } from './contexto';
import type { ControladorOrbes } from '@/lib/three/sobre-mi/orbes';
import { leerColor, mezclarColor, type Rgb } from './util';

/** K28: el cambio de tema mezcla los colores de los orbes en 0,8 s. */
const TEMA_S = 0.8;
/** K1: cuántas duraciones de cuadro se miden para decidir la calidad, y los umbrales (ms). */
const MUESTRAS_CALIDAD = 90;
const UMBRAL_NIVEL_1_MS = 33.3;
const UMBRAL_NIVEL_2_MS = 50;
/** La resolución de cada nivel de calidad (1 = una muestra por px CSS). */
const ESCALA_POR_NIVEL = [1, 0.75, 0.5] as const;
/** El scroll de la sección en pantallas que suben los orbes (rise). */
const SUBIDA_POR_PANTALLA = 0.35;

const a01 = (c: Rgb): readonly [number, number, number] => [c[0] / 255, c[1] / 255, c[2] / 255];

export function iniciarOrbes(c: Contexto): Modulo {
  const lienzo = c.seccion.querySelector<HTMLCanvasElement>('canvas[data-sm-lienzo="orbes"]');
  if (!lienzo) return { destruir: () => undefined };

  let estado: 'espera' | 'cargando' | 'lista' | 'sin-webgl' = 'espera';
  let orbes: ControladorOrbes | null = null;
  let destruido = false;
  let perdido = false;
  let topeSeccion = 0;
  let altoSeccion = 0;
  let ancho = 0;
  let alto = 0;
  let nivel = 0;
  const duraciones: number[] = [];
  let cuadro = 0;
  let ultimoT = Number.NaN;
  let temaMezclado = c.tema() === 'noche' ? 1 : 0;
  let temaDestino = temaMezclado;
  const mezcla = { m: temaMezclado };
  let sucio = true;
  let ultimaClave = '';

  const raiz = document.documentElement;
  const paleta = {
    orbeDia: leerColor(raiz, '--ciruela-dia-orbes'),
    orbeNoche: leerColor(raiz, '--ciruela-noche-orbes'),
    orbeInvertida: leerColor(raiz, '--ciruela-orbes-invertida'),
    particulaDia: leerColor(raiz, '--ciruela-dia-primario'),
    particulaNoche: leerColor(raiz, '--ciruela-noche-primario'),
  };

  const alPerder = (e: Event): void => {
    e.preventDefault();
    perdido = true;
  };
  const alRestaurar = (): void => {
    perdido = false;
    sucio = true;
  };
  lienzo.addEventListener('webglcontextlost', alPerder);
  lienzo.addEventListener('webglcontextrestored', alRestaurar);

  const cargar = async (): Promise<void> => {
    estado = 'cargando';
    // El contexto se crea aquí, con los atributos de K9 (alfa, sin antialias); si no hay WebGL, el fondo queda plano.
    const gl = lienzo.getContext('webgl2', { alpha: true, antialias: false, premultipliedAlpha: true, powerPreference: 'default' });
    if (!gl) {
      estado = 'sin-webgl';
      c.seccion.setAttribute('data-sm-sin-webgl', '');
      return;
    }
    try {
      const modulo = await import('@/lib/three/sobre-mi/orbes');
      if (destruido) return;
      orbes = modulo.crearOrbes({ lienzo, gl });
      estado = 'lista';
      ajustarTamano(true);
    } catch {
      orbes = null;
      estado = 'sin-webgl';
      c.seccion.setAttribute('data-sm-sin-webgl', '');
    }
  };

  const ajustarTamano = (forzar: boolean): void => {
    if (!orbes) return;
    const w = lienzo.clientWidth;
    const h = lienzo.clientHeight;
    if (!forzar && w === ancho && h === alto) return;
    ancho = w;
    alto = h;
    orbes.redimensionar(w, h, ESCALA_POR_NIVEL[nivel]);
    sucio = true;
  };

  /** K1: mide la duración de los cuadros con la sección en pantalla y baja la calidad si se atrasan. */
  const calidad = (dtMs: number): void => {
    if (nivel >= 2) return;
    duraciones.push(dtMs);
    if (duraciones.length < MUESTRAS_CALIDAD) return;
    const orden = [...duraciones].sort((a, b) => a - b);
    const mediana = orden[Math.floor(orden.length / 2)];
    duraciones.length = 0;
    if (mediana > UMBRAL_NIVEL_2_MS && nivel < 2) nivel = 2;
    else if (mediana > UMBRAL_NIVEL_1_MS && nivel < 1) nivel = 1;
    else return;
    ajustarTamano(true);
  };

  const medir = (): void => {
    const r = c.seccion.getBoundingClientRect();
    topeSeccion = r.top + window.scrollY;
    altoSeccion = r.height;
    ajustarTamano(false);
  };

  const actualizar = (ctx: Contexto): void => {
    const nivelNav = ctx.nivel();
    if (estado === 'espera' && (nivelNav === 'SM' || nivelNav === 'N2')) void cargar();
    if (estado !== 'lista' || !orbes) return;

    // El tema mezcla los colores en 0,8 s (K28): sin movimiento reducido, con un tween; con él, de golpe.
    const tema = ctx.tema() === 'noche' ? 1 : 0;
    if (tema !== temaDestino) {
      temaDestino = tema;
      if (ctx.reducido) {
        temaMezclado = tema;
        mezcla.m = tema;
      } else {
        gsap.to(mezcla, { m: tema, duration: TEMA_S, ease: 'power2.inOut', overwrite: true, onUpdate: () => (sucio = true) });
      }
      sucio = true;
    }
    temaMezclado = mezcla.m;

    // Solo dibuja con la sección en pantalla (en el N2 solo cuando ya sube) y la pestaña visible.
    const enPantalla = ctx.y + ctx.alto > topeSeccion && ctx.y < topeSeccion + altoSeccion;
    if (!enPantalla || document.hidden || perdido || (nivelNav !== 'SM' && nivelNav !== 'N2')) {
      ultimoT = Number.NaN;
      return;
    }
    if (!Number.isNaN(ultimoT)) calidad((ctx.t - ultimoT) * 1000);
    ultimoT = ctx.t;
    // Nivel 2: un cuadro de cada dos.
    cuadro++;
    if (nivel >= 2 && cuadro % 2 === 0) return;
    ajustarTamano(false);

    const m = temaMezclado;
    const subida = ctx.reducido ? 0 : ((ctx.y - topeSeccion) / Math.max(1, ctx.alto)) * SUBIDA_POR_PANTALLA;
    const clave = `${m.toFixed(3)}|${ctx.oscuro.toFixed(3)}|${ancho}x${alto}|${nivel}`;
    // Con movimiento reducido el fondo no se mueve: solo se vuelve a dibujar cuando algo cambia.
    if (ctx.reducido && !sucio && clave === ultimaClave) return;
    ultimaClave = clave;
    sucio = false;
    orbes.dibujar(ctx.reducido ? 0 : ctx.t, {
      orbe: a01(mezclarColor(paleta.orbeDia, paleta.orbeNoche, m)),
      orbeInvertida: a01(paleta.orbeInvertida),
      particula: a01(mezclarColor(paleta.particulaDia, paleta.particulaNoche, m)),
      inversion: ctx.oscuro,
      subida,
    });
  };

  return {
    medir,
    actualizar,
    destruir: () => {
      destruido = true;
      gsap.killTweensOf(mezcla);
      lienzo.removeEventListener('webglcontextlost', alPerder);
      lienzo.removeEventListener('webglcontextrestored', alRestaurar);
      orbes?.destruir();
      orbes = null;
    },
  };
}
