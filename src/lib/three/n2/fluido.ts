/**
 * El fluido del ratón que deforma el titular del N2, como Aikawa (pulido del 2026-10-03).
 *
 * Es la simulación clásica de fluidos estables en la GPU (advección, vorticidad, divergencia, presión
 * por Jacobi y resta del gradiente), reimplementada aquí con los valores que usa Aikawa. Solo se simula la
 * velocidad: el titular la lee para desplazar sus letras. No hay tinte.
 *
 * - Corre en el mismo renderer y con el reloj único: el gestor de escena llama a `paso()` en su cuadro.
 * - Solo simula mientras hay movimiento: si el ratón lleva quieto más que `QUIETO_MS`, deja de calcular y
 *   `activo` pasa a falso (la velocidad ya se disipó: e^(−2,8·3) ≈ 0,02 %).
 * - Con WebGL por software (las pruebas) baja a la resolución y las iteraciones del nivel bajo de Aikawa.
 */
import * as THREE from 'three';

// Valores de Aikawa (`3-ESTADO`, «Lo que se sabe de los referentes»)
const NIVELES = {
  alto: { resolucion: 256, iteraciones: 80 },
  bajo: { resolucion: 128, iteraciones: 32 },
} as const;
const DISIPACION_VELOCIDAD = 2.8;
const PRESION_INICIAL = 0.4;
const VORTICIDAD = 0.1;
const RADIO_SALPICADURA = 0.001;
const FUERZA_SALPICADURA = 12500;
const SEGUIMIENTO_PUNTERO = 18;
const AMORTIGUACION_PUNTERO = 0.82;
const DELTA_MINIMO = 15e-6;
const QUIETO_MS = 3000;

const VERTICE = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const ADVECCION = /* glsl */ `
  uniform sampler2D uVelocidad;
  uniform float uDt;
  uniform float uDisipacion;
  uniform vec2 uTexel;
  varying vec2 vUv;
  void main() {
    vec2 origen = vUv - uDt * texture2D(uVelocidad, vUv).xy * uTexel;
    gl_FragColor = texture2D(uVelocidad, origen) / (1.0 + uDisipacion * uDt);
  }
`;

const ROTACIONAL = /* glsl */ `
  uniform sampler2D uVelocidad;
  uniform vec2 uTexel;
  varying vec2 vUv;
  void main() {
    float izq = texture2D(uVelocidad, vUv - vec2(uTexel.x, 0.0)).y;
    float der = texture2D(uVelocidad, vUv + vec2(uTexel.x, 0.0)).y;
    float arr = texture2D(uVelocidad, vUv + vec2(0.0, uTexel.y)).x;
    float aba = texture2D(uVelocidad, vUv - vec2(0.0, uTexel.y)).x;
    gl_FragColor = vec4(der - izq - arr + aba, 0.0, 0.0, 1.0);
  }
`;

const VORTICIDAD_GLSL = /* glsl */ `
  uniform sampler2D uVelocidad;
  uniform sampler2D uRotacional;
  uniform float uFuerza;
  uniform float uDt;
  uniform vec2 uTexel;
  varying vec2 vUv;
  void main() {
    float izq = texture2D(uRotacional, vUv - vec2(uTexel.x, 0.0)).x;
    float der = texture2D(uRotacional, vUv + vec2(uTexel.x, 0.0)).x;
    float arr = texture2D(uRotacional, vUv + vec2(0.0, uTexel.y)).x;
    float aba = texture2D(uRotacional, vUv - vec2(0.0, uTexel.y)).x;
    float centro = texture2D(uRotacional, vUv).x;
    vec2 empuje = 0.5 * vec2(abs(arr) - abs(aba), abs(der) - abs(izq));
    empuje /= length(empuje) + 0.0001;
    empuje *= uFuerza * centro;
    empuje.y *= -1.0;
    vec2 v = texture2D(uVelocidad, vUv).xy + empuje * uDt;
    gl_FragColor = vec4(v, 0.0, 1.0);
  }
`;

