/**
 * El mundo del caso (N4) en WebGL, sobre el renderer persistente (T32).
 *
 * Por cuadro, en pases (todo sobre la misma cámara que el mundo N3, así la foto calza con su caja DOM):
 *  1. La escena: el fondo de cortinas (en el color del caso) y la foto, que mezcla dos fotos con el
 *     progreso del scroll (K7 de Zero).
 *  2. Las esquirlas de fondo (K6): una máscara de normales, ocluida por la foto, y un pase que desplaza la
 *     escena por esas normales con desenfoque de lente.
 *  3. Los cristales de la historia (K3 y K4): otra máscara de normales y un pase de composición que, donde
 *     hay cristal, toma la escena desplazada (refracción, dispersión, fresnel y brillo de arista).
 *  4. El texto impreso (K5): un plano hijo de cada cristal, encima de la refracción y sin prueba de
 *     profundidad, así gira con el cristal y no se dobla.
 * Todo se dibuja en render targets de 4 muestras (el antialias de Landberg) y se copia a pantalla.
 *
 * Para el regreso, la foto toma la forma y la luz de la tarjeta del N3 y vuela hasta su sitio en la cinta.
 * Este módulo no lee el DOM por cuadro: recibe la disposición de la ventana y el estado del scroll, y
 * devuelve la caja proyectada de cada cristal para que el controlador mueva su copia en el DOM.
 */
import * as THREE from 'three';
import type { RelevoVuelo } from '@/lib/navigation/vuelo';
import { alturaDelCristal, balanceoDelCristal, girarBalanceo, giroDelCristal, giroEnReposo, opacidadDelPaso, PROFUNDIDAD_CRISTAL, X_CRISTAL, type Balanceo } from '@/lib/n4/cristales';
import { formaCristal, type FormaCristal } from '@/lib/n4/forma';
import type { Disposicion } from '@/lib/n4/geometria';
import { NOMBRE_TIPO, type PasoVista } from '@/lib/n4/historia';
import { mezclaDelLimite } from '@/lib/n4/medios';
import { opacidadPaleta, poseColor, tintaSobre } from '@/lib/n4/paleta';
import { CAM_Z, FOV, SEMIALTO } from '../camara';
import { PASE_FRAGMENT, PASE_VERTEX } from '../n3/glsl';
import {
  CRISTALES_FRAGMENT,
  ESQUIRLAS_FRAGMENT,
  FONDO_FRAGMENT,
  MASCARA_FRAGMENT,
  MASCARA_VERTEX,
  MEDIO_FRAGMENT,
  MEDIO_VERTEX,
  PANTALLA_VERTEX,
  TEXTO_FRAGMENT,
  TEXTO_VERTEX,
  TINTE_FRAGMENT,
} from './glsl';
import { dibujarTextoCristal, fuentesDelTextoListas } from './texto';

// Muestras de los render targets (D4: el antialias de Landberg, como el N3)
const MUESTRAS = 4;
// Esquina de la tarjeta de la cinta (2 rem)
const ESQUINA_REM = 2;
// Toda espera tiene salida: una imagen que no carga, o un shader que no compila a tiempo, no frenan el caso
const TIEMPO_MAX_CARGA_MS = 6000;
const TIEMPO_MAX_PRECALENTAR_MS = 4000;
// Capas de la cámara: cada pase dibuja solo las suyas
const CAPA = { foto: 0, cristales: 1, esquirlas: 2, texto: 3, tinte: 4 } as const;
// Desenfoque de lente de las esquirlas de fondo (K6): máximo 16 px, radio de foco 0,3, caída 0,3
const DESENFOQUE_MAX_PX = 16;
const FOCO = 0.3;
const CAIDA = 0.3;
// La forma de cada cristal sale de una semilla fija por índice: las capturas se repiten
const SEMILLA_CRISTAL = 101;
const PASO_SEMILLA = 17;
const SEMILLA_ESQUIRLA = 5003;
const SEMILLA_COLOR = 9001;
// Los cristales de la paleta van delante de los de la historia
const Z_PALETA = 0.4;
// Separación mínima en z entre cristales (unidades del mundo): el siguiente va delante del anterior
const Z_ENTRE_CRISTALES = 0.05;
// Cuánto corre el paralaje de ratón a un cristal: fracción del alto de la ventana por unidad de |z|
const PARALAJE = 0.05;
// Cuánto suben las esquirlas de fondo por px de scroll: la mitad que los cristales (K6: 1,584 contra 2,64)
const VELOCIDAD_ESQUIRLAS = 0.6;

