/**
 * El titular del N2 dibujado en WebGL, como Aikawa (pulido del 2026-10-03).
 *
 * El `h1[data-n2-titular]` se queda en el DOM: da el tamaño, la posición, el color y las animaciones de
 * entrada y salida (opacidad y `translateY`), y lo leen los lectores de pantalla. Sus letras se vuelven
 * transparentes y este módulo las dibuja en el canvas, debajo del cilindro, con dos efectos del ratón:
 * - el fluido (`FluidoN2`) desplaza las letras: `velocidad × 18·10⁻⁵`, recortado suave a 0,018;
 * - alrededor del cursor (256 px a 1440 de ancho, entre 80 y 360) el borde se desenfoca y toma un filo
 *   de arcoíris rojo, amarillo, cian y azul.
 * Los valores son los de Aikawa (`3-ESTADO`, «Lo que se sabe de los referentes»); la técnica está
 * reimplementada en `efecto-titular.ts`, que también usa el home (T36).
 */
import * as THREE from 'three';
import { GLSL_EFECTO_TITULAR, radioDelEfecto, RADIO } from './efecto-titular';

// Margen alrededor de la caja del h1 que cubre el desplazamiento del fluido y el desenfoque (px CSS)
const MARGEN = 64;

const VERTICE = /* glsl */ `
  uniform vec4 uCaja; // x0, y0, x1, y1 en uv de pantalla (y hacia arriba)
  varying vec2 vUv;
  void main() {
    vec2 t = position.xy * 0.5 + 0.5;
    vUv = mix(uCaja.xy, uCaja.zw, t);
    gl_Position = vec4(vUv * 2.0 - 1.0, 0.0, 1.0);
  }
`;

const FRAGMENTO = /* glsl */ `
  uniform sampler2D uTexto;
  uniform sampler2D uFluido;
  uniform float uConFluido;
  uniform vec2 uResolucion;   // px del lienzo (con DPR)
  uniform vec2 uDesplazamiento; // corrimiento del h1 desde que se dibujó, en uv
  uniform vec3 uColor;
  uniform float uOpacidad;
  uniform float uEfecto;      // 1 con el ratón encima de la página
  uniform vec2 uPuntero;      // px del lienzo, y hacia arriba
  uniform float uRadio;       // px del lienzo
  uniform float uDpr;
  varying vec2 vUv;

  float alfa(vec2 uv) {
    uv -= uDesplazamiento;
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 0.0;
    return texture2D(uTexto, uv).r;
  }

  // El desenfoque y el filo de arcoíris del cursor, y el desplazamiento del fluido (efecto-titular.ts)
  ${GLSL_EFECTO_TITULAR}

  void main() {
    vec2 uv = vUv;
    vec2 fuente = uConFluido > 0.5 ? fuenteDesplazada(uFluido, uv) : uv;

    float base = alfa(fuente);
    vec3 color = uColor;
    float a = base;

    if (uEfecto > 0.5) {
      aplicarFiloArcoiris(uv, fuente, base, uResolucion, uPuntero, uRadio, uDpr, color, a);
    }

    a *= uOpacidad;
    if (a < 0.002) discard;
    gl_FragColor = vec4(color, a);
  }
`;

interface Medida {
  clave: string;
  top: number;
}

export class TitularN2 {
  readonly malla: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;
  private readonly lienzo: HTMLCanvasElement;
  private readonly textura: THREE.CanvasTexture;
  private dibujado: Medida = { clave: '', top: 0 };
  private fuentesListas = false;
  private colorCss = '';