const DIVERGENCIA = /* glsl */ `
  uniform sampler2D uVelocidad;
  uniform vec2 uTexel;
  varying vec2 vUv;
  void main() {
    float izq = texture2D(uVelocidad, vUv - vec2(uTexel.x, 0.0)).x;
    float der = texture2D(uVelocidad, vUv + vec2(uTexel.x, 0.0)).x;
    float arr = texture2D(uVelocidad, vUv + vec2(0.0, uTexel.y)).y;
    float aba = texture2D(uVelocidad, vUv - vec2(0.0, uTexel.y)).y;
    gl_FragColor = vec4(0.5 * (der - izq + arr - aba), 0.0, 0.0, 1.0);
  }
`;

const ESCALAR = /* glsl */ `
  uniform sampler2D uFuente;
  uniform float uValor;
  varying vec2 vUv;
  void main() {
    gl_FragColor = uValor * texture2D(uFuente, vUv);
  }
`;

const PRESION = /* glsl */ `
  uniform sampler2D uPresion;
  uniform sampler2D uDivergencia;
  uniform vec2 uTexel;
  varying vec2 vUv;
  void main() {
    float izq = texture2D(uPresion, vUv - vec2(uTexel.x, 0.0)).x;
    float der = texture2D(uPresion, vUv + vec2(uTexel.x, 0.0)).x;
    float arr = texture2D(uPresion, vUv + vec2(0.0, uTexel.y)).x;
    float aba = texture2D(uPresion, vUv - vec2(0.0, uTexel.y)).x;
    float div = texture2D(uDivergencia, vUv).x;
    gl_FragColor = vec4((izq + der + arr + aba - div) * 0.25, 0.0, 0.0, 1.0);
  }
`;

const GRADIENTE = /* glsl */ `
  uniform sampler2D uPresion;
  uniform sampler2D uVelocidad;
  uniform vec2 uTexel;
  varying vec2 vUv;
  void main() {
    float izq = texture2D(uPresion, vUv - vec2(uTexel.x, 0.0)).x;
    float der = texture2D(uPresion, vUv + vec2(uTexel.x, 0.0)).x;
    float arr = texture2D(uPresion, vUv + vec2(0.0, uTexel.y)).x;
    float aba = texture2D(uPresion, vUv - vec2(0.0, uTexel.y)).x;
    vec2 v = texture2D(uVelocidad, vUv).xy - vec2(der - izq, arr - aba);
    gl_FragColor = vec4(v, 0.0, 1.0);
  }
`;

const SALPICADURA = /* glsl */ `
  uniform sampler2D uVelocidad;
  uniform float uAspecto;
  uniform vec2 uPunto;
  uniform vec2 uFuerza;
  uniform float uRadio;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv - uPunto;
    p.x *= uAspecto;
    float gota = exp(-dot(p, p) / uRadio);
    gl_FragColor = vec4(texture2D(uVelocidad, vUv).xy + gota * uFuerza, 0.0, 1.0);
  }
`;

interface Doble {
  leer: THREE.WebGLRenderTarget;
  escribir: THREE.WebGLRenderTarget;
}

export class FluidoN2 {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly escena = new THREE.Scene();
  private readonly camara = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly malla: THREE.Mesh;
  private readonly materiales: THREE.ShaderMaterial[] = [];
  private readonly nivel: (typeof NIVELES)[keyof typeof NIVELES];

  private velocidad: Doble | null = null;
  private presion: Doble | null = null;
  private divergencia: THREE.WebGLRenderTarget | null = null;
  private rotacional: THREE.WebGLRenderTarget | null = null;
  private readonly texel = new THREE.Vector2();
  private ancho = 1;
  private alto = 1;