/** Las nueve esquirlas de fondo (K6): sin texto, más pequeñas y lejanas. x es fracción del ancho; yFija, la altura con movimiento reducido. */
const ESQUIRLAS: ReadonlyArray<{ x: number; yFija: number; ancho: number; z: number; giro: readonly [number, number, number] }> = [
  { x: 0.1, yFija: 0.3, ancho: 0.22, z: -6, giro: [0.2, -0.15, 0.5] },
  { x: 0.88, yFija: 0.18, ancho: 0.17, z: -8, giro: [-0.25, 0.2, -0.35] },
  { x: 0.3, yFija: 0.78, ancho: 0.24, z: -7, giro: [0.1, 0.25, 0.8] },
  { x: 0.62, yFija: 0.9, ancho: 0.18, z: -9, giro: [0.3, -0.1, -0.6] },
  { x: 0.04, yFija: 0.6, ancho: 0.15, z: -10, giro: [-0.2, -0.3, 0.3] },
  { x: 0.76, yFija: 0.55, ancho: 0.21, z: -7, giro: [0.15, 0.1, -0.9] },
  { x: 0.46, yFija: 0.12, ancho: 0.16, z: -9, giro: [-0.1, -0.2, 0.65] },
  { x: 0.2, yFija: 0.1, ancho: 0.14, z: -11, giro: [0.25, 0.15, -0.2] },
  { x: 0.94, yFija: 0.82, ancho: 0.19, z: -8, giro: [-0.3, 0.25, 0.45] },
];
// Dónde arranca cada esquirla bajo el borde de abajo (px, su centro): las primeras entran enseguida y las
// demás se espacian, así a medio camino de la historia se ven 4 o 5 a la vez
const ESQUIRLA_ARRANQUE_PX = [110, 230, 330, 470, 650, 850, 1100, 1400, 1700] as const;

export interface RectPlano {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DatosMedio {
  img: HTMLImageElement;
}

/** Lo que el controlador le dice al mundo en cada cuadro en que algo cambió. */
export interface EstadoMundo {
  /** Foto base (−1 es la portada) y cuánto se mezcla con la siguiente. */
  medio: number;
  mezcla: number;
  /** Posición del scroll virtual y tramo de un paso (px virtuales). */
  pos: number;
  tramo: number;
  reducido: boolean;
  /** Opacidad de las cortinas y de los cristales (0 al abrir desde el mundo y al volver). */
  alfaFondo: number;
  alfaCristales: number;
  /** Segundos desde que abrió el caso (el balanceo y el vaivén) y el número de cuadro (el grano). */
  tiempo: number;
  cuadro: number;
  /** Ratón, de −1 a 1 desde el centro de la ventana, ya suavizado. */
  raton: { x: number; y: number };
}

/** Lo que el mundo necesita saber del caso para armar sus cristales. */
export interface ConfigMundo {
  pasos: PasoVista[];
  /** El color de fondo del caso, ya en valores de 0 a 1 (los códigos sRGB, sin convertir). */
  fondo: [number, number, number];
  /** El crema del texto (el token de texto claro). */
  colorTexto: string;
  /** El oscuro para el hexadecimal sobre un color claro de la paleta. */
  colorOscuro: string;
  /** La paleta del design system (5 colores `#RRGGBB`), si el caso la trae. */
  paleta: string[];
}

/** La caja proyectada de un cristal en la ventana (px) y su opacidad. */
export interface CajaCristal {
  x: number;
  y: number;
  ancho: number;
  alto: number;
  opacidad: number;
}

interface Imagen {
  tex: THREE.Texture;
  aspecto: number;
}

interface Cristal {
  malla: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  forma: FormaCristal;
  balanceo: Balanceo;
  /** Los vértices del contorno (x, y, z) delante y detrás, para la caja proyectada. */
  puntos: Float32Array;
  texto: { malla: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>; textura: THREE.CanvasTexture } | null;
  /** Solo los de la paleta: la malla hija que pinta su color en la máscara de tinte. */
  tinte?: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
}

interface PasePantalla {
  escena: THREE.Scene;
  geometria: THREE.PlaneGeometry;
  material: THREE.ShaderMaterial;
}

/** El vuelo de regreso: de la caja de la foto al sitio de la tarjeta en la cinta. */
interface Regreso {
  origen: RectPlano;
  destino: RectPlano;
  /** Progreso 0..1 con la curva «ro». */
  p: number;
  /** Foto que se veía al empezar (índice de imagen; se funde con la portada, la imagen 0). */
  desde: number;
  remPx: number;
}

const esperar = (ms: number) => new Promise<void>((listo) => window.setTimeout(listo, ms));

function textura(fuente: TexImageSource): THREE.Texture {
  // Sin decodificar: el mundo trabaja con el color ya codificado (ver lib/three/n3/glsl.ts)
  const t = new THREE.Texture(fuente);
  t.colorSpace = THREE.NoColorSpace;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

const clave = (img: HTMLImageElement) => img.currentSrc || img.src;

/** `#RRGGBB` a canales de 0 a 1, sin convertir (el mundo trabaja con el color ya codificado). */
function hexACanales(hex: string): [number, number, number] {
  const h = /^#([0-9a-f]{6})$/i.exec(hex)?.[1] ?? '000000';
  return [0, 1, 2].map((k) => parseInt(h.slice(2 * k, 2 * k + 2), 16) / 255) as [number, number, number];
}

function geometriaDeForma(forma: FormaCristal): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(forma.posiciones, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(forma.normales, 3));
  return g;
}

/** Los vértices del contorno, delante y detrás: la caja proyectada sale de ellos. */
function puntosDelContorno(forma: FormaCristal): Float32Array {
  const n = forma.contorno.length / 2;
  const p = new Float32Array(n * 6);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 2; c++) {
      const o = (i * 2 + c) * 3;
      p[o] = forma.contorno[i * 2];
      p[o + 1] = forma.contorno[i * 2 + 1];
      p[o + 2] = c === 0 ? forma.grosor / 2 : -forma.grosor / 2;
    }
  }
  return p;
}