  constructor() {
    this.lienzo = document.createElement('canvas');
    this.lienzo.width = 2;
    this.lienzo.height = 2;
    this.textura = new THREE.CanvasTexture(this.lienzo);
    this.textura.colorSpace = THREE.NoColorSpace;
    this.textura.generateMipmaps = false;
    this.textura.minFilter = THREE.LinearFilter;
    this.textura.magFilter = THREE.LinearFilter;
    this.textura.flipY = true;

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTICE,
      fragmentShader: FRAGMENTO,
      uniforms: {
        uCaja: { value: new THREE.Vector4(0, 0, 1, 1) },
        uTexto: { value: this.textura },
        uFluido: { value: null },
        uConFluido: { value: 0 },
        uResolucion: { value: new THREE.Vector2(1, 1) },
        uDesplazamiento: { value: new THREE.Vector2() },
        uColor: { value: new THREE.Color(0, 0, 0) },
        uOpacidad: { value: 0 },
        uEfecto: { value: 0 },
        uPuntero: { value: new THREE.Vector2() },
        uRadio: { value: RADIO },
        uDpr: { value: 1 },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.malla = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.malla.frustumCulled = false;
    // Primero el titular, después el cilindro de vidrio encima
    this.malla.renderOrder = -100;

    if ('fonts' in document) {
      void document.fonts.ready.then(() => {
        this.fuentesListas = true;
        this.dibujado.clave = '';
      });
    }
  }

  /**
   * Sigue al h1 en cada cuadro. `puntero` en px CSS (null sin ratón), `fluido` la velocidad del fluido
   * o null si está quieto. Devuelve true si el titular se ve (para seguir dibujando).
   */
  actualizar(
    h1: HTMLElement,
    ancho: number,
    alto: number,
    dpr: number,
    puntero: { x: number; y: number } | null,
    fluido: THREE.Texture | null,
  ): boolean {
    const u = this.material.uniforms;
    const estilo = getComputedStyle(h1);
    const opacidad = Number(estilo.opacity) || 0;
    u.uOpacidad.value = opacidad;
    this.malla.visible = opacidad > 0.001;
    if (!this.malla.visible) return false;

    const caja = h1.getBoundingClientRect();
    const anchoPx = Math.max(1, Math.round(ancho * dpr));
    const altoPx = Math.max(1, Math.round(alto * dpr));
    // Lo que obliga a redibujar el texto; el corrimiento vertical (entrada y salida) va por uniforme
    const clave = [anchoPx, altoPx, caja.left.toFixed(1), caja.width.toFixed(1), estilo.fontSize, estilo.fontWeight,
      estilo.letterSpacing, estilo.lineHeight, h1.textContent, this.fuentesListas].join('|');
    if (clave !== this.dibujado.clave) {
      this.dibujar(h1, estilo, caja, anchoPx, altoPx, dpr);
      this.dibujado = { clave, top: caja.top };
    }

    if (estilo.color !== this.colorCss) {
      this.colorCss = estilo.color;
      const rgb = estilo.color.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0];
      (u.uColor.value as THREE.Color).setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);
    }

    const corrimiento = caja.top - this.dibujado.top;
    (u.uDesplazamiento.value as THREE.Vector2).set(0, -corrimiento / alto);
    (u.uResolucion.value as THREE.Vector2).set(anchoPx, altoPx);
    u.uDpr.value = dpr;

    // La malla cubre solo la caja del h1 más un margen (el fluido y el desenfoque se salen un poco)
    const x0 = (caja.left - MARGEN) / ancho;
    const x1 = (caja.right + MARGEN) / ancho;
    const y0 = 1 - (caja.bottom + MARGEN) / alto;
    const y1 = 1 - (caja.top - MARGEN) / alto;
    (u.uCaja.value as THREE.Vector4).set(
      Math.max(0, x0), Math.max(0, y0), Math.min(1, x1), Math.min(1, y1),
    );

    u.uFluido.value = fluido;
    u.uConFluido.value = fluido ? 1 : 0;
    if (puntero) {
      u.uEfecto.value = 1;
      (u.uPuntero.value as THREE.Vector2).set(puntero.x * dpr, (alto - puntero.y) * dpr);
      u.uRadio.value = radioDelEfecto(ancho) * dpr;
    } else {
      u.uEfecto.value = 0;
    }
    return true;
  }

  /** El texto en blanco sobre transparente, en el mismo lugar que el h1, a la resolución del canvas. */
  private dibujar(
    h1: HTMLElement,
    estilo: CSSStyleDeclaration,
    caja: DOMRect,
    anchoPx: number,
    altoPx: number,
    dpr: number,
  ): void {
    if (this.lienzo.width !== anchoPx || this.lienzo.height !== altoPx) {
      this.lienzo.width = anchoPx;
      this.lienzo.height = altoPx;
    }
    const ctx = this.lienzo.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, anchoPx, altoPx);
    ctx.scale(dpr, dpr);

    const tamano = parseFloat(estilo.fontSize) || 100;
    ctx.font = `${estilo.fontWeight} ${tamano}px ${estilo.fontFamily}`;
    const espaciado = parseFloat(estilo.letterSpacing);
    if ('letterSpacing' in ctx && Number.isFinite(espaciado)) {
      (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${espaciado}px`;
    }
    const texto = (h1.textContent ?? '').trim();
    const transformado = estilo.textTransform === 'uppercase' ? texto.toUpperCase() : texto;
    const medida = ctx.measureText(transformado);
    // La línea base como la pone CSS: medio interlineado arriba y el ascendente de la fuente
    const interlineado = parseFloat(estilo.lineHeight) || tamano;
    const ascendente = medida.fontBoundingBoxAscent || tamano * 0.8;
    const descendente = medida.fontBoundingBoxDescent || tamano * 0.2;
    const lineaBase = caja.top + (interlineado - (ascendente + descendente)) / 2 + ascendente;
    // El espaciado se suma también después de la última letra; CSS centra la línea con él
    const anchoTexto = medida.width;
    const x = caja.left + (caja.width - anchoTexto) / 2;

    ctx.fillStyle = 'rgb(255, 255, 255)';
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillText(transformado, x, lineaBase);
    this.textura.needsUpdate = true;
  }

  dispose(): void {
    this.material.dispose();
    this.malla.geometry.dispose();
    this.textura.dispose();
  }
}
