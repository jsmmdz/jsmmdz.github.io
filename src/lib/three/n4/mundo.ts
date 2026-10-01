/**
 * El medio del caso (N4) dibujado en WebGL sobre el renderer persistente.
 *
 * Un solo plano de 24 × 24 segmentos cuya pose sale de su rectángulo DOM (K2), con la misma cámara
 * que el mundo N3: en reposo calza con su caja a ±1 px. Mezcla dos medios con un fundido ligado al
 * scroll (ZK5) y se abomba con la velocidad del scroll (K7). Para el regreso toma la forma y la luz de
 * la tarjeta del N3 y vuela hasta su sitio en la cinta. Se dibuja en un render target de 4 muestras
 * que se copia a pantalla, igual que el N3 (el antialias de Landberg).
 *
 * Este módulo no lee el DOM por cuadro: recibe la caja del medio y el estado del scroll.
 */
import * as THREE from 'three';
import type { RelevoVuelo } from '@/lib/navigation/vuelo';
import { CAM_Z, FOV, SEMIALTO } from '../camara';
import { PASE_FRAGMENT, PASE_VERTEX } from '../n3/glsl';
import { MEDIO_FRAGMENT, MEDIO_VERTEX } from './glsl';

// Muestras del render target (D4: el antialias de Landberg, como el N3)
const MUESTRAS = 4;
// K7: A = i·|i|·0,22·H·1,3, con i = tanh(desfase / 900) y el desfase en px de Landberg
const CURVATURA_AMPLITUD = 0.22;
const CURVATURA_EXTRA = 1.3;
const CURVATURA_DIVISOR = 900;
// Una rueda de 100 son 35 px virtuales aquí y 250 px en Landberg: 2,5 / 0,35
const PX_LANDBERG_POR_PX_VIRTUAL = 2.5 / 0.35;
// Esquina de la tarjeta de la cinta (2 rem)
const ESQUINA_REM = 2;
// Toda espera tiene salida: si una imagen no carga en este tiempo, el medio queda sin ella
const TIEMPO_MAX_CARGA_MS = 6000;

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
  /** Medio base y cuánto se mezcla con el siguiente. */
  medio: number;
  mezcla: number;
  /** objetivo − posición del scroll virtual (px virtuales): de ahí sale la curvatura. */
  desfase: number;
  reducido: boolean;
}

interface Imagen {
  tex: THREE.Texture;
  aspecto: number;
}

/** El vuelo de regreso: de la caja del medio al sitio de la tarjeta en la cinta. */
interface Regreso {
  origen: RectPlano;
  destino: RectPlano;
  /** Progreso 0..1 con la curva «ro». */
  p: number;
  /** Medio que se veía al empezar (se funde con la portada, el medio 0). */
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

export class MundoN4 {
  /** true cuando hay algo nuevo que dibujar; `dibujar()` lo baja. */
  sucio = true;
  /** El medio 0 ya tiene textura (la de la imagen o la del relevo del vuelo). */
  medioListo = false;

  private readonly escena = new THREE.Scene();
  private readonly camara = new THREE.PerspectiveCamera(FOV, 1, 0.1, 2000);
  private readonly geometria = new THREE.PlaneGeometry(1, 1, 24, 24);
  private readonly vacia = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  private readonly material: THREE.ShaderMaterial;
  private readonly malla: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly imagenes = new Map<string, Imagen>();
  private readonly claves: string[];
  private readonly fuentes: HTMLImageElement[];
  private mundoRT: THREE.WebGLRenderTarget | null = null;
  private pase: { escena: THREE.Scene; camara: THREE.OrthographicCamera; geometria: THREE.PlaneGeometry; material: THREE.ShaderMaterial } | null = null;
  private readonly tam = new THREE.Vector2();
  private ww = 1;
  private wh = 1;
  private W = 1;
  private rect: RectPlano = { x: 0, y: 0, width: 1, height: 1 };
  private regreso: Regreso | null = null;
  private ultimoEstado: EstadoMundo = { medio: 0, mezcla: 0, desfase: 0, reducido: false };
  private destruido = false;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    medios: DatosMedio[],
  ) {
    this.fuentes = medios.map((m) => m.img);
    this.claves = this.fuentes.map(clave);
    this.vacia.needsUpdate = true;
    this.camara.position.set(0, 0, CAM_Z);
    this.camara.updateMatrixWorld(true);
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
        u_H: { value: SEMIALTO },
        u_sheetP: { value: 0 },
        u_bulge: { value: 0 },
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
    this.escena.add(this.malla);
  }

  // ---------- Carga ----------