  // El puntero en coordenadas de la simulación (0–1, y hacia arriba), como Aikawa: un objetivo, una
  // posición que lo sigue con `1 − e^(−18·dt)` y un empuje amortiguado
  private conPuntero = false;
  private objetivo = new THREE.Vector2();
  private actual = new THREE.Vector2();
  private anterior = new THREE.Vector2();
  private empuje = new THREE.Vector2();
  private ultimoMovimiento = -Infinity;
  private limpio = true;

  private readonly mAdveccion: THREE.ShaderMaterial;
  private readonly mRotacional: THREE.ShaderMaterial;
  private readonly mVorticidad: THREE.ShaderMaterial;
  private readonly mDivergencia: THREE.ShaderMaterial;
  private readonly mEscalar: THREE.ShaderMaterial;
  private readonly mPresion: THREE.ShaderMaterial;
  private readonly mGradiente: THREE.ShaderMaterial;
  private readonly mSalpicadura: THREE.ShaderMaterial;

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    this.nivel = esPorSoftware(renderer) ? NIVELES.bajo : NIVELES.alto;
    const crear = (fragmentShader: string, uniforms: Record<string, THREE.IUniform>) => {
      const m = new THREE.ShaderMaterial({
        vertexShader: VERTICE,
        fragmentShader,
        uniforms,
        depthTest: false,
        depthWrite: false,
      });
      this.materiales.push(m);
      return m;
    };
    this.mAdveccion = crear(ADVECCION, { uVelocidad: { value: null }, uDt: { value: 0 }, uDisipacion: { value: DISIPACION_VELOCIDAD }, uTexel: { value: this.texel } });
    this.mRotacional = crear(ROTACIONAL, { uVelocidad: { value: null }, uTexel: { value: this.texel } });
    this.mVorticidad = crear(VORTICIDAD_GLSL, { uVelocidad: { value: null }, uRotacional: { value: null }, uFuerza: { value: VORTICIDAD }, uDt: { value: 0 }, uTexel: { value: this.texel } });
    this.mDivergencia = crear(DIVERGENCIA, { uVelocidad: { value: null }, uTexel: { value: this.texel } });
    this.mEscalar = crear(ESCALAR, { uFuente: { value: null }, uValor: { value: PRESION_INICIAL } });
    this.mPresion = crear(PRESION, { uPresion: { value: null }, uDivergencia: { value: null }, uTexel: { value: this.texel } });
    this.mGradiente = crear(GRADIENTE, { uPresion: { value: null }, uVelocidad: { value: null }, uTexel: { value: this.texel } });
    this.mSalpicadura = crear(SALPICADURA, { uVelocidad: { value: null }, uAspecto: { value: 1 }, uPunto: { value: new THREE.Vector2() }, uFuerza: { value: new THREE.Vector2() }, uRadio: { value: RADIO_SALPICADURA } });

