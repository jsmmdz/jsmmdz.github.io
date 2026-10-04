/**
 * La tinta del home (T33): una simulación de fluidos que sigue al cursor (y al dedo) y deja ver, dentro
 * de las manchas, el video de materiales. Es la técnica de noth.in (ficha K1 y K2), reimplementada.
 *
 * Es la excepción escrita al «único canvas de WebGL» (docs/2-TECNICO.md § Motor): su canvas es propio,
 * solo vive en el home, se mueve con `gsap.ticker` (no abre su propio loop) y se pausa fuera del home
 * sin soltar el contexto. Este módulo importa three: se carga siempre con `import()`, nunca en el JS
 * inicial de `/`.
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
  VideoTexture,
  WebGLRenderer,
  WebGLRenderTarget,
  type IUniform,
  type MagnificationTextureFilter,
  type Texture,
  type TextureDataType,
} from 'three';
import { ADVECTAR, DIVERGENCIA, GRADIENTE, MEZCLA, PRESION, REDUCIR, SALPICAR, VERTICE } from './shaders';

/** Los valores de noth.in (ficha K1). Se afinan en el pulido, lado a lado con el referente. */
const AJUSTES = {
  resolucionVelocidad: 256,
  resolucionTinta: 512,
  disipacionVelocidad: 0.962,
  disipacionTinta: 0.988,
  iteracionesPresion: 20,
  radio: 6e-5,
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
  alCambiarEstado: (estado: EstadoTinta) => void;
  alPerderContexto: () => void;
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
      uTexto: { value: colorAVector(leerToken('--color-casa')) },
      uLavado: { value: 0 },
      uTieneVideo: { value: 0 },
      uAspectoVideo: { value: 16 / 9 },
      uAspectoPlano: { value: 1 },
      uTamano: { value: AJUSTES.tamanoRevelado },
      uBordeSuave: { value: AJUSTES.bordeSuave },
      uAnchoBorde: { value: AJUSTES.anchoBorde },
    }),
  };

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

  /**
   * Rasteriza el titular tal como está en el DOM: cada letra con su fuente, tamaño y posición reales
   * (la partimos en letras para la entrada, así que se dibuja letra por letra y no se pierde el
   * espaciado que el navegador le dio). Blanco sobre negro: el canal R es la cobertura.
   */
  const rasterizarTitular = (): void => {
    const dpr = renderer.getPixelRatio();
    const caja = seccion.getBoundingClientRect();
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
  };

  // ---- Estado ----

  let estado: EstadoTinta = 'pausada';
  let cuadros = 0;
  let progreso = 0;
  let inmovil = 0;
  let proximaRevision = DORMIR_TRAS_MS;
  const puntero = { x: 0, y: 0, tienePrevio: false, previoX: 0, previoY: 0, nuevo: false };

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
    paso(mat.mezcla, null);
  };

  const redimensionar = (): void => {
    const caja = seccion.getBoundingClientRect();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(Math.max(1, caja.width), Math.max(1, caja.height), false);
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

  /** ¿Queda tinta que se vería? Se reduce en la GPU a 64 × 64 y se lee de vuelta. */
  const quedaTinta = (): boolean => {
    mat.reducir.uniforms.uTinta.value = tinta.leer.texture;
    paso(mat.reducir, reduccion);
    renderer.readRenderTargetPixels(reduccion, 0, 0, LADO_REDUCCION, LADO_REDUCCION, lecturaReduccion);
    renderer.setRenderTarget(null);
    for (let i = 0; i < lecturaReduccion.length; i += 4) if (lecturaReduccion[i] > 0) return true;
    return false;
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
    dibujar();
    if (inmovil >= proximaRevision) {
      if (quedaTinta()) proximaRevision = inmovil + REVISAR_CADA_MS;
      else dormir();
    }
  };

  const dormir = (): void => {
    gsap.ticker.remove(tic);
    cambiarEstado('dormida');
  };

  const arrancar = (): void => {
    inmovil = 0;
    proximaRevision = DORMIR_TRAS_MS;
    puntero.tienePrevio = false;
    gsap.ticker.remove(tic);
    gsap.ticker.add(tic);
    cambiarEstado('activa');
  };

  // ---- Entradas: el cursor y el dedo ----

  const alMover = (x: number, y: number): void => {
    if (estado === 'pausada') return;
    puntero.x = x;
    puntero.y = y;
    puntero.nuevo = true;
    if (estado === 'dormida') arrancar();
  };
  const alPuntero = (e: PointerEvent): void => alMover(e.clientX, e.clientY);
  const alTocar = (e: TouchEvent): void => {
    const toque = e.touches[0];
    if (toque) alMover(toque.clientX, toque.clientY);
  };
  const alSalirElPuntero = (): void => {
    puntero.tienePrevio = false;
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
  document.documentElement.addEventListener('pointerleave', alSalirElPuntero);
  lienzo.addEventListener('webglcontextlost', alPerderContexto);

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
      limpiar();
      puntero.nuevo = false;
      puntero.tienePrevio = false;
      cambiarEstado('pausada');
    },
    reanudar: (): void => {
      if (estado !== 'pausada') return;
      dibujar();
      arrancar();
    },
    destruir: (): void => {
      gsap.ticker.remove(tic);
      window.removeEventListener('pointermove', alPuntero);
      window.removeEventListener('touchstart', alEmpezarAToca);
      window.removeEventListener('touchmove', alTocar);
      document.documentElement.removeEventListener('pointerleave', alSalirElPuntero);
      lienzo.removeEventListener('webglcontextlost', alPerderContexto);
      for (const rt of [velocidad.leer, velocidad.escribir, presion.leer, presion.escribir, tinta.leer, tinta.escribir, divergencia, reduccion]) rt.dispose();
      for (const m of Object.values(mat)) m.dispose();
      const texturas: Array<Texture | null> = [texBase, texVideo];
      for (const t of texturas) t?.dispose();
      geometria.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
