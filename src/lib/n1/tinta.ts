/**
 * La tinta del home (T33): una simulación de fluidos que sigue al cursor (y al dedo) y deja ver, dentro
 * de las manchas, el video de materiales. Es la técnica de noth.in (ficha K1 y K2), reimplementada.
 *
 * Es la excepción escrita al «único canvas de WebGL» (docs/2-TECNICO.md § Motor): su canvas es propio,
 * solo vive en el home, se mueve con `gsap.ticker` (no abre su propio loop) y se pausa fuera del home
 * sin soltar el contexto. Este módulo importa three: se carga siempre con `import()`, nunca en el JS
 * inicial de `/`.
 *
 * T36: en el mismo renderer corre el efecto del titular del N2 (Aikawa) solo sobre las letras: el fluido
 * del ratón (`FluidoN2`) las desplaza y alrededor del cursor el borde toma el filo de arcoíris. La tinta y
 * el video de materiales no se deforman: la máscara de la tinta se lee en el uv sin desplazar.
 *
 * T44: el personaje del home también se dibuja aquí, como una textura más (un video de color + máscara), debajo
 * de las letras y de la tinta. Con la simulación dormida el renderer sigue dibujando cada vez que el personaje
 * trae un cuadro nuevo. Y de la tinta sale un dato vivo: el % del home que tiene tinta visible ahora.
 */
import gsap from 'gsap';
import {
  CanvasTexture,
  LinearFilter,
  Mesh,
  NearestFilter,
  NoColorSpace,
  OrthographicCamera,
  PlaneGeometry,
  RGBAFormat,
  HalfFloatType,
  UnsignedByteType,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
  VideoTexture,
  WebGLRenderer,
  WebGLRenderTarget,
  type IUniform,
  type MagnificationTextureFilter,
  type Texture,
  type TextureDataType,
} from 'three';
import { FluidoN2 } from '@/lib/three/n2/fluido';
import { radioDelEfecto, RADIO } from '@/lib/three/n2/efecto-titular';
import { ADVECTAR, DIVERGENCIA, GRADIENTE, MEZCLA, PRESION, REDUCIR, SALPICAR, VERTICE } from './shaders';
import { ALTO_FIGURA_EN_EL_CUADRO } from './personaje';

/**
 * Los valores de noth.in (ficha K1), salvo `radio` (6e-5): el autor pidió en el pulido (2026-10-04) que el
 * cursor abriera más tinta para ver el video. Con el barrido de la prueba de los Hz de T33, a 60 Hz la tinta
 * pasa de abrir el 3,5 % de la franja del titular al 18,9 %, y se disipa en 2,75 s en lugar de 1,25 s.
 * Subir `fuerza` casi no abre más (la salpicadura de velocidad se pierde en la advección del mismo cuadro)
 * y sí agranda la diferencia entre 60 y 120 Hz.
 *
 * T36: el autor pidió que la tinta se repare un 25 % más rápido. El decaimiento es `disipación^cuadros`,
 * así que el tiempo hasta limpiarse es proporcional a `1 / −ln(disipación)`: para tardar un 25 % menos,
 * `ln(d) = ln(0,988) / 0,75`, es decir `d = 0,988^(1/0,75) = 0,98404 ≈ 0,984`.
 */
const AJUSTES = {
  resolucionVelocidad: 256,
  resolucionTinta: 512,
  disipacionVelocidad: 0.962,
  disipacionTinta: 0.984,
  iteracionesPresion: 20,
  radio: 4e-4,
  fuerza: 5900,
  tamanoRevelado: 3.9,
  bordeSuave: 0.5,
  anchoBorde: 0.01,
} as const;