  /**
   * Prepara las texturas. El medio 0 es lo único que se espera (con tiempo máximo); los demás llegan
   * después y marcan el cuadro como sucio. Siempre termina.
   */
  async cargar(): Promise<void> {
    if (this.fuentes.length === 0) return;
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

  /**
   * Recibe la textura de la pieza que acaba de volar (ya está en la GPU): si es la imagen del medio 0,
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

  /** Ajusta cámara, caja del medio y render target a la ventana. `caja` es el rectángulo DOM del medio (px CSS). */
  ajustar(caja: RectPlano, ancho: number, alto: number): void {
    this.ww = Math.max(1, ancho);
    this.wh = Math.max(1, alto);
    this.rect = caja;
    // El renderer ya se redimensionó por su cuenta o lo hace ahora: el medio no depende de ello salvo el RT
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
    this.ajustarRT();
    this.sucio = true;
  }

  private ajustarRT(): THREE.WebGLRenderTarget {
    this.renderer.getDrawingBufferSize(this.tam);
    const ancho = Math.max(1, this.tam.x);
    const alto = Math.max(1, this.tam.y);
    if (!this.mundoRT) {
      this.mundoRT = new THREE.WebGLRenderTarget(ancho, alto, { samples: MUESTRAS, depthBuffer: false });
    } else if (this.mundoRT.width !== ancho || this.mundoRT.height !== alto) {
      this.mundoRT.setSize(ancho, alto);
    }
    return this.mundoRT;
  }

  private asegurarPase(rt: THREE.WebGLRenderTarget) {
    if (this.pase) return this.pase;
    const geometria = new THREE.PlaneGeometry(2, 2);
    const material = new THREE.ShaderMaterial({
      uniforms: { tMundo: { value: rt.texture } },
      vertexShader: PASE_VERTEX,
      fragmentShader: PASE_FRAGMENT,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const malla = new THREE.Mesh(geometria, material);
    malla.frustumCulled = false;
    const escena = new THREE.Scene();
    escena.add(malla);
    this.pase = { escena, camara: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), geometria, material };
    return this.pase;
  }

  // ---------- Cuadro ----------

  private imagen(k: number): Imagen | null {
    const i = Math.min(this.claves.length - 1, Math.max(0, k));
    return this.imagenes.get(this.claves[i]) ?? null;
  }

  /** Pone la pose y los uniformes del plano para este cuadro. */
  actualizar(e: EstadoMundo): void {
    this.ultimoEstado = e;
    const u = this.material.uniforms;
    const regreso = this.regreso;
    const r: RectPlano = regreso ? this.rectDelRegreso(regreso) : this.rect;
    const p = regreso ? regreso.p : 0;

    // Medios: el base y el siguiente; al volar de regreso, el que se veía se funde con la portada (el medio 0)
    const base = regreso ? regreso.desde : e.medio;
    const alterno = regreso ? 0 : Math.min(this.claves.length - 1, e.medio + 1);
    const a = this.imagen(base) ?? this.imagen(0);
    const b = this.imagen(alterno) ?? a;
    u.u_map0.value = a?.tex ?? this.vacia;
    u.u_map1.value = b?.tex ?? this.vacia;
    u.u_aspect0.value = a?.aspecto ?? 1;
    u.u_aspect1.value = b?.aspecto ?? 1;
    u.u_mezcla.value = regreso ? (regreso.desde === 0 ? 0 : p) : e.mezcla;

    // K7: la curvatura solo sigue a la velocidad en el caso; al volar de regreso o con movimiento reducido es 0
    let bulge = 0;
    if (!regreso && !e.reducido) {
      const i = Math.tanh((e.desfase * PX_LANDBERG_POR_PX_VIRTUAL) / CURVATURA_DIVISOR);
      bulge = i * Math.abs(i) * CURVATURA_AMPLITUD * SEMIALTO * CURVATURA_EXTRA;
    }
    u.u_bulge.value = bulge;

    // Pose: el rectángulo en px pasa a unidades del mundo en z = 0 (K2)
    const cx = ((r.x + r.width / 2 - this.ww / 2) / (this.ww / 2)) * this.W;
    const cy = ((this.wh / 2 - (r.y + r.height / 2)) / (this.wh / 2)) * SEMIALTO;
    const sx = (r.width / this.ww) * 2 * this.W;
    const sy = (r.height / this.wh) * 2 * SEMIALTO;
    this.malla.position.set(cx, cy, 0);
    this.malla.scale.set(sx, sy, 1);
    u.u_planeAspect.value = r.width / r.height;
    u.u_corner.value = regreso ? (ESQUINA_REM * regreso.remPx * p) / r.height : 0;
    u.u_sheetP.value = p;
    u.u_shade.value = p;
    u.u_scrim.value = p;
  }

  /** Dibuja: escena al render target de 4 muestras y copia a pantalla. */
  dibujar(): void {
    if (this.destruido) return;
    this.sucio = false;
    const renderer = this.renderer;
    const rt = this.ajustarRT();
    const pase = this.asegurarPase(rt);
    renderer.setRenderTarget(rt);
    renderer.render(this.escena, this.camara);
    renderer.setRenderTarget(null);
    renderer.render(pase.escena, pase.camara);
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
    const { medio, mezcla } = this.ultimoEstado;
    this.regreso = { origen: this.rect, destino, p: 0, desde: mezcla >= 0.5 ? medio + 1 : medio, remPx };
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
    this.material.dispose();
    this.geometria.dispose();
    this.vacia.dispose();
    if (this.pase) {
      this.pase.geometria.dispose();
      this.pase.material.dispose();
      this.pase = null;
    }
    this.mundoRT?.dispose();
    this.mundoRT = null;
  }
}