    this.malla = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mAdveccion);
    this.malla.frustumCulled = false;
    this.escena.add(this.malla);
  }

  /** La textura de velocidad (en texeles por segundo) que lee el titular. */
  get textura(): THREE.Texture | null {
    return this.velocidad?.leer.texture ?? null;
  }

  /** Simula mientras el ratón se mueve y unos segundos después; quieto, no gasta nada. */
  get activo(): boolean {
    return performance.now() - this.ultimoMovimiento < QUIETO_MS;
  }

  /** La pantalla cambió de tamaño: la simulación conserva su lado corto y la proporción. */
  redimensionar(ancho: number, alto: number): void {
    this.ancho = Math.max(1, ancho);
    this.alto = Math.max(1, alto);
    let aspecto = this.ancho / this.alto;
    if (aspecto < 1) aspecto = 1 / aspecto;
    const corto = this.nivel.resolucion;
    const largo = Math.round(corto * aspecto);
    const w = this.ancho > this.alto ? largo : corto;
    const h = this.ancho > this.alto ? corto : largo;
    if (this.velocidad && this.velocidad.leer.width === w && this.velocidad.leer.height === h) return;
    this.liberarDestinos();
    const opciones = {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    };
    const rt = () => {
      const t = new THREE.WebGLRenderTarget(w, h, opciones);
      t.texture.generateMipmaps = false;
      return t;
    };
    this.velocidad = { leer: rt(), escribir: rt() };
    this.presion = { leer: rt(), escribir: rt() };
    this.divergencia = rt();
    this.rotacional = rt();
    this.texel.set(1 / w, 1 / h);
    this.limpio = false;
    this.limpiar();
  }

  /** El ratón se movió: `x`, `y` en px de pantalla. */
  mover(x: number, y: number): void {
    const u = x / this.ancho;
    const v = 1 - y / this.alto;
    this.objetivo.set(u, v);
    if (!this.conPuntero) {
      this.actual.set(u, v);
      this.anterior.set(u, v);
      this.conPuntero = true;
    }
    this.ultimoMovimiento = performance.now();
  }

  /** Olvida el puntero (se salió del menú): la próxima vez arranca sin un salto. */
  soltar(): void {
    this.conPuntero = false;
    this.empuje.set(0, 0);
  }

  /** Para del todo y deja la velocidad en cero (T36: el home lo usa al salir de él). El N2 no la llama. */
  detener(): void {
    this.ultimoMovimiento = -Infinity;
    this.soltar();
    if (!this.limpio) this.limpiar();
  }

  /** Un paso de la simulación. `dt` en segundos (se limita a 1/60 como Aikawa). */
  paso(dtSegundos: number): void {
    if (!this.velocidad || !this.presion || !this.divergencia || !this.rotacional) return;
    if (!this.activo) {
      if (!this.limpio) this.limpiar();
      return;
    }
    this.limpio = false;
    const dt = Math.min(Math.max(dtSegundos, 1e-4), 1 / 60);
    const destinoPrevio = this.renderer.getRenderTarget();

    this.empujarConPuntero(dt);

    this.mRotacional.uniforms.uVelocidad.value = this.velocidad.leer.texture;
    this.pasar(this.mRotacional, this.rotacional);

    this.mVorticidad.uniforms.uVelocidad.value = this.velocidad.leer.texture;
    this.mVorticidad.uniforms.uRotacional.value = this.rotacional.texture;
    this.mVorticidad.uniforms.uDt.value = dt;
    this.pasar(this.mVorticidad, this.velocidad.escribir);
    this.intercambiar(this.velocidad);

    this.mDivergencia.uniforms.uVelocidad.value = this.velocidad.leer.texture;
    this.pasar(this.mDivergencia, this.divergencia);

    this.mEscalar.uniforms.uFuente.value = this.presion.leer.texture;
    this.mEscalar.uniforms.uValor.value = PRESION_INICIAL;
    this.pasar(this.mEscalar, this.presion.escribir);
    this.intercambiar(this.presion);

    this.mPresion.uniforms.uDivergencia.value = this.divergencia.texture;
    for (let i = 0; i < this.nivel.iteraciones; i++) {
      this.mPresion.uniforms.uPresion.value = this.presion.leer.texture;
      this.pasar(this.mPresion, this.presion.escribir);
      this.intercambiar(this.presion);
    }

    this.mGradiente.uniforms.uPresion.value = this.presion.leer.texture;
    this.mGradiente.uniforms.uVelocidad.value = this.velocidad.leer.texture;
    this.pasar(this.mGradiente, this.velocidad.escribir);
    this.intercambiar(this.velocidad);

    this.mAdveccion.uniforms.uVelocidad.value = this.velocidad.leer.texture;
    this.mAdveccion.uniforms.uDt.value = dt;
    this.pasar(this.mAdveccion, this.velocidad.escribir);
    this.intercambiar(this.velocidad);

    this.renderer.setRenderTarget(destinoPrevio);
  }

  private empujarConPuntero(dt: number): void {
    if (!this.conPuntero || !this.velocidad) return;
    const seguir = 1 - Math.exp(-SEGUIMIENTO_PUNTERO * dt);
    this.anterior.copy(this.actual);
    this.actual.x += (this.objetivo.x - this.actual.x) * seguir;
    this.actual.y += (this.objetivo.y - this.actual.y) * seguir;
    const aspecto = this.ancho / this.alto;
    let dx = this.actual.x - this.anterior.x;
    let dy = this.actual.y - this.anterior.y;
    if (aspecto < 1) dx *= aspecto;
    if (aspecto > 1) dy /= aspecto;
    this.empuje.x = this.empuje.x * AMORTIGUACION_PUNTERO + dx * (1 - AMORTIGUACION_PUNTERO);
    this.empuje.y = this.empuje.y * AMORTIGUACION_PUNTERO + dy * (1 - AMORTIGUACION_PUNTERO);
    if (Math.abs(this.empuje.x) <= DELTA_MINIMO && Math.abs(this.empuje.y) <= DELTA_MINIMO) return;

    const u = this.mSalpicadura.uniforms;
    u.uVelocidad.value = this.velocidad.leer.texture;
    u.uAspecto.value = aspecto;
    (u.uPunto.value as THREE.Vector2).copy(this.actual);
    (u.uFuerza.value as THREE.Vector2).set(this.empuje.x * FUERZA_SALPICADURA, this.empuje.y * FUERZA_SALPICADURA);
    u.uRadio.value = aspecto > 1 ? RADIO_SALPICADURA * aspecto : RADIO_SALPICADURA;
    this.pasar(this.mSalpicadura, this.velocidad.escribir);
    this.intercambiar(this.velocidad);
  }

  /** Deja la velocidad y la presión en cero (al dormirse o al crear los destinos). */
  private limpiar(): void {
    if (!this.velocidad || !this.presion) return;
    const destinoPrevio = this.renderer.getRenderTarget();
    const colorPrevio = new THREE.Color();
    this.renderer.getClearColor(colorPrevio);
    const alfaPrevio = this.renderer.getClearAlpha();
    this.renderer.setClearColor(0x000000, 0);
    for (const rt of [this.velocidad.leer, this.velocidad.escribir, this.presion.leer, this.presion.escribir]) {
      this.renderer.setRenderTarget(rt);
      this.renderer.clear(true, false, false);
    }
    this.renderer.setClearColor(colorPrevio, alfaPrevio);
    this.renderer.setRenderTarget(destinoPrevio);
    this.empuje.set(0, 0);
    this.limpio = true;
  }

  private pasar(material: THREE.ShaderMaterial, destino: THREE.WebGLRenderTarget): void {
    this.malla.material = material;
    this.renderer.setRenderTarget(destino);
    this.renderer.render(this.escena, this.camara);
  }

  private intercambiar(d: Doble): void {
    const t = d.leer;
    d.leer = d.escribir;
    d.escribir = t;
  }

  private liberarDestinos(): void {
    for (const d of [this.velocidad, this.presion]) {
      d?.leer.dispose();
      d?.escribir.dispose();
    }
    this.divergencia?.dispose();
    this.rotacional?.dispose();
    this.velocidad = null;
    this.presion = null;
    this.divergencia = null;
    this.rotacional = null;
  }

  dispose(): void {
    this.liberarDestinos();
    this.materiales.forEach((m) => m.dispose());
    this.malla.geometry.dispose();
  }
}

/** WebGL por software (SwiftShader, llvmpipe): las pruebas sin GPU. */
function esPorSoftware(renderer: THREE.WebGLRenderer): boolean {
  try {
    const gl = renderer.getContext();
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const nombre = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    return /swiftshader|llvmpipe|software/i.test(nombre);
  } catch {
    return false;
  }
}