/** K4: con el scroll de la caída, la disipación de la tinta baja hasta este valor (0,988 → 0,97). */
const DISIPACION_TINTA_AL_CAER = 0.97;
/** Un cuadro a 60 Hz: el paso normalizado vale 1 a ese ritmo, 0,5 a 120 Hz (2-TECNICO § Motor). */
const MS_POR_CUADRO = 1000 / 60;
/** Tope del paso normalizado, para que un cuadro muy largo (pestaña dormida) no dispare la simulación. */
const PASO_MAXIMO = 4;
/** K1: sin movimiento durante este tiempo, y con la tinta ya disipada, la simulación duerme. */
const DORMIR_TRAS_MS = 3500;
/** Cada cuánto se revisa si queda tinta visible mientras se espera para dormir. */
const REVISAR_CADA_MS = 500;
/** Lado de la cuadrícula a la que se reduce la tinta para revisarla (resolucionTinta / 8). */
const LADO_REDUCCION = AJUSTES.resolucionTinta / 8;
/** T44: cada cuánto se mide el % del home con tinta visible (como mucho, 4 veces por segundo). */
const MEDIR_PINTADO_CADA_MS = 250;
/** T44: la línea de luz de la silueta mide el 0,3 % del alto de la figura, y nunca menos de 1 px (decisión del autor). */
const CONTORNO_FRACCION = 0.003;
const CONTORNO_MINIMO_PX = 1;

export type EstadoTinta = 'activa' | 'dormida' | 'pausada';

export interface OpcionesTinta {
  /** #act-n1: el canvas se mide contra él y aquí se expone `data-tinta-cuadros`. */
  seccion: HTMLElement;
  /** El canvas propio de la tinta (el contexto WebGL se crea aquí). */
  lienzo: HTMLCanvasElement;
  /** El h1: de él se rasteriza la capa base (misma fuente, tamaño y posición). */
  titular: HTMLElement;
  /** El video de materiales: la capa revelada. */
  video: HTMLVideoElement;
  /**
   * El personaje animado (T44): `caja` es el <img> del póster, que marca dónde se dibuja el cuadro (se mide cada vez
   * que se dibuja, así el paralaje que mueve la imagen mueve lo que se ve) y `video` el mp4 de color + máscara.
   */
  personaje?: { caja: HTMLElement; video: HTMLVideoElement };
  alCambiarEstado: (estado: EstadoTinta) => void;
  alPerderContexto: () => void;
  /** El % del home con tinta visible (0–100, entero). Solo avisa cuando cambia. */
  alCambiarPintado: (porcentaje: number) => void;
}

export interface ControladorTinta {
  readonly estado: EstadoTinta;
  /** Vuelve a rasterizar el titular y a medir el canvas (cambio de tamaño, fuente ya cargada). */
  redimensionar: () => void;
  /** El progreso de la caída (0–1) y el lavado (0–1) que le corresponde. */
  ajustarCaida: (progreso: number, lavado: number) => void;
  /** Fuera del home: no simula ni dibuja, sin soltar el contexto. Limpia la tinta. */
  pausar: () => void;
  /** De vuelta en el home. */
  reanudar: () => void;
  destruir: () => void;
}

interface Doble {
  leer: WebGLRenderTarget;
  escribir: WebGLRenderTarget;
  cambiar: () => void;
}

function leerToken(nombre: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
}

function contexto2d(lienzo: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = lienzo.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('La tinta del home necesita un contexto 2D.');
  return ctx;
}

/** Un color CSS (un token, a veces un color-mix) como valores 0–1 de la pantalla, sin conversión. */
function colorAVector(css: string): Vector3 {
  const ctx = contexto2d(document.createElement('canvas'));
  ctx.fillStyle = 'rgb(0 0 0)';
  ctx.fillStyle = css;
  ctx.fillRect(0, 0, 1, 1);
  const d = ctx.getImageData(0, 0, 1, 1).data;
  return new Vector3(d[0] / 255, d[1] / 255, d[2] / 255);
}