export class MundoN4 {
  /** true cuando hay algo nuevo que dibujar; `dibujar()` lo baja. */
  sucio = true;
  /** La portada ya tiene textura (la de la imagen o la del relevo del vuelo). */
  medioListo = false;
  /** Algo se mueve solo (el balanceo, el grano y el vaivén de las cortinas): hay que dibujar cada cuadro. */
  animado = false;
  /** La caja proyectada de cada cristal, en el orden de la historia. */
  readonly cajas: CajaCristal[];
  /** La caja proyectada de cada cristal de la paleta. */
  readonly cajasPaleta: CajaCristal[];

  private readonly escena = new THREE.Scene();
  private readonly camara = new THREE.PerspectiveCamera(FOV, 1, 0.1, 2000);
  private readonly camaraPantalla = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly geometria = new THREE.PlaneGeometry(1, 1, 24, 24);
  private readonly vacia = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  private readonly material: THREE.ShaderMaterial;
  private readonly malla: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly oclusor: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly fondo: PasePantalla;
  private readonly paseCopia: PasePantalla;
  private readonly paseCristales: PasePantalla;
  private readonly paseEsquirlas: PasePantalla;
  private readonly cristales: Cristal[] = [];
  private readonly esquirlas: Cristal[] = [];
  private readonly colores: Cristal[] = [];
  private readonly imagenes = new Map<string, Imagen>();
  private readonly claves: string[];
  private readonly fuentes: HTMLImageElement[];
  private rtEscena: THREE.WebGLRenderTarget | null = null;
  private rtMascaraFrente: THREE.WebGLRenderTarget | null = null;
  private rtMascaraFondo: THREE.WebGLRenderTarget | null = null;
  private rtEsquirlas: THREE.WebGLRenderTarget | null = null;
  private rtTinte: THREE.WebGLRenderTarget | null = null;
  private readonly tam = new THREE.Vector2();
  private readonly punto = new THREE.Vector3();
  private readonly colorLimpio = new THREE.Color();
  private ww = 1;
  private wh = 1;
  private W = 1;
  private disp: Disposicion | null = null;
  private rect: RectPlano = { x: 0, y: 0, width: 1, height: 1 };
  private regreso: Regreso | null = null;
  private ultimoEstado: EstadoMundo | null = null;
  private hayCristales = false;
  private hayEsquirlas = false;
  private hayColores = false;
  private destruido = false;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    medios: DatosMedio[],
    private readonly config: ConfigMundo,
  ) {
    this.fuentes = medios.map((m) => m.img);
    this.claves = this.fuentes.map(clave);
    this.vacia.needsUpdate = true;
    this.camara.position.set(0, 0, CAM_Z);
    this.camara.updateMatrixWorld(true);

    // La foto: un plano cuya pose sale de su rectángulo DOM
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        u_map0: { value: this.vacia },
        u_map1: { value: this.vacia },
        u_aspect0: { value: 1 },
        u_aspect1: { value: 1 },
        u_planeAspect: { value: 1 },
        u_mezcla: { value: 0 },
        u_corner: { value: 0 },
        u_W: { value: 1 },
        u_sheetP: { value: 0 },
        u_shade: { value: 0 },
        u_scrim: { value: 0 },
      },
      vertexShader: MEDIO_VERTEX,
      fragmentShader: MEDIO_FRAGMENT,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.malla = new THREE.Mesh(this.geometria, this.material);
    this.malla.frustumCulled = false; // la deformación ocurre en el shader
    this.malla.layers.set(CAPA.foto);
    this.escena.add(this.malla);

    // El oclusor: la misma foto, solo en profundidad, para que tape las esquirlas de fondo
    this.oclusor = new THREE.Mesh(this.geometria, new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide }));
    this.oclusor.frustumCulled = false;
    this.oclusor.renderOrder = -1;
    this.oclusor.layers.set(CAPA.esquirlas);
    this.escena.add(this.oclusor);

    this.fondo = this.crearPase(
      PANTALLA_VERTEX,
      FONDO_FRAGMENT,
      {
        u_fondo: { value: new THREE.Vector3(...config.fondo) },
        u_alfa: { value: 0 },
        u_tiempo: { value: 0 },
        u_cuadro: { value: 0 },
        u_aspecto: { value: 1 },
        u_mov: { value: 1 },
      },
    );
    this.paseCopia = this.crearPase(PASE_VERTEX, PASE_FRAGMENT, { tMundo: { value: this.vacia } });
    const comunes = { tEscena: { value: this.vacia }, tMascara: { value: this.vacia }, u_px: { value: new THREE.Vector2(1, 1) } };
    this.paseCristales = this.crearPase(PANTALLA_VERTEX, CRISTALES_FRAGMENT, { ...comunes, tTinte: { value: this.vacia }, u_conTinte: { value: 0 } });
    this.paseEsquirlas = this.crearPase(PANTALLA_VERTEX, ESQUIRLAS_FRAGMENT, {
      ...comunes,
      u_aspecto: { value: 1 },
      u_desenfoque: { value: DESENFOQUE_MAX_PX },
      u_foco: { value: FOCO },
      u_caida: { value: CAIDA },
    });

    // Los cristales de la historia: una forma por paso, con semilla fija
    config.pasos.forEach((_, k) => {
      this.cristales.push(this.crearCristal(formaCristal(SEMILLA_CRISTAL + k * PASO_SEMILLA), k, CAPA.cristales));
    });
    this.cajas = config.pasos.map(() => ({ x: 0, y: 0, ancho: 0, alto: 0, opacidad: 0 }));
    // Las esquirlas de fondo: sin texto, más delgadas
    ESQUIRLAS.forEach((_, j) => {
      this.esquirlas.push(this.crearCristal(formaCristal(SEMILLA_ESQUIRLA + j * 13, { grosor: 0.07 }), 100 + j, CAPA.esquirlas));
    });
    // La paleta del design system: un cristal por color, con una malla hija que pinta su color
    config.paleta.forEach((hex, i) => {
      const c = this.crearCristal(formaCristal(SEMILLA_COLOR + i * 31, { lados: 5 + (i % 2) }), 200 + i, CAPA.cristales);
      const material = new THREE.ShaderMaterial({
        uniforms: { u_color: { value: new THREE.Vector3(...hexACanales(hex)) }, u_alfa: { value: 1 } },
        vertexShader: MASCARA_VERTEX,
        fragmentShader: TINTE_FRAGMENT,
        side: THREE.DoubleSide,
        blending: THREE.NoBlending,
        toneMapped: false,
      });
      const tinte = new THREE.Mesh(c.malla.geometry, material);
      tinte.frustumCulled = false;
      tinte.layers.set(CAPA.tinte);
      c.malla.add(tinte);
      c.tinte = tinte;
      this.colores.push(c);
    });
    this.cajasPaleta = config.paleta.map(() => ({ x: 0, y: 0, ancho: 0, alto: 0, opacidad: 0 }));
  }

  private crearPase(vertex: string, fragment: string, uniforms: Record<string, THREE.IUniform>): PasePantalla {
    const geometria = new THREE.PlaneGeometry(2, 2);
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: vertex,
      fragmentShader: fragment,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const malla = new THREE.Mesh(geometria, material);
    malla.frustumCulled = false;
    const escena = new THREE.Scene();
    escena.add(malla);
    return { escena, geometria, material };
  }

  private crearCristal(forma: FormaCristal, indice: number, capa: number): Cristal {
    const material = new THREE.ShaderMaterial({
      uniforms: { u_alfa: { value: 1 } },
      vertexShader: MASCARA_VERTEX,
      fragmentShader: MASCARA_FRAGMENT,
      side: THREE.DoubleSide,
      blending: THREE.NoBlending,
      toneMapped: false,
    });
    const malla = new THREE.Mesh(geometriaDeForma(forma), material);
    malla.frustumCulled = false;
    malla.layers.set(capa);
    malla.visible = false;
    this.escena.add(malla);
    return { malla, forma, balanceo: balanceoDelCristal(indice), puntos: puntosDelContorno(forma), texto: null };
  }

  // ---------- Carga ----------

  /**
   * Prepara las texturas. La portada es lo único que se espera (con tiempo máximo); las demás fotos y el
   * texto de los cristales llegan después y marcan el cuadro como sucio. Siempre termina.
   */
  async cargar(): Promise<void> {
    void this.precalentar();
    if (this.fuentes.length > 0) {
      await this.cargarImagen(0);
      if (this.destruido) return;
      this.medioListo = true;
      this.sucio = true;
      for (let k = 1; k < this.fuentes.length; k++) {
        void this.cargarImagen(k).then(() => {
          this.sucio = true;
        });
      }
    }
    void this.prepararTextos();
  }

  private async cargarImagen(k: number): Promise<void> {
    const key = this.claves[k];
    if (this.imagenes.has(key)) return;
    const img = this.fuentes[k];
    if (!(img.complete && img.naturalWidth > 0)) {
      await Promise.race([
        new Promise<void>((listo) => {
          img.addEventListener('load', () => listo(), { once: true });
          img.addEventListener('error', () => listo(), { once: true });
        }),
        esperar(TIEMPO_MAX_CARGA_MS),
      ]);
    }
    // Otro medio con la misma imagen (o el relevo del vuelo) pudo llegar mientras tanto
    if (this.destruido || this.imagenes.has(key) || img.naturalWidth === 0) return;
    this.imagenes.set(key, { tex: textura(img), aspecto: img.naturalWidth / img.naturalHeight });
  }

  /** El texto de cada cristal se dibuja con las fuentes ya cargadas, una sola vez por caso. */
  private async prepararTextos(): Promise<void> {
    await fuentesDelTextoListas();
    if (this.destruido) return;
    this.config.pasos.forEach((paso, k) => {
      const c = this.cristales[k];
      if (c) this.imprimir(c, paso, this.config.colorTexto, 10 + k, NOMBRE_TIPO[paso.tipo]);
    });
    // La paleta: solo el hexadecimal, en crema o en oscuro según lo que contraste más con su color
    this.config.paleta.forEach((hex, i) => {
      const c = this.colores[i];
      if (c) this.imprimir(c, { tipo: 'resultado', destacado: hex.toUpperCase(), texto: '' }, tintaSobre(hex, this.config.colorTexto, this.config.colorOscuro), 30 + i);
    });
    // El shader del texto se compila ahora, no con el primer cristal que entra
    try {
      this.renderer.compile(this.escena, this.camara);
    } catch {
      // se compila al dibujar
    }
    this.sucio = true;
  }

  /** Imprime un texto en un cristal: un plano hijo con la textura de canvas, encima de la refracción. */
  private imprimir(c: Cristal, paso: PasoVista, color: string, orden: number, rotulo?: string): void {
    if (c.texto) return;
    const a = c.forma.areaTexto;
    const lienzo = dibujarTextoCristal(paso, a.ancho / a.alto, color, rotulo);
    const tex = new THREE.CanvasTexture(lienzo);
    tex.colorSpace = THREE.NoColorSpace;
    tex.premultiplyAlpha = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    const material = new THREE.ShaderMaterial({
      uniforms: { u_mapa: { value: tex }, u_alfa: { value: 1 } },
      vertexShader: TEXTO_VERTEX,
      fragmentShader: TEXTO_FRAGMENT,
      transparent: true,
      premultipliedAlpha: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const plano = new THREE.Mesh(new THREE.PlaneGeometry(a.ancho, a.alto), material);
    plano.position.set(a.cx, a.cy, c.forma.grosor / 2 + 0.002);
    plano.renderOrder = orden;
    plano.frustumCulled = false;
    plano.layers.set(CAPA.texto);
    c.malla.add(plano);
    c.texto = { malla: plano, textura: tex };
  }

  /**
   * Compila los shaders antes del primer cuadro, para que el primer dibujo no tenga un tirón. Cada
   * compilación va en su propio turno del navegador para que el vuelo de la pieza no se detenga de golpe.
   */
  private async precalentar(): Promise<void> {
    const r = this.renderer;
    // Las variantes de programa dependen del destino: los render targets y la pantalla son distintos
    const pasos: Array<[THREE.WebGLRenderTarget | null, THREE.Scene, THREE.Camera]> = [];
    const rt = this.asegurarRT();
    pasos.push([rt.escena, this.fondo.escena, this.camaraPantalla], [rt.escena, this.escena, this.camara]);
    pasos.push([rt.esquirlas, this.paseEsquirlas.escena, this.camaraPantalla]);
    pasos.push([null, this.paseCristales.escena, this.camaraPantalla], [null, this.paseCopia.escena, this.camaraPantalla], [null, this.escena, this.camara]);
    const inicio = performance.now();
    for (const [destino, escena, camara] of pasos) {
      // Toda espera tiene salida: si compilar tarda de más, el resto se compila al dibujar
      if (this.destruido || performance.now() - inicio > TIEMPO_MAX_PRECALENTAR_MS) return;
      try {
        const previo = r.getRenderTarget();
        r.setRenderTarget(destino);
        r.compile(escena, camara);
        r.setRenderTarget(previo);
      } catch {
        // sin precalentar, el primer cuadro compila al dibujar
      }
      await esperar(0);
    }
  }

  /**
   * Recibe la textura de la pieza que acaba de volar (ya está en la GPU): si es la imagen de la portada,
   * se dibuja con ella desde el primer cuadro, sin un cuadro negro. Devuelve si la usó.
   */
  recibirRelevo(r: RelevoVuelo): boolean {
    const tex = r.textura;
    if (this.destruido || !(tex instanceof THREE.Texture) || this.claves[0] !== r.fuente) {
      tex.dispose();
      return false;
    }
    this.imagenes.get(r.fuente)?.tex.dispose();
    this.imagenes.set(r.fuente, { tex, aspecto: r.aspecto });
    this.medioListo = true;
    this.sucio = true;
    return true;
  }

  // ---------- Medidas ----------

  /** Ajusta cámara, caja de la foto y render targets a la ventana. */
  ajustar(disp: Disposicion): void {
    this.disp = disp;
    this.ww = Math.max(1, disp.ancho);
    this.wh = Math.max(1, disp.alto);
    this.rect = disp.foto;
    // El renderer ya se redimensionó por su cuenta o lo hace ahora
    const contenedor = this.renderer.domElement.parentElement;
    if (contenedor) {
      const w = contenedor.clientWidth || this.ww;
      const h = contenedor.clientHeight || this.wh;
      this.renderer.getSize(this.tam);
      if (Math.round(this.tam.x) !== w || Math.round(this.tam.y) !== h) this.renderer.setSize(w, h);
    }
    this.camara.aspect = this.ww / this.wh;
    this.camara.updateProjectionMatrix();
    this.camara.updateMatrixWorld(true);
    this.W = SEMIALTO * (this.ww / this.wh);
    this.material.uniforms.u_W.value = this.W;
    this.fondo.material.uniforms.u_aspecto.value = this.ww / this.wh;
    this.paseEsquirlas.material.uniforms.u_aspecto.value = this.ww / this.wh;
    this.asegurarRT();
    this.sucio = true;
  }

  private nuevoRT(ancho: number, alto: number, muestras: number, profundidad: boolean): THREE.WebGLRenderTarget {
    return new THREE.WebGLRenderTarget(ancho, alto, { samples: muestras, depthBuffer: profundidad });
  }

  /** Crea los render targets o los redimensiona al tamaño del buffer de dibujo. */
  private asegurarRT() {
    this.renderer.getDrawingBufferSize(this.tam);
    const ancho = Math.max(1, this.tam.x);
    const alto = Math.max(1, this.tam.y);
    const encajar = (rt: THREE.WebGLRenderTarget | null, muestras: number, profundidad: boolean) => {
      if (!rt) return this.nuevoRT(ancho, alto, muestras, profundidad);
      if (rt.width !== ancho || rt.height !== alto) rt.setSize(ancho, alto);
      return rt;
    };
    this.rtEscena = encajar(this.rtEscena, MUESTRAS, false);
    this.rtMascaraFrente = encajar(this.rtMascaraFrente, MUESTRAS, true);
    this.rtMascaraFondo = encajar(this.rtMascaraFondo, MUESTRAS, true);
    this.rtEsquirlas = encajar(this.rtEsquirlas, 0, false);
    // La máscara de tinte solo existe si el caso trae paleta
    if (this.colores.length > 0) this.rtTinte = encajar(this.rtTinte, MUESTRAS, true);
    this.paseCristales.material.uniforms.u_px.value.set(1 / ancho, 1 / alto);
    this.paseEsquirlas.material.uniforms.u_px.value.set(1 / ancho, 1 / alto);
    // El desenfoque está en px CSS: en la máscara hay `ratio` píxeles por cada uno
    this.paseEsquirlas.material.uniforms.u_desenfoque.value = DESENFOQUE_MAX_PX * (ancho / this.ww);
    return { escena: this.rtEscena, frente: this.rtMascaraFrente, fondo: this.rtMascaraFondo, esquirlas: this.rtEsquirlas, tinte: this.rtTinte };
  }

  // ---------- Cuadro ----------

  private imagen(k: number): Imagen | null {
    const i = Math.min(this.claves.length - 1, Math.max(0, k));
    return this.imagenes.get(this.claves[i]) ?? null;
  }

  /** Pone la pose y los uniformes de todo para este cuadro y calcula las cajas de los cristales. */
  actualizar(e: EstadoMundo): void {
    this.ultimoEstado = e;
    this.animado = !e.reducido && e.alfaFondo > 0.001;
    this.actualizarFoto(e);
    this.actualizarFondo(e);
    if (this.disp) {
      this.actualizarCristales(e, this.disp);
      this.actualizarEsquirlas(e, this.disp);
    }
  }

  private actualizarFondo(e: EstadoMundo): void {
    const u = this.fondo.material.uniforms;
    u.u_alfa.value = e.alfaFondo;
    // Con movimiento reducido: sin vaivén de las cortinas y con el grano fijo
    u.u_mov.value = e.reducido ? 0 : 1;
    u.u_tiempo.value = e.reducido ? 0 : e.tiempo;
    u.u_cuadro.value = e.reducido ? 0 : e.cuadro;
  }

  private actualizarFoto(e: EstadoMundo): void {
    const u = this.material.uniforms;
    const regreso = this.regreso;
    const r: RectPlano = regreso ? this.rectDelRegreso(regreso) : this.rect;
    const p = regreso ? regreso.p : 0;

    // Fotos: la base y la siguiente (el medio −1 es la imagen 0); al volar de regreso, la que se veía se
    // funde con la portada
    const base = regreso ? regreso.desde : e.medio + 1;
    const alterno = regreso ? 0 : Math.min(this.claves.length - 1, e.medio + 2);
    const a = this.imagen(base) ?? this.imagen(0);
    const b = this.imagen(alterno) ?? a;
    u.u_map0.value = a?.tex ?? this.vacia;
    u.u_map1.value = b?.tex ?? this.vacia;
    u.u_aspect0.value = a?.aspecto ?? 1;
    u.u_aspect1.value = b?.aspecto ?? 1;
    u.u_mezcla.value = regreso ? (regreso.desde === 0 ? 0 : p) : e.mezcla;

    // Pose: el rectángulo en px pasa a unidades del mundo en z = 0 (K2)
    const cx = ((r.x + r.width / 2 - this.ww / 2) / (this.ww / 2)) * this.W;
    const cy = ((this.wh / 2 - (r.y + r.height / 2)) / (this.wh / 2)) * SEMIALTO;
    const sx = (r.width / this.ww) * 2 * this.W;
    const sy = (r.height / this.wh) * 2 * SEMIALTO;
    this.malla.position.set(cx, cy, 0);
    this.malla.scale.set(sx, sy, 1);
    this.oclusor.position.copy(this.malla.position);
    this.oclusor.scale.copy(this.malla.scale);
    u.u_planeAspect.value = r.width / r.height;
    u.u_corner.value = regreso ? (ESQUINA_REM * regreso.remPx * p) / r.height : 0;
    u.u_sheetP.value = p;
    u.u_shade.value = p;
    u.u_scrim.value = p;
  }

  /** Pone la pose de un cristal en px de la ventana y devuelve su caja proyectada. */
  private colocar(c: Cristal, cx: number, cy: number, anchoPx: number, z: number, giro: readonly [number, number, number], alfa: number) {
    const upx = (2 * SEMIALTO) / this.wh;
    // Un cristal lejano (z < 0) se corre hacia afuera para caer donde se pidió y se ve más pequeño
    const f = (CAM_Z - z) / CAM_Z;
    c.malla.position.set((cx - this.ww / 2) * upx * f, (this.wh / 2 - cy) * upx * f, z);
    c.malla.rotation.set(giro[0], giro[1], giro[2], 'XYZ');
    c.malla.scale.setScalar(anchoPx * upx);
    c.malla.material.uniforms.u_alfa.value = alfa;
    if (c.texto) c.texto.malla.material.uniforms.u_alfa.value = alfa;
    if (c.tinte) c.tinte.material.uniforms.u_alfa.value = alfa;
    c.malla.updateMatrixWorld(true);
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    const p = c.puntos;
    for (let i = 0; i < p.length; i += 3) {
      this.punto.set(p[i], p[i + 1], p[i + 2]).applyMatrix4(c.malla.matrixWorld).project(this.camara);
      const px = (this.punto.x * 0.5 + 0.5) * this.ww;
      const py = (-this.punto.y * 0.5 + 0.5) * this.wh;
      if (px < x0) x0 = px;
      if (px > x1) x1 = px;
      if (py < y0) y0 = py;
      if (py > y1) y1 = py;
    }
    return { x: x0, y: y0, ancho: x1 - x0, alto: y1 - y0 };
  }

  private actualizarCristales(e: EstadoMundo, d: Disposicion): void {
    const n = this.cristales.length;
    // Con paleta, la historia tiene un tramo más después: el último paso también sale (movimiento reducido)
    const tramos = n + (this.colores.length > 0 ? 1 : 0);
    let alguno = false;
    this.cristales.forEach((c, k) => {
      const reducido = e.reducido;
      const altura = reducido ? 0 : alturaDelCristal(k, e.pos, e.tramo, d.alto);
      const giroBase = reducido ? giroEnReposo(k) : giroDelCristal(k, e.pos, e.tramo);
      const extra = reducido ? ([0, 0, 0] as const) : girarBalanceo(c.balanceo, e.tiempo);
      const prof = PROFUNDIDAD_CRISTAL[k % PROFUNDIDAD_CRISTAL.length];
      // El paralaje de ratón corre cada cristal en sentido contrario al ratón (cero con el ratón al centro)
      const para = reducido ? 0 : PARALAJE * d.alto * prof;
      const cx = d.columnaX + X_CRISTAL[k % X_CRISTAL.length] * d.escalaX - e.raton.x * para;
      const cy = d.mesetaY - altura - e.raton.y * para;
      const alfa = e.alfaCristales * (reducido ? opacidadDelPaso(k, e.pos, e.tramo, tramos) : 1);
      const giro: [number, number, number] = [giroBase[0] + extra[0], giroBase[1] + extra[1], giroBase[2] + extra[2]];
      const caja = this.colocar(c, cx, cy, d.anchoCristal, Z_ENTRE_CRISTALES * (k % X_CRISTAL.length), giro, alfa);
      const dentro = caja.x + caja.ancho > 0 && caja.x < this.ww && caja.y + caja.alto > 0 && caja.y < this.wh;
      c.malla.visible = alfa > 0.002 && dentro;
      if (c.malla.visible) alguno = true;
      this.cajas[k] = { ...caja, opacidad: alfa };
    });
    // La paleta: sube en cascada en el tramo que sigue a la historia y se queda agrupada
    let algunColor = false;
    const alfaPaleta = e.alfaCristales * opacidadPaleta(n, e.pos, e.tramo, e.reducido);
    this.colores.forEach((c, i) => {
      const p = poseColor(i, n, e.pos, e.tramo, d, e.reducido);
      const extra = e.reducido ? ([0, 0, 0] as const) : girarBalanceo(c.balanceo, e.tiempo);
      const giro: [number, number, number] = [p.giro[0] + extra[0] * 0.6, p.giro[1] + extra[1] * 0.6, p.giro[2] + extra[2] * 0.6];
      const caja = this.colocar(c, p.cx, p.cy, p.ancho, Z_PALETA, giro, alfaPaleta);
      const dentro = caja.x + caja.ancho > 0 && caja.x < this.ww && caja.y + caja.alto > 0 && caja.y < this.wh;
      c.malla.visible = alfaPaleta > 0.002 && dentro;
      if (c.malla.visible) algunColor = true;
      this.cajasPaleta[i] = { ...caja, opacidad: c.malla.visible ? alfaPaleta : 0 };
    });
    this.hayColores = algunColor;
    this.hayCristales = alguno || algunColor;
  }

  private actualizarEsquirlas(e: EstadoMundo, d: Disposicion): void {
    // Solo aparecen desde que empieza la historia: con el título no hay ninguna
    const desde = e.reducido ? mezclaDelLimite(0, e.pos, e.tramo) : e.pos >= e.tramo ? 1 : 0;
    let alguna = false;
    this.esquirlas.forEach((c, j) => {
      const s = ESQUIRLAS[j];
      const alfa = e.alfaCristales * desde;
      if (alfa <= 0.002) {
        c.malla.visible = false;
        return;
      }
      const ancho = s.ancho * d.alto;
      const cx = s.x * d.ancho;
      const cy = e.reducido ? s.yFija * d.alto : d.alto + ESQUIRLA_ARRANQUE_PX[j] - VELOCIDAD_ESQUIRLAS * (e.pos - e.tramo);
      const caja = this.colocar(c, cx, cy, ancho, s.z, s.giro, alfa);
      const dentro = caja.x + caja.ancho > 0 && caja.x < this.ww && caja.y + caja.alto > 0 && caja.y < this.wh;
      c.malla.visible = dentro;
      if (dentro) alguna = true;
    });
    this.hayEsquirlas = alguna;
  }

  /** Dibuja todos los pases y copia el resultado a pantalla. */
  dibujar(): void {
    if (this.destruido) return;
    this.sucio = false;
    const r = this.renderer;
    const rt = this.asegurarRT();
    const estado = this.ultimoEstado;
    const antes = { destino: r.getRenderTarget(), auto: r.autoClear, alfa: r.getClearAlpha() };
    r.getClearColor(this.colorLimpio);
    r.autoClear = false;
    r.setClearColor(this.colorLimpio, 1);

    // 1. La escena: cortinas y foto
    r.setRenderTarget(rt.escena);
    r.clear();
    if (estado && estado.alfaFondo > 0.001) r.render(this.fondo.escena, this.camaraPantalla);
    this.camara.layers.set(CAPA.foto);
    r.render(this.escena, this.camara);
    let escena = rt.escena.texture;

    // 2. Las esquirlas de fondo: máscara ocluida por la foto y pase con desenfoque de lente
    if (this.hayEsquirlas) {
      r.setClearColor(this.colorLimpio, 0);
      r.setRenderTarget(rt.fondo);
      r.clear();
      this.camara.layers.set(CAPA.esquirlas);
      r.render(this.escena, this.camara);
      r.setClearColor(this.colorLimpio, 1);
      const u = this.paseEsquirlas.material.uniforms;
      u.tEscena.value = escena;
      u.tMascara.value = rt.fondo.texture;
      r.setRenderTarget(rt.esquirlas);
      r.render(this.paseEsquirlas.escena, this.camaraPantalla);
      escena = rt.esquirlas.texture;
    }

    // 3. Los cristales de frente y su texto; sin cristales, la escena pasa tal cual
    if (this.hayCristales) {
      r.setClearColor(this.colorLimpio, 0);
      r.setRenderTarget(rt.frente);
      r.clear();
      this.camara.layers.set(CAPA.cristales);
      r.render(this.escena, this.camara);
      // La máscara de tinte de la paleta (solo si se ve algún color)
      const u = this.paseCristales.material.uniforms;
      u.u_conTinte.value = 0;
      if (this.hayColores && rt.tinte) {
        r.setRenderTarget(rt.tinte);
        r.clear();
        this.camara.layers.set(CAPA.tinte);
        r.render(this.escena, this.camara);
        u.tTinte.value = rt.tinte.texture;
        u.u_conTinte.value = 1;
      }
      r.setClearColor(this.colorLimpio, 1);
      u.tEscena.value = escena;
      u.tMascara.value = rt.frente.texture;
      r.setRenderTarget(null);
      r.render(this.paseCristales.escena, this.camaraPantalla);
      this.camara.layers.set(CAPA.texto);
      r.render(this.escena, this.camara);
    } else {
      this.paseCopia.material.uniforms.tMundo.value = escena;
      r.setRenderTarget(null);
      r.render(this.paseCopia.escena, this.camaraPantalla);
    }

    this.camara.layers.set(CAPA.foto);
    r.setClearColor(this.colorLimpio, antes.alfa);
    r.autoClear = antes.auto;
    r.setRenderTarget(antes.destino);
  }

  // ---------- El regreso a la cinta ----------

  private rectDelRegreso(r: Regreso): RectPlano {
    const { origen: o, destino: d, p } = r;
    return {
      x: o.x + (d.x - o.x) * p,
      y: o.y + (d.y - o.y) * p,
      width: o.width + (d.width - o.width) * p,
      height: o.height + (d.height - o.height) * p,
    };
  }

  /** Empieza el regreso: la pieza vuela desde su caja hasta `destino` (la tarjeta en la cinta). */
  prepararRegreso(destino: RectPlano, remPx: number): void {
    const e = this.ultimoEstado;
    const visible = e ? (e.mezcla >= 0.5 ? e.medio + 1 : e.medio) : -1;
    this.regreso = { origen: this.rect, destino, p: 0, desde: visible + 1, remPx };
    this.sucio = true;
  }

  /** Progreso 0..1 del regreso (ya con la curva «ro»). */
  ponerRegreso(p: number): void {
    if (!this.regreso) return;
    this.regreso.p = p;
    this.sucio = true;
  }

  get volandoDeRegreso(): boolean {
    return this.regreso !== null;
  }

  dispose(): void {
    this.destruido = true;
    for (const { tex } of this.imagenes.values()) tex.dispose();
    this.imagenes.clear();
    for (const c of [...this.cristales, ...this.esquirlas, ...this.colores]) {
      c.malla.geometry.dispose();
      c.malla.material.dispose();
      c.tinte?.material.dispose();
      if (c.texto) {
        c.texto.textura.dispose();
        c.texto.malla.geometry.dispose();
        c.texto.malla.material.dispose();
      }
    }
    this.cristales.length = 0;
    this.esquirlas.length = 0;
    this.colores.length = 0;
    this.material.dispose();
    this.oclusor.material.dispose();
    this.geometria.dispose();
    this.vacia.dispose();
    for (const p of [this.fondo, this.paseCopia, this.paseCristales, this.paseEsquirlas]) {
      p.geometria.dispose();
      p.material.dispose();
    }
    for (const rt of [this.rtEscena, this.rtMascaraFrente, this.rtMascaraFondo, this.rtEsquirlas, this.rtTinte]) rt?.dispose();
    this.rtEscena = this.rtMascaraFrente = this.rtMascaraFondo = this.rtEsquirlas = this.rtTinte = null;
  }
}