export function crearTinta(opciones: OpcionesTinta): ControladorTinta {
  const { seccion, lienzo, titular, video } = opciones;

  // Antialias apagado y DPR ≤ 2, como Aikawa (2-TECNICO § Motor): el titular es plano y no lo necesita.
  const renderer = new WebGLRenderer({ canvas: lienzo, antialias: false, alpha: false });
  renderer.autoClear = false;
  renderer.setClearColor(0x000000, 1);

  const camara = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const escena = new Scene();
  const geometria = new PlaneGeometry(2, 2);
  const cuadro = new Mesh(geometria);
  escena.add(cuadro);

  const material = (fragmento: string, uniformes: Record<string, IUniform>): ShaderMaterial =>
    new ShaderMaterial({ vertexShader: VERTICE, fragmentShader: fragmento, uniforms: uniformes, depthTest: false, depthWrite: false });

  const mat = {
    salpicar: material(SALPICAR, {
      uDestino: { value: null },
      uAspecto: { value: 1 },
      uPunto: { value: new Vector2() },
      uColor: { value: new Vector3() },
      uRadio: { value: AJUSTES.radio },
    }),
    advectar: material(ADVECTAR, {
      uVelocidad: { value: null },
      uFuente: { value: null },
      uTexel: { value: new Vector2() },
      uDisipacion: { value: 1 },
      uDt: { value: 1 },
    }),
    divergencia: material(DIVERGENCIA, { uVelocidad: { value: null }, uTexel: { value: new Vector2() } }),
    presion: material(PRESION, { uPresion: { value: null }, uDivergencia: { value: null }, uTexel: { value: new Vector2() } }),
    gradiente: material(GRADIENTE, { uPresion: { value: null }, uVelocidad: { value: null }, uTexel: { value: new Vector2() } }),
    reducir: material(REDUCIR, {
      uTinta: { value: null },
      uTexel: { value: 1 / AJUSTES.resolucionTinta },
      uTamano: { value: AJUSTES.tamanoRevelado },
      uBordeSuave: { value: AJUSTES.bordeSuave },
    }),
    mezcla: material(MEZCLA, {
      uBase: { value: null },
      uRevelado: { value: null },
      uTinta: { value: null },
      uFondo: { value: colorAVector(leerToken('--color-crema-base')) },
      uFondoLavado: { value: colorAVector(leerToken('--fondo-crema-web')) },
      uTexto: { value: colorAVector(leerToken('--color-texto-oscuro')) },
      uLavado: { value: 0 },
      uTieneVideo: { value: 0 },
      uAspectoVideo: { value: 16 / 9 },
      uAspectoPlano: { value: 1 },
      uCentroTitular: { value: 0.5 },
      uTamano: { value: AJUSTES.tamanoRevelado },
      uBordeSuave: { value: AJUSTES.bordeSuave },
      uAnchoBorde: { value: AJUSTES.anchoBorde },
      // El efecto del titular del N2 (T36), solo sobre las letras
      uFluido: { value: null },
      uConFluido: { value: 0 },
      uResolucion: { value: new Vector2(1, 1) },
      uEfecto: { value: 0 },
      uPuntero: { value: new Vector2() },
      uRadio: { value: RADIO },
      uDpr: { value: 1 },
      // El personaje (T44)
      uPersonaje: { value: null },
      uCajaPersonaje: { value: new Vector4() },
      uTienePersonaje: { value: 0 },
      uContorno: { value: new Vector2() },
      uLuz: { value: colorAVector(leerToken('--color-crema-base')) },
    }),
  };
  // El fluido del ratón que empuja las letras: el mismo del N2, en este renderer.
  const fluido = new FluidoN2(renderer);

  const destino = (n: number, filtro: MagnificationTextureFilter, tipo: TextureDataType = HalfFloatType): WebGLRenderTarget =>
    new WebGLRenderTarget(n, n, { minFilter: filtro, magFilter: filtro, format: RGBAFormat, type: tipo, depthBuffer: false });
  const doble = (n: number, filtro: MagnificationTextureFilter): Doble => {
    const par: Doble = {
      leer: destino(n, filtro),
      escribir: destino(n, filtro),
      cambiar: () => {
        [par.leer, par.escribir] = [par.escribir, par.leer];
      },
    };
    return par;
  };

  const velocidad = doble(AJUSTES.resolucionVelocidad, LinearFilter);
  const presion = doble(AJUSTES.resolucionVelocidad, NearestFilter);
  const tinta = doble(AJUSTES.resolucionTinta, LinearFilter);
  const divergencia = destino(AJUSTES.resolucionVelocidad, NearestFilter);
  const reduccion = destino(LADO_REDUCCION, NearestFilter, UnsignedByteType);
  const lecturaReduccion = new Uint8Array(LADO_REDUCCION * LADO_REDUCCION * 4);
  const texelVelocidad = new Vector2(1 / AJUSTES.resolucionVelocidad, 1 / AJUSTES.resolucionVelocidad);
  const texelTinta = new Vector2(1 / AJUSTES.resolucionTinta, 1 / AJUSTES.resolucionTinta);

  const paso = (m: ShaderMaterial, destinoRender: WebGLRenderTarget | null): void => {
    cuadro.material = m;
    renderer.setRenderTarget(destinoRender);
    renderer.render(escena, camara);
  };

  const limpiar = (): void => {
    for (const rt of [velocidad.leer, velocidad.escribir, presion.leer, presion.escribir, tinta.leer, tinta.escribir]) {
      renderer.setRenderTarget(rt);
      renderer.clear();
    }
  };
  limpiar();

  // ---- Capas: el titular (base, desde el DOM) y el video (revelada) ----

  const lienzoBase = document.createElement('canvas');
  const ctxBase = contexto2d(lienzoBase);
  let texBase: CanvasTexture | null = null;

  const texVideo = new VideoTexture(video);
  texVideo.colorSpace = NoColorSpace;
  mat.mezcla.uniforms.uRevelado.value = texVideo;
  let tiempoVideo = -1;

  // El personaje (T44): un video de color + máscara. Se sube a la GPU solo cuando trae un cuadro nuevo.
  const personaje = opciones.personaje;
  const texPersonaje = personaje ? new VideoTexture(personaje.video) : null;
  if (texPersonaje) {
    texPersonaje.colorSpace = NoColorSpace;
    mat.mezcla.uniforms.uPersonaje.value = texPersonaje;
  }
  const conAvisoDeCuadro = personaje !== undefined && 'requestVideoFrameCallback' in personaje.video;
  let cuadroNuevo = false;
  let tiempoPersonaje = -1;
  let personajeListo = false;
  let cuadrosPersonaje = 0;
  let avisoDeCuadro = 0;
  const alCuadroDelPersonaje = (): void => {
    cuadroNuevo = true;
    avisoDeCuadro = personaje?.video.requestVideoFrameCallback(alCuadroDelPersonaje) ?? 0;
  };
  // Un salto con `currentTime` estando en pausa también deja un cuadro nuevo.
  const alSaltarElPersonaje = (): void => {
    cuadroNuevo = true;
  };
  if (personaje) {
    if (conAvisoDeCuadro) avisoDeCuadro = personaje.video.requestVideoFrameCallback(alCuadroDelPersonaje);
    personaje.video.addEventListener('seeked', alSaltarElPersonaje);
  }
  /** ¿El video del personaje trae un cuadro que todavía no se dibujó? */
  const hayCuadroDelPersonaje = (): boolean => {
    if (!personaje) return false;
    const v = personaje.video;
    if (v.readyState < 2 || v.videoWidth === 0) return false;
    return conAvisoDeCuadro ? cuadroNuevo : v.currentTime !== tiempoPersonaje;
  };

  /**
   * Rasteriza el titular tal como está en el DOM: cada letra con su fuente, tamaño y posición reales
   * (la partimos en letras para la entrada, así que se dibuja letra por letra y no se pierde el
   * espaciado que el navegador le dio). Blanco sobre negro: el canal R es la cobertura.
   */
  const rasterizarTitular = (): void => {
    const dpr = renderer.getPixelRatio();
    // Se mide contra el lienzo y no contra la sección: la capa de atrás se corre con el paralaje y las letras
    // van con ella, así que sus posiciones solo calzan relativas al lienzo.
    const caja = lienzo.getBoundingClientRect();
    const ancho = Math.max(1, Math.round(caja.width * dpr));
    const alto = Math.max(1, Math.round(caja.height * dpr));
    const cambioTamano = lienzoBase.width !== ancho || lienzoBase.height !== alto;
    lienzoBase.width = ancho;
    lienzoBase.height = alto;
    ctxBase.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctxBase.fillStyle = 'rgb(0 0 0)';
    ctxBase.fillRect(0, 0, caja.width, caja.height);
    ctxBase.fillStyle = 'rgb(255 255 255)';
    ctxBase.textAlign = 'left';
    ctxBase.textBaseline = 'alphabetic';

    // La sonda es un cuadrito de alto 0 alineado a la línea base del titular.
    const sonda = titular.querySelector<HTMLElement>('[data-n1-sonda]');
    const lineaBase = (sonda ? sonda.getBoundingClientRect().bottom : caja.top + caja.height / 2) - caja.top;
    for (const letra of titular.querySelectorAll<HTMLElement>('[data-n1-letra]')) {
      const estilo = getComputedStyle(letra);
      ctxBase.font = `${estilo.fontWeight} ${estilo.fontSize} ${estilo.fontFamily}`;
      ctxBase.fillText(letra.textContent ?? '', letra.getBoundingClientRect().left - caja.left, lineaBase);
    }

    if (!texBase || cambioTamano) {
      texBase?.dispose();
      texBase = new CanvasTexture(lienzoBase);
      // Sin conversión de color: el ShaderMaterial escribe tal cual los valores del canvas.
      texBase.colorSpace = NoColorSpace;
      texBase.minFilter = LinearFilter;
      texBase.generateMipmaps = false;
      mat.mezcla.uniforms.uBase.value = texBase;
    }
    texBase.needsUpdate = true;
    mat.mezcla.uniforms.uAspectoPlano.value = caja.width / Math.max(1, caja.height);
    // El centro vertical de las letras (la mitad de la altura de la mayúscula sobre la línea base), en uv con
    // y hacia arriba: hacia ahí se lleva el centro del video para que sus letras calcen con las del titular.
    const medida = ctxBase.measureText('M');
    const altoMayuscula = medida.actualBoundingBoxAscent;
    mat.mezcla.uniforms.uCentroTitular.value = 1 - (lineaBase - altoMayuscula / 2) / Math.max(1, caja.height);
  };

  // ---- Estado ----

  let estado: EstadoTinta = 'pausada';
  let cuadros = 0;
  let progreso = 0;
  let inmovil = 0;
  let proximaRevision = DORMIR_TRAS_MS;
  let sinMedirPintado = 0;
  let celdasConTinta = 0;
  let pintado = 0;
  const puntero = { x: 0, y: 0, tienePrevio: false, previoX: 0, previoY: 0, nuevo: false };
  // El filo de arcoíris sigue al cursor mientras esté sobre la página (o el dedo sobre la pantalla).
  let efectoActivo = false;
  const medidaLienzo = new Vector2();

  const cambiarEstado = (nuevo: EstadoTinta): void => {
    if (estado === nuevo) return;
    estado = nuevo;
    opciones.alCambiarEstado(nuevo);
  };

  const dibujar = (): void => {
    const m = mat.mezcla.uniforms;
    m.uTinta.value = tinta.leer.texture;
    // El video se sube a la GPU solo cuando trae un cuadro nuevo; hasta entonces la capa es negra.
    const conCuadros = video.readyState >= 2 && video.videoWidth > 0;
    if (conCuadros && video.currentTime !== tiempoVideo) {
      tiempoVideo = video.currentTime;
      texVideo.needsUpdate = true;
      m.uAspectoVideo.value = video.videoWidth / video.videoHeight;
    }
    m.uTieneVideo.value = conCuadros ? 1 : 0;

    // El personaje: su cuadro entra a la caja del <img> del póster, medida contra el lienzo en cada dibujo.
    // El gancho de las pruebas (`data-personaje-oculto`) lo quita del canvas.
    if (personaje && texPersonaje) {
      const oculto = seccion.hasAttribute('data-personaje-oculto');
      if (hayCuadroDelPersonaje()) {
        cuadroNuevo = false;
        tiempoPersonaje = personaje.video.currentTime;
        texPersonaje.needsUpdate = true;
        if (!personajeListo) {
          personajeListo = true;
          // Desde aquí el <img> del póster deja de verse: el canvas ya dibuja al personaje.
          seccion.setAttribute('data-personaje-lienzo', '');
        }
        if (!oculto) {
          cuadrosPersonaje += 1;
          seccion.dataset.personajeCuadros = String(cuadrosPersonaje);
        }
      }
      m.uTienePersonaje.value = personajeListo && !oculto ? 1 : 0;
      if (personajeListo && !oculto) {
        const lienzoCaja = lienzo.getBoundingClientRect();
        const imagen = personaje.caja.getBoundingClientRect();
        const ancho = Math.max(1, lienzoCaja.width);
        const alto = Math.max(1, lienzoCaja.height);
        m.uCajaPersonaje.value.set(
          (imagen.left - lienzoCaja.left) / ancho,
          1 - (imagen.bottom - lienzoCaja.top) / alto,
          imagen.width / ancho,
          imagen.height / alto,
        );
        const contorno = Math.max(CONTORNO_MINIMO_PX, CONTORNO_FRACCION * imagen.height * ALTO_FIGURA_EN_EL_CUADRO);
        m.uContorno.value.set(contorno / ancho, contorno / alto);
      }
    }

    // El efecto del titular del N2: el fluido desplaza las letras y el cursor les da el filo de arcoíris.
    const textura = fluido.textura;
    const conFluido = fluido.activo && textura !== null;
    m.uFluido.value = conFluido ? textura : null;
    m.uConFluido.value = conFluido ? 1 : 0;
    m.uEfecto.value = efectoActivo ? 1 : 0;
    if (efectoActivo) {
      const caja = lienzo.getBoundingClientRect();
      const dpr = renderer.getPixelRatio();
      renderer.getDrawingBufferSize(medidaLienzo);
      m.uResolucion.value.copy(medidaLienzo);
      m.uDpr.value = dpr;
      m.uPuntero.value.set((puntero.x - caja.left) * dpr, (caja.height - (puntero.y - caja.top)) * dpr);
      m.uRadio.value = radioDelEfecto(caja.width) * dpr;
    }
    paso(mat.mezcla, null);
  };

  const redimensionar = (): void => {
    const caja = seccion.getBoundingClientRect();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(Math.max(1, caja.width), Math.max(1, caja.height), false);
    fluido.redimensionar(caja.width, caja.height);
    rasterizarTitular();
    // setSize borra el buffer: si no se dibuja ahora, el canvas queda en blanco hasta el próximo cuadro.
    if (estado !== 'pausada') dibujar();
  };

  // ---- La simulación ----

  const simular = (k: number, escala: number): void => {
    mat.advectar.uniforms.uDt.value = k;
    const caja = lienzo.getBoundingClientRect();
    if (puntero.nuevo) {
      const x = (puntero.x - caja.left) / Math.max(1, caja.width);
      const y = 1 - (puntero.y - caja.top) / Math.max(1, caja.height);
      fluido.mover(puntero.x - caja.left, puntero.y - caja.top);
      if (!puntero.tienePrevio) {
        puntero.previoX = x;
        puntero.previoY = y;
        puntero.tienePrevio = true;
      }
      const dx = x - puntero.previoX;
      const dy = y - puntero.previoY;
      if (dx !== 0 || dy !== 0) {
        const s = mat.salpicar.uniforms;
        s.uAspecto.value = caja.width / Math.max(1, caja.height);
        s.uPunto.value.set(x, y);
        s.uRadio.value = AJUSTES.radio;
        s.uDestino.value = velocidad.leer.texture;
        s.uColor.value.set(dx * AJUSTES.fuerza * escala, dy * AJUSTES.fuerza * escala, 0);
        paso(mat.salpicar, velocidad.escribir);
        velocidad.cambiar();
        // La tinta que suma cada salpicadura va × k: a 120 Hz son el doble de salpicaduras, la mitad de gruesas.
        s.uDestino.value = tinta.leer.texture;
        s.uColor.value.set(k * escala, k * escala, k * escala);
        paso(mat.salpicar, tinta.escribir);
        tinta.cambiar();
      }
      puntero.previoX = x;
      puntero.previoY = y;
      puntero.nuevo = false;
    }

    // K4: la tinta se apaga al salir del home (disipación 0,988 → 0,97 con p²).
    const disipacionTinta = AJUSTES.disipacionTinta + (DISIPACION_TINTA_AL_CAER - AJUSTES.disipacionTinta) * progreso * progreso;
    const a = mat.advectar.uniforms;
    a.uVelocidad.value = velocidad.leer.texture;
    a.uFuente.value = velocidad.leer.texture;
    a.uTexel.value.copy(texelVelocidad);
    a.uDisipacion.value = Math.pow(AJUSTES.disipacionVelocidad, k);
    paso(mat.advectar, velocidad.escribir);
    velocidad.cambiar();

    a.uVelocidad.value = velocidad.leer.texture;
    a.uFuente.value = tinta.leer.texture;
    a.uTexel.value.copy(texelTinta);
    a.uDisipacion.value = Math.pow(disipacionTinta, k);
    paso(mat.advectar, tinta.escribir);
    tinta.cambiar();

    mat.divergencia.uniforms.uVelocidad.value = velocidad.leer.texture;
    mat.divergencia.uniforms.uTexel.value.copy(texelVelocidad);
    paso(mat.divergencia, divergencia);

    renderer.setRenderTarget(presion.leer);
    renderer.clear();
    const p = mat.presion.uniforms;
    p.uDivergencia.value = divergencia.texture;
    p.uTexel.value.copy(texelVelocidad);
    for (let i = 0; i < AJUSTES.iteracionesPresion; i++) {
      p.uPresion.value = presion.leer.texture;
      paso(mat.presion, presion.escribir);
      presion.cambiar();
    }

    const g = mat.gradiente.uniforms;
    g.uPresion.value = presion.leer.texture;
    g.uVelocidad.value = velocidad.leer.texture;
    g.uTexel.value.copy(texelVelocidad);
    paso(mat.gradiente, velocidad.escribir);
    velocidad.cambiar();

    cuadros += 1;
    seccion.dataset.tintaCuadros = String(cuadros);
  };

  /** Cuántas celdas de la cuadrícula de 64 × 64 tienen tinta que se vería: se reduce en la GPU y se lee de vuelta. */
  const contarCeldasConTinta = (): number => {
    mat.reducir.uniforms.uTinta.value = tinta.leer.texture;
    paso(mat.reducir, reduccion);
    renderer.readRenderTargetPixels(reduccion, 0, 0, LADO_REDUCCION, LADO_REDUCCION, lecturaReduccion);
    renderer.setRenderTarget(null);
    let celdas = 0;
    for (let i = 0; i < lecturaReduccion.length; i += 4) if (lecturaReduccion[i] > 0) celdas += 1;
    return celdas;
  };

  /** El dato vivo (T44): el % del home con tinta visible, entero. Avisa solo cuando cambia. */
  const publicarPintado = (celdas: number): void => {
    celdasConTinta = celdas;
    const porcentaje = Math.round((100 * celdas) / (LADO_REDUCCION * LADO_REDUCCION));
    if (porcentaje === pintado) return;
    pintado = porcentaje;
    opciones.alCambiarPintado(porcentaje);
  };

  const tic = (_tiempo: number, deltaMs: number): void => {
    const k = Math.min(deltaMs / MS_POR_CUADRO, PASO_MAXIMO);
    if (k <= 0) return;
    if (puntero.nuevo) {
      inmovil = 0;
      proximaRevision = DORMIR_TRAS_MS;
    } else {
      inmovil += deltaMs;
    }
    // K4: las salpicaduras bajan con p² al salir del home.
    simular(k, 1 - progreso * progreso);
    fluido.paso(deltaMs / 1000);
    dibujar();
    // El % pintado se mide cada 250 ms; con esa misma medida se decide si la simulación ya puede dormir.
    sinMedirPintado += deltaMs;
    if (sinMedirPintado >= MEDIR_PINTADO_CADA_MS) {
      sinMedirPintado = 0;
      publicarPintado(contarCeldasConTinta());
    }
    if (inmovil >= proximaRevision) {
      if (celdasConTinta > 0) proximaRevision = inmovil + REVISAR_CADA_MS;
      else dormir();
    }
  };

  // Con la simulación dormida nadie dibuja, pero el personaje sigue vivo: se dibuja cada vez que su video trae un
  // cuadro nuevo (con la simulación activa, `tic` ya dibuja en cada cuadro de pantalla).
  const ticPersonaje = (): void => {
    if (estado === 'dormida' && hayCuadroDelPersonaje()) dibujar();
  };

  const dormir = (): void => {
    gsap.ticker.remove(tic);
    publicarPintado(0);
    cambiarEstado('dormida');
  };

  const arrancar = (): void => {
    inmovil = 0;
    proximaRevision = DORMIR_TRAS_MS;
    puntero.tienePrevio = false;
    sinMedirPintado = 0;
    gsap.ticker.remove(tic);
    gsap.ticker.add(tic);
    gsap.ticker.remove(ticPersonaje);
    gsap.ticker.add(ticPersonaje);
    cambiarEstado('activa');
  };

  // ---- Entradas: el cursor y el dedo ----

  const alMover = (x: number, y: number): void => {
    if (estado === 'pausada') return;
    puntero.x = x;
    puntero.y = y;
    puntero.nuevo = true;
    efectoActivo = true;
    if (estado === 'dormida') arrancar();
  };
  const alPuntero = (e: PointerEvent): void => alMover(e.clientX, e.clientY);
  const alTocar = (e: TouchEvent): void => {
    const toque = e.touches[0];
    if (toque) alMover(toque.clientX, toque.clientY);
  };
  const quitarEfecto = (): void => {
    if (!efectoActivo) return;
    efectoActivo = false;
    fluido.soltar();
    // Dormida nadie dibuja: el filo se quita aquí.
    if (estado === 'dormida') dibujar();
  };
  const alSalirElPuntero = (): void => {
    puntero.tienePrevio = false;
    quitarEfecto();
  };
  const alSoltarElDedo = (): void => {
    puntero.tienePrevio = false;
    quitarEfecto();
  };
  // Un dedo nuevo no debe trazar una línea desde donde terminó el anterior.
  const alEmpezarAToca = (e: TouchEvent): void => {
    puntero.tienePrevio = false;
    alTocar(e);
  };
  const alPerderContexto = (e: Event): void => {
    e.preventDefault();
    opciones.alPerderContexto();
  };
  window.addEventListener('pointermove', alPuntero, { passive: true });
  window.addEventListener('touchstart', alEmpezarAToca, { passive: true });
  window.addEventListener('touchmove', alTocar, { passive: true });
  window.addEventListener('touchend', alSoltarElDedo, { passive: true });
  window.addEventListener('touchcancel', alSoltarElDedo, { passive: true });
  document.documentElement.addEventListener('pointerleave', alSalirElPuntero);
  lienzo.addEventListener('webglcontextlost', alPerderContexto);
  // El gancho de las pruebas: al ponerlo o quitarlo el canvas se vuelve a dibujar, aunque nada más lo haga.
  const observadorOculto = new MutationObserver(() => {
    if (estado !== 'pausada') dibujar();
  });
  observadorOculto.observe(seccion, { attributes: true, attributeFilter: ['data-personaje-oculto'] });

  // El primer cuadro ya muestra el titular: la capa base sola, sin tinta.
  redimensionar();
  dibujar();
  arrancar();

  return {
    get estado() {
      return estado;
    },
    redimensionar,
    ajustarCaida: (p: number, lavado: number): void => {
      progreso = Math.max(0, Math.min(1, p));
      mat.mezcla.uniforms.uLavado.value = Math.max(0, Math.min(1, lavado));
      // Con la simulación dormida nadie dibuja: el lavado se pinta aquí, sin simular.
      if (estado === 'dormida') dibujar();
    },
    pausar: (): void => {
      if (estado === 'pausada') return;
      gsap.ticker.remove(tic);
      gsap.ticker.remove(ticPersonaje);
      limpiar();
      publicarPintado(0);
      puntero.nuevo = false;
      puntero.tienePrevio = false;
      efectoActivo = false;
      fluido.detener();
      cambiarEstado('pausada');
    },
    reanudar: (): void => {
      if (estado !== 'pausada') return;
      dibujar();
      arrancar();
    },
    destruir: (): void => {
      gsap.ticker.remove(tic);
      gsap.ticker.remove(ticPersonaje);
      observadorOculto.disconnect();
      if (personaje) {
        personaje.video.removeEventListener('seeked', alSaltarElPersonaje);
        if (conAvisoDeCuadro) personaje.video.cancelVideoFrameCallback(avisoDeCuadro);
      }
      delete seccion.dataset.personajeCuadros;
      seccion.removeAttribute('data-personaje-lienzo');
      window.removeEventListener('pointermove', alPuntero);
      window.removeEventListener('touchstart', alEmpezarAToca);
      window.removeEventListener('touchmove', alTocar);
      window.removeEventListener('touchend', alSoltarElDedo);
      window.removeEventListener('touchcancel', alSoltarElDedo);
      document.documentElement.removeEventListener('pointerleave', alSalirElPuntero);
      lienzo.removeEventListener('webglcontextlost', alPerderContexto);
      for (const rt of [velocidad.leer, velocidad.escribir, presion.leer, presion.escribir, tinta.leer, tinta.escribir, divergencia, reduccion]) rt.dispose();
      for (const m of Object.values(mat)) m.dispose();
      fluido.dispose();
      const texturas: Array<Texture | null> = [texBase, texVideo, texPersonaje];
      for (const t of texturas) t?.dispose();
      geometria.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
