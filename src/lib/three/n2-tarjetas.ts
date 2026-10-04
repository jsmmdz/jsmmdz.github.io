/**
 * n2-tarjetas.ts — Módulo Three.js para las tarjetas de vidrio 3D del menú N2.
 *
 * Implementa las 5 tarjetas de vidrio con grosor (BoxGeometry con 64 segmentos),
 * dobladas en el vertex shader con uCurva (curvo ↔ plano), materiales de vidrio
 * físico con RoomEnvironment, fresnel pow(1 - dot(N,V), 3.2), cantos iridiscentes
 * translúcidos blanco lila, nombre en vidrio sobre CanvasTexture en Unbounded 800
 * con refracción y filo brillante, reflejo desvanecido hacia abajo, y la secuencia
 * de salida medida de Aikawa (desaparición de vecinas y reflejo en <= 250 ms,
 * desenrollado a plano en 600 ms con ease-in-out, reposo quieto hasta 1200 ms).
 */
import * as THREE from 'three';
import { ALTO_TARJETA, CintasDeTarjeta, type Disposicion, type Punto2 } from './cinta-obra';
import { CINTA_FRAGMENT, CINTA_N2_VERTEX } from './cinta-obra/glsl';

export interface N2DisciplinaItem {
  slug: string;
  nombre: string;
  orden: number;
  texturaSrc: string;
  posterSrc: string;
  tieneMundo: boolean;
}

export interface N2TarjetasOpciones {
  radius?: number;
  height?: number;
  grosorRatio?: number;
  raton?: UniformesRaton;
}

/** Los uniformes de la luz del ratón, compartidos por todas las tarjetas (los mueve el gestor de escena). */
export interface UniformesRaton {
  uRaton: THREE.IUniform<THREE.Vector2>; // uv de pantalla, y hacia arriba, con el retardo de Aikawa
  uRatonActivo: THREE.IUniform<number>;
  uResolucion: THREE.IUniform<THREE.Vector2>; // px CSS del canvas
  uDpr: THREE.IUniform<number>;
}

// La luz del ratón sobre el vidrio, como Aikawa (pulido del 2026-10-03): un halo de 256 px alrededor del
// cursor, (1 − d/256)^2,4, que suma un brillo (0,1) y un arcoíris prismático (6,4) que pesa más en el canto
// y el fresnel. Aikawa saca los 4 colores del prisma de cada foto; aquí no hay foto y se usan los del canto
// tornasolado: rosa, lila, cian y azul.
const LUZ_RATON_GLSL = /* glsl */ `
  uniform vec2 uRaton;
  uniform float uRatonActivo;
  uniform vec2 uResolucion;
  uniform float uDpr;

  vec3 paletaPrisma(float t) {
    t = fract(t);
    float s1 = smoothstep(0.00, 0.22, t) - smoothstep(0.22, 0.44, t);
    float s2 = smoothstep(0.18, 0.42, t) - smoothstep(0.42, 0.68, t);
    float s3 = smoothstep(0.44, 0.70, t) - smoothstep(0.70, 0.90, t);
    float s4 = smoothstep(0.74, 0.92, t) + (1.0 - smoothstep(0.00, 0.12, t));
    vec3 c = vec3(0.96, 0.72, 0.85) * max(s1, 0.0) + vec3(0.79, 0.71, 0.95) * max(s2, 0.0)
      + vec3(0.62, 0.90, 0.96) * max(s3, 0.0) + vec3(0.55, 0.71, 0.85) * max(s4, 0.0);
    return c / max(s1 + s2 + s3 + s4, 0.0001);
  }

  // Devuelve la luz que se suma (rgb) y cuánto se vuelve visible el vidrio (a)
  vec4 luzRaton(vec3 n, vec3 v, vec2 uvCara) {
    if (uRatonActivo < 0.5) return vec4(0.0);
    vec2 pantalla = gl_FragCoord.xy / (uResolucion * uDpr);
    float d = length((pantalla - uRaton) * uResolucion);
    float influencia = pow(clamp(1.0 - d / 256.0, 0.0, 1.0), 2.4);
    if (influencia < 0.0001) return vec4(0.0);
    float nov = clamp(abs(dot(n, v)), 0.0, 1.0);
    float fres = pow(1.0 - nov, 3.0);
    float aro = pow(1.0 - nov, 1.35);
    float fase = (1.0 - nov) * 1.8 * 1.75
      + dot(n, normalize(vec3(0.28, 0.74, 0.61))) * 0.35 * 1.15
      + dot(n, normalize(vec3(-0.81, 0.22, 0.54))) * 0.18 * 1.15;
    vec3 prisma = paletaPrisma(fase * 1.12 + uvCara.x * 0.9 + uvCara.y * 0.35);
    float brillo = influencia * 0.1;
    vec3 luz = vec3(0.81) * (0.05 + 0.18 * aro) * brillo
      + vec3(0.92, 0.96, 1.0) * (0.04 + 0.14 * fres) * brillo
      + prisma * (0.06 + 0.22 * fres + 0.16 * aro) * influencia * 6.4;
    return vec4(luz, influencia);
  }
`;

export class N2TarjetasManager {
  private group: THREE.Group;
  private cardGroups: THREE.Group[] = [];
  private cardMeshes: THREE.Mesh[] = [];
  private reflMeshes: THREE.Mesh[] = [];
  private cardOpacityUniforms: THREE.IUniform<number>[] = [];
  private reflMaterials: THREE.ShaderMaterial[] = [];
  private textTextures: THREE.CanvasTexture[] = [];
  private texturesToDispose: THREE.Texture[] = [];
  private materialsToDispose: THREE.Material[] = [];
  private geometriesToDispose: THREE.BufferGeometry[] = [];

  private uniformCurva: THREE.IUniform<number> = { value: 1.0 };
  private uniformR: THREE.IUniform<number> = { value: 1.3 };
  private tempPunto = new THREE.Vector3();
  private raton: UniformesRaton = {
    uRaton: { value: new THREE.Vector2(0.5, 0.5) },
    uRatonActivo: { value: 0 },
    uResolucion: { value: new THREE.Vector2(1, 1) },
    uDpr: { value: 1 },
  };
  private roomEnvTexture: THREE.Texture | null = null;
  private onRequestRender?: (frames: number) => void;
  // La cinta de obra de las disciplinas sin casos (autor, 2026-10-04): una por tarjeta, o null
  private cintas: Array<CintasDeTarjeta | null> = [];
  private frenteCintas: Array<THREE.IUniform<number>> = [];
  private ultEstadoCintas = '';
  private readonly uResCinta: THREE.IUniform<THREE.Vector2> = { value: new THREE.Vector2(1, 1) };
  private readonly rayoCinta = new THREE.Raycaster();
  private readonly ndcCinta = new THREE.Vector2();
  private readonly invCinta = new THREE.Matrix4();
  private readonly oCinta = new THREE.Vector3();
  private readonly dCinta = new THREE.Vector3();

  public readonly radius: number = 1.3;
  public readonly height: number = 0.95;
  public readonly grosor: number = 0.028; // ≈ 3 % del alto: canto delgado, como Aikawa (autor, 2026-09-29)
  public readonly cardWidth: number = 1.60;

  // Estado cinemático de la salida (flujo D)
  private isExitAnimating: boolean = false;
  private exitStartTime: number = 0;
  private exitActiveIndex: number = 0;
  private exitCallback: (() => void) | null = null;
  private exitTemporizador: number | null = null;

  constructor(group: THREE.Group, options?: N2TarjetasOpciones) {
    this.group = group;
    if (options?.radius) this.radius = options.radius;
    if (options?.height) this.height = options.height;
    if (options?.grosorRatio) {
      this.grosor = this.height * options.grosorRatio;
    }
    if (options?.raton) this.raton = options.raton;
    this.uniformR.value = this.radius;
  }

  /**
   * Genera el entorno de RoomEnvironment procesado por PMREMGenerator una sola vez.
   */
  public initEnvironment(renderer: THREE.WebGLRenderer): void {
    if (this.roomEnvTexture) return;
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = this.createRoomEnvironment();
    this.roomEnvTexture = pmremGenerator.fromScene(roomEnv).texture;
    pmremGenerator.dispose();
    // La escena solo servía para generar el PMREM: su geometría y sus materiales ya no hacen falta.
    this.liberarEscena(roomEnv);
    this.texturesToDispose.push(this.roomEnvTexture);
  }

  private liberarEscena(escena: THREE.Scene): void {
    escena.traverse((objeto) => {
      if (!(objeto instanceof THREE.Mesh)) return;
      objeto.geometry.dispose();
      const materiales: THREE.Material[] = Array.isArray(objeto.material) ? objeto.material : [objeto.material];
      materiales.forEach((m) => m.dispose());
    });
    escena.clear();
  }

  private createRoomEnvironment(): THREE.Scene {
    const scene = new THREE.Scene();
    const geometry = new THREE.BoxGeometry();
    geometry.deleteAttribute('uv');

    const roomMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.8, 0.8, 0.8),
      side: THREE.BackSide,
    });
    const room = new THREE.Mesh(geometry, roomMaterial);
    room.position.set(-0.757, 13.219, 0.717);
    room.scale.set(31.713, 28.305, 28.591);
    scene.add(room);

    const addLightPanel = (
      intensity: number,
      px: number,
      py: number,
      pz: number,
      sx: number,
      sy: number,
      sz: number
    ) => {
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(intensity, intensity, intensity),
      });
      const mesh = new THREE.Mesh(geometry, mat);
      mesh.position.set(px, py, pz);
      mesh.scale.set(sx, sy, sz);
      scene.add(mesh);
    };

    addLightPanel(50, -16.116, 14.37, 8.208, 0.1, 2.428, 2.739);
    addLightPanel(50, -16.109, 18.021, -8.207, 0.1, 2.425, 2.751);
    addLightPanel(17, 14.904, 12.198, -1.832, 0.15, 4.265, 6.331);
    addLightPanel(43, -0.462, 8.89, 14.52, 4.38, 5.441, 0.088);
    addLightPanel(20, 3.235, 11.486, -12.541, 2.5, 2.0, 0.1);
    addLightPanel(100, 0.0, 20.0, 0.0, 1.0, 0.1, 1.0);

    return scene;
  }

  /**
   * Construye las 5 tarjetas con grosor y sus reflejos para cada disciplina.
   */
  public setupCards(
    disciplinas: N2DisciplinaItem[],
    renderer: THREE.WebGLRenderer,
    onRequestRender: (frames: number) => void
  ): void {
    this.dispose();
    this.onRequestRender = onRequestRender;
    this.initEnvironment(renderer);

    const arc = (2 * Math.PI) / disciplinas.length;
    const cardGeo = new THREE.BoxGeometry(this.cardWidth, this.height, this.grosor, 64, 1, 1);
    this.geometriesToDispose.push(cardGeo);

    const reflHeight = this.height * 0.6;
    const reflGeo = new THREE.PlaneGeometry(this.cardWidth, reflHeight, 64, 1);
    reflGeo.translate(0, -this.height / 2 - reflHeight / 2, 0);
    this.geometriesToDispose.push(reflGeo);

    // Precargar fuente Unbounded 800 si está en el entorno del navegador
    this.precargarFuente();

    // La cinta de obra: cada disciplina sin casos toma otra disposición que la anterior y el texto se alterna
    let cintaAnterior: Disposicion | null = null;
    let cintaTexto = 0;
    const escalaCinta = this.height / ALTO_TARJETA;

    disciplinas.forEach((d, idx) => {
      const cardGroup = new THREE.Group();
      cardGroup.rotation.y = idx * arc;
      this.cardGroups.push(cardGroup);
      this.group.add(cardGroup);

      // 2. Textura del nombre en vidrio sobre la tarjeta
      const textCanvas = document.createElement('canvas');
      textCanvas.width = 1024;
      textCanvas.height = 608;
      this.dibujarTextoNombre(textCanvas, d.nombre);
      const textTex = new THREE.CanvasTexture(textCanvas);
      textTex.colorSpace = THREE.SRGBColorSpace;
      textTex.needsUpdate = true;
      this.textTextures.push(textTex);
      this.texturesToDispose.push(textTex);

      // 3. Uniforms de opacidad independientes para cada tarjeta
      const cardOpacity = { value: 1.0 };
      this.cardOpacityUniforms.push(cardOpacity);

      // 4. Cara: vidrio casi transparente sin foto (autor, 2026-09-29), con el nombre y el fresnel.
      //    La opacidad la calcula el fragment (más opaca de lado y en el nombre).
      const frontMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(0.93, 0.95, 1.0),
        roughness: 0.05,
        metalness: 0.0,
        clearcoat: 1.0,
        clearcoatRoughness: 0.05,
        envMap: this.roomEnvTexture,
        envMapIntensity: 1.0,
        transparent: true,
        depthWrite: false,
        side: THREE.FrontSide,
      });
      frontMat.defines = { ...frontMat.defines, USE_UV: '' };
      this.patchFrontMaterial(frontMat, textTex, cardOpacity);
      this.materialsToDispose.push(frontMat);

      // 5. Canto: delgado y tornasolado (rosa, lila, cian), no una franja blanca (autor, 2026-09-29)
      const edgeMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(0.78, 0.76, 0.9),
        roughness: 0.08,
        metalness: 0.0,
        clearcoat: 1.0,
        clearcoatRoughness: 0.05,
        iridescence: 1.0,
        iridescenceIOR: 1.6,
        iridescenceThicknessRange: [250, 900],
        envMap: this.roomEnvTexture,
        envMapIntensity: 1.2,
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      edgeMat.defines = { ...edgeMat.defines, USE_UV: '' };
      this.patchEdgeMaterial(edgeMat, cardOpacity);
      this.materialsToDispose.push(edgeMat);

      // 6. Material del dorso (cara interior hacia el centro del cilindro)
      //    Vidrio también: con la cara transparente, un dorso oscuro se vería a través.
      const backMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(0.93, 0.95, 1.0),
        roughness: 0.05,
        metalness: 0.0,
        envMap: this.roomEnvTexture,
        envMapIntensity: 0.6,
        transparent: true,
        opacity: 0.1,
        depthWrite: false,
        side: THREE.BackSide,
      });
      this.patchBackMaterial(backMat, cardOpacity);
      this.materialsToDispose.push(backMat);

      // Grupos de BoxGeometry: 0:+x, 1:-x, 2:+y, 3:-y, 4:+z (cara), 5:-z (dorso)
      const cardMaterials = [edgeMat, edgeMat, edgeMat, edgeMat, frontMat, backMat];
      const cardMesh = new THREE.Mesh(cardGeo, cardMaterials);
      cardMesh.userData = { slug: d.slug, nombre: d.nombre, index: idx };
      this.cardMeshes.push(cardMesh);
      cardGroup.add(cardMesh);

      // 7. Reflejo invertido: el vidrio y su nombre, que se desvanecen hacia abajo
      const reflMat = new THREE.ShaderMaterial({
        uniforms: {
          uTextMask: { value: textTex },
          uOpacity: { value: 0.35 },
          uCurva: this.uniformCurva,
          uR: this.uniformR,
        },
        vertexShader: `
          uniform float uCurva;
          uniform float uR;
          varying vec2 vUv;
          void main() {
            vUv = uv;
            float theta = position.x / uR;
            vec3 flatPos = vec3(position.x, position.y, uR);
            vec3 curvedPos = vec3(uR * sin(theta), position.y, uR * cos(theta));
            vec3 transformed = mix(flatPos, curvedPos, uCurva);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
          }
        `,
        fragmentShader: `
          uniform sampler2D uTextMask;
          uniform float uOpacity;
          varying vec2 vUv;
          void main() {
            // El reflejo muestra la mitad de abajo de la tarjeta, invertida
            float texto = texture2D(uTextMask, vec2(vUv.x, 1.0 - vUv.y * 0.6)).r;
            float fade = pow(vUv.y, 2.5) * uOpacity;
            gl_FragColor = vec4(vec3(1.0), (0.7 + texto * 0.3) * fade);
          }
        `,
        transparent: true,
        depthWrite: false,
        side: THREE.FrontSide,
      });
      this.reflMaterials.push(reflMat);
      this.materialsToDispose.push(reflMat);

      const reflMesh = new THREE.Mesh(reflGeo, reflMat);
      this.reflMeshes.push(reflMesh);
      cardGroup.add(reflMesh);

      // 8. La cinta de obra, si la disciplina todavía no tiene casos: sobre la cara, envolviendo el canto
      //    del vidrio (el doblez sigue por detrás y se ve a través de la tarjeta)
      const uFrente: THREE.IUniform<number> = { value: 1 };
      this.frenteCintas.push(uFrente);
      if (d.tieneMundo) {
        this.cintas.push(null);
        return;
      }
      const obra = new CintasDeTarjeta({
        aspecto: this.cardWidth / this.height,
        semilla: 9173 + idx * 7919,
        anterior: cintaAnterior,
        texto: cintaTexto,
        rCanto: this.grosor / 2 / escalaCinta,
        anisotropia: Math.min(8, renderer.capabilities.getMaxAnisotropy()),
        crearMaterial: (propios) =>
          new THREE.ShaderMaterial({
            uniforms: {
              ...propios,
              uCurva: this.uniformCurva,
              uR: this.uniformR,
              u_escala: { value: escalaCinta },
              u_zCara: { value: this.grosor / 2 },
              u_alpha: cardOpacity,
              u_ocultarDetras: { value: 0 },
              u_frente: uFrente,
              u_res: this.uResCinta,
            },
            defines: { SALIDA_LINEAL: '' },
            vertexShader: CINTA_N2_VERTEX,
            fragmentShader: CINTA_FRAGMENT,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
          }),
        alCargar: () => this.onRequestRender?.(2),
      });
      cintaAnterior = obra.disposicion;
      cintaTexto += obra.textos.length;
      for (const m of obra.mallas) cardGroup.add(m);
      this.cintas.push(obra);
    });

    this.actualizarAtributosEstado();
  }

  /**
   * El puntero (px CSS) sobre la cara curva de la tarjeta idx, en las coordenadas planas de su cinta (alto =
   * ALTO_TARJETA). El rayo del cursor se corta con el cilindro de la cara en el espacio de la tarjeta, así que
   * respeta el giro y la inclinación con el ratón. Null si no la toca.
   */
  private puntoEnTarjeta(idx: number, x: number, y: number, camara: THREE.PerspectiveCamera, ancho: number, alto: number): Punto2 | null {
    const grupo = this.cardGroups[idx];
    if (!grupo) return null;
    grupo.updateWorldMatrix(true, false);
    this.ndcCinta.set((x / ancho) * 2 - 1, -(y / alto) * 2 + 1);
    this.rayoCinta.setFromCamera(this.ndcCinta, camara);
    this.invCinta.copy(grupo.matrixWorld).invert();
    const o = this.oCinta.copy(this.rayoCinta.ray.origin).applyMatrix4(this.invCinta);
    const d = this.dCinta.copy(this.rayoCinta.ray.direction).transformDirection(this.invCinta);
    const R = this.radius + this.grosor / 2;
    const A = d.x * d.x + d.z * d.z;
    const B = 2 * (o.x * d.x + o.z * d.z);
    const C = o.x * o.x + o.z * o.z - R * R;
    const disc = B * B - 4 * A * C;
    if (A < 1e-9 || disc < 0) return null;
    const t = (-B - Math.sqrt(disc)) / (2 * A);
    if (t < 0) return null;
    const theta = Math.atan2(o.x + t * d.x, o.z + t * d.z);
    const k = this.height / ALTO_TARJETA;
    return { x: (theta * this.radius) / k, y: (o.y + t * d.y) / k };
  }

  /**
   * La física de la cinta de obra en este cuadro. El cursor solo la toca en reposo (no al girar, al formarse
   * el cilindro ni en la salida) y en las tarjetas que miran a la cámara. Devuelve si alguna se movió.
   */
  public moverCintas(
    dt: number,
    raton: { x: number; y: number } | null,
    camara: THREE.PerspectiveCamera,
    ancho: number,
    alto: number,
    anguloDeg: number,
    dpr: number,
  ): boolean {
    this.uResCinta.value.set(ancho * dpr, alto * dpr);
    const arc = (2 * Math.PI) / Math.max(1, this.cardMeshes.length);
    const giro = THREE.MathUtils.degToRad(anguloDeg);
    const enReposo = this.uniformCurva.value > 0.999 && !this.isExitAnimating;
    let movio = false;
    this.cintas.forEach((obra, idx) => {
      if (!obra) return;
      const deFrente = Math.cos(idx * arc - giro) > 0.3;
      // La que está agarrada sigue a la mano aunque el cilindro no esté del todo quieto
      const toca = (enReposo && deFrente) || obra.agarrada;
      const local = raton && toca ? this.puntoEnTarjeta(idx, raton.x, raton.y, camara, ancho, alto) : null;
      if (obra.paso(dt, local)) movio = true;
    });
    if (movio) {
      // El estado para las pruebas: si hay una agarrada y cuántas están rotas (solo cuando cambia)
      const agarrada = this.cintas.some((o) => o?.agarrada);
      const rotas = this.cintas.reduce((n, o) => n + (o ? o.rotas : 0), 0);
      const estado = `${agarrada ? 1 : 0},${rotas}`;
      const actN2 = document.getElementById('act-n2');
      if (actN2 && estado !== this.ultEstadoCintas) {
        this.ultEstadoCintas = estado;
        actN2.dataset.cintaAgarrada = agarrada ? '1' : '0';
        actN2.dataset.cintasRotas = String(rotas);
      }
    }
    return movio;
  }

  /**
   * Agarra la cinta bajo el puntero (px CSS) en una tarjeta de frente, en reposo: al jalarla se estira y, si
   * se jala de más, se rompe (autor, 2026-10-04). ¿Agarró alguna?
   */
  public agarrarCinta(x: number, y: number, camara: THREE.PerspectiveCamera, ancho: number, alto: number, anguloDeg: number): boolean {
    if (this.uniformCurva.value < 0.999 || this.isExitAnimating) return false;
    const arc = (2 * Math.PI) / Math.max(1, this.cardMeshes.length);
    const giro = THREE.MathUtils.degToRad(anguloDeg);
    for (let idx = 0; idx < this.cintas.length; idx++) {
      const obra = this.cintas[idx];
      if (!obra || Math.cos(idx * arc - giro) <= 0.3) continue;
      const local = this.puntoEnTarjeta(idx, x, y, camara, ancho, alto);
      if (local && obra.agarrar(local)) return true;
    }
    return false;
  }

  /** La mano suelta la cinta que tuviera. */
  public soltarCinta(): void {
    for (const obra of this.cintas) obra?.soltar();
  }

  /** El clic en una tarjeta sin casos: su cinta brinca donde se hizo clic. */
  public golpearCinta(slug: string, x: number, y: number, camara: THREE.PerspectiveCamera, ancho: number, alto: number): void {
    const idx = this.cardMeshes.findIndex((m) => m.userData?.slug === slug);
    const obra = this.cintas[idx];
    if (!obra) return;
    const local = this.puntoEnTarjeta(idx, x, y, camara, ancho, alto);
    if (local) obra.golpe(local.x, local.y);
  }

  /** Las cintas se ven solo si se ve su tarjeta. */
  private visibilidadCintas(): void {
    this.cintas.forEach((obra, idx) => {
      if (!obra) return;
      const visible = this.cardMeshes[idx]?.visible ?? false;
      for (const m of obra.mallas) m.visible = visible;
    });
  }

  /**
   * Inyecta deformación en vertex shader y efectos de vidrio en fragment shader de la cara frontal.
   */
  private patchFrontMaterial(
    mat: THREE.MeshPhysicalMaterial,
    textTex: THREE.CanvasTexture,
    cardOpacity: THREE.IUniform<number>
  ): void {
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uCurva = this.uniformCurva;
      shader.uniforms.uR = this.uniformR;
      shader.uniforms.uTextMask = { value: textTex };
      shader.uniforms.uCardOpacity = cardOpacity;
      Object.assign(shader.uniforms, this.raton);

      // Inyección en Vertex Shader
      shader.vertexShader = `
        uniform float uCurva;
        uniform float uR;
      ` + shader.vertexShader;

      shader.vertexShader = shader.vertexShader.replace(
        '#include <beginnormal_vertex>',
        `
        #include <beginnormal_vertex>
        float thetaNormal = position.x / uR;
        vec3 curvedNormal;
        curvedNormal.x = objectNormal.x * cos(thetaNormal) + objectNormal.z * sin(thetaNormal);
        curvedNormal.y = objectNormal.y;
        curvedNormal.z = -objectNormal.x * sin(thetaNormal) + objectNormal.z * cos(thetaNormal);
        objectNormal = normalize(mix(objectNormal, curvedNormal, uCurva));
        `
      );

      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        float theta = position.x / uR;
        float r = uR + position.z;
        vec3 flatPos = vec3(position.x, position.y, position.z + uR);
        vec3 curvedPos = vec3(r * sin(theta), position.y, r * cos(theta));
        transformed = mix(flatPos, curvedPos, uCurva);
        `
      );

      // Inyección en Fragment Shader
      shader.fragmentShader = `
        uniform sampler2D uTextMask;
        uniform float uCardOpacity;
        ${LUZ_RATON_GLSL}
      ` + shader.fragmentShader;

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        `
        // Pulido (auditoría T27 · E5): con un map, three (r152+) usa vMapUv y no define USE_UV;
        // con #ifdef USE_UV y vUv este bloque no se compilaba y ni el nombre ni el fresnel salían.
        // Sin foto (autor, 2026-09-29): USE_UV se fuerza en los defines para tener vUv.
        float textAlpha = texture2D(uTextMask, vUv).r;
        float edge = smoothstep(0.02, 0.25, textAlpha) * (1.0 - smoothstep(0.75, 0.98, textAlpha));
        vec3 nNormal = normalize(vNormal);
        // Pulido (auditoría T27 · E6): vViewPosition ya apunta del fragmento a la cámara. Con el signo
        // invertido, dot(N, V) ≈ −1 y el fresnel lavaba de celeste la tarjeta entera.
        vec3 nView = normalize(vViewPosition);
        float fresnelVal = pow(clamp(1.0 - dot(nNormal, nView), 0.0, 1.0), 3.2);
        // Tinte del borde: de cian a violeta a lo ancho, como la iridiscencia de Aikawa
        vec3 tinte = mix(vec3(0.62, 0.86, 1.0), vec3(0.86, 0.72, 1.0), vUv.x);
        outgoingLight += tinte * fresnelVal * 0.6;
        // El nombre: vidrio más claro, con un filo brillante
        outgoingLight = mix(outgoingLight, vec3(1.0), textAlpha * 0.55);
        outgoingLight += vec3(0.35, 0.45, 0.55) * edge;
        float alphaVidrio = mix(0.22, 0.75, fresnelVal);
        // La luz del ratón: el halo se nota también donde el vidrio es casi transparente
        vec4 luz = luzRaton(nNormal, nView, vUv);
        outgoingLight += luz.rgb;
        alphaVidrio = min(1.0, alphaVidrio + luz.a * 0.3);
        diffuseColor.a = max(alphaVidrio, textAlpha * 0.85) * uCardOpacity;
        #include <opaque_fragment>
        `
      );
    };
  }

  /**
   * Inyecta deformación en vertex shader de los cantos de la tarjeta.
   */
  private patchEdgeMaterial(mat: THREE.MeshPhysicalMaterial, cardOpacity: THREE.IUniform<number>): void {
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uCurva = this.uniformCurva;
      shader.uniforms.uR = this.uniformR;
      shader.uniforms.uCardOpacity = cardOpacity;
      Object.assign(shader.uniforms, this.raton);

      shader.vertexShader = `
        uniform float uCurva;
        uniform float uR;
      ` + shader.vertexShader;

      shader.vertexShader = shader.vertexShader.replace(
        '#include <beginnormal_vertex>',
        `
        #include <beginnormal_vertex>
        float thetaNormal = position.x / uR;
        vec3 curvedNormal;
        curvedNormal.x = objectNormal.x * cos(thetaNormal) + objectNormal.z * sin(thetaNormal);
        curvedNormal.y = objectNormal.y;
        curvedNormal.z = -objectNormal.x * sin(thetaNormal) + objectNormal.z * cos(thetaNormal);
        objectNormal = normalize(mix(objectNormal, curvedNormal, uCurva));
        `
      );

      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        float theta = position.x / uR;
        float r = uR + position.z;
        vec3 flatPos = vec3(position.x, position.y, position.z + uR);
        vec3 curvedPos = vec3(r * sin(theta), position.y, r * cos(theta));
        transformed = mix(flatPos, curvedPos, uCurva);
        `
      );

      shader.fragmentShader = `
        uniform float uCardOpacity;
        ${LUZ_RATON_GLSL}
      ` + shader.fragmentShader;

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        `
        vec4 luz = luzRaton(normalize(vNormal), normalize(vViewPosition), vUv);
        outgoingLight += luz.rgb;
        diffuseColor.a = min(1.0, diffuseColor.a + luz.a * 0.3) * uCardOpacity;
        #include <opaque_fragment>
        `
      );
    };
  }

  /**
   * Inyecta deformación en vertex shader de la cara trasera de la tarjeta.
   */
  private patchBackMaterial(mat: THREE.MeshPhysicalMaterial, cardOpacity: THREE.IUniform<number>): void {
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uCurva = this.uniformCurva;
      shader.uniforms.uR = this.uniformR;
      shader.uniforms.uCardOpacity = cardOpacity;

      shader.vertexShader = `
        uniform float uCurva;
        uniform float uR;
      ` + shader.vertexShader;

      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        float theta = position.x / uR;
        float r = uR + position.z;
        vec3 flatPos = vec3(position.x, position.y, position.z + uR);
        vec3 curvedPos = vec3(r * sin(theta), position.y, r * cos(theta));
        transformed = mix(flatPos, curvedPos, uCurva);
        `
      );

      shader.fragmentShader = `
        uniform float uCardOpacity;
      ` + shader.fragmentShader;

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        `
        diffuseColor.a *= uCardOpacity;
        #include <opaque_fragment>
        `
      );
    };
  }

  /**
   * Dibuja el nombre en blanco sobre canvas transparente con tipografía Unbounded 800.
   */
  private dibujarTextoNombre(canvas: HTMLCanvasElement, texto: string): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let fontSize = 90;
    ctx.font = `800 ${fontSize}px Unbounded, sans-serif`;
    // En mayúsculas y minúsculas normales, como Aikawa (autor, 2026-09-29)
    const measured = ctx.measureText(texto).width;
    const targetWidth = canvas.width * 0.60;
    if (measured > 0) {
      fontSize = Math.round(fontSize * (targetWidth / measured));
      fontSize = Math.min(Math.max(fontSize, 40), 120);
    }
    ctx.font = `800 ${fontSize}px Unbounded, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgb(255, 255, 255)';
    // Centrado en X, a ~45 % del alto
    ctx.fillText(texto, canvas.width * 0.5, canvas.height * 0.45);
  }

  /**
   * Espera a que el navegador cargue la fuente Unbounded 800 y redibuja las texturas de texto.
   */
  private precargarFuente(): void {
    if (typeof document !== 'undefined' && 'fonts' in document) {
      document.fonts.load('800 100px Unbounded').then(() => {
        this.cardMeshes.forEach((mesh, idx) => {
          const textTex = this.textTextures[idx];
          if (textTex && textTex.image instanceof HTMLCanvasElement) {
            const nombre = (mesh.userData?.nombre as string) || (mesh.userData?.slug as string) || '';
            this.dibujarTextoNombre(textTex.image, nombre);
            textTex.needsUpdate = true;
          }
        });
        if (this.onRequestRender) {
          this.onRequestRender(5);
        }
      }).catch(() => {});
    }
  }

  /**
   * Inicia la secuencia de salida medida de Aikawa (flujo D).
   */
  public startExitAnimation(activeSlug: string, onComplete?: () => void): void {
    const idx = this.cardMeshes.findIndex((m) => m.userData?.slug === activeSlug);
    this.exitActiveIndex = idx >= 0 ? idx : 0;
    this.isExitAnimating = true;
    this.exitStartTime = performance.now();
    this.exitCallback = onComplete || null;

    // Respaldo a los 1200 ms por si el render se pausa a mitad de la salida (un solo temporizador,
    // guardado para cancelarlo al volver a reposo o al liberar el módulo).
    this.cancelarRespaldoSalida();
    this.exitTemporizador = window.setTimeout(() => {
      this.exitTemporizador = null;
      if (this.isExitAnimating) {
        this.isExitAnimating = false;
        if (this.exitCallback) {
          const cb = this.exitCallback;
          this.exitCallback = null;
          cb();
        }
      }
    }, 1200);
  }

  private cancelarRespaldoSalida(): void {
    if (this.exitTemporizador !== null) {
      window.clearTimeout(this.exitTemporizador);
      this.exitTemporizador = null;
    }
  }

  /**
   * Actualiza la animación de salida en cada cuadro del bucle animate().
   */
  public updateExitAnimation(
    now: number,
    n2Camera: THREE.PerspectiveCamera,
    container: HTMLElement
  ): boolean {
    if (!this.isExitAnimating) return false;

    const elapsed = now - this.exitStartTime;

    // 1. 0 → <= 250 ms: se van el reflejo y las 4 tarjetas vecinas (spec T27)
    const pFade = Math.min(1, Math.max(0, elapsed / 250));
    const neighborOpacity = 1.0 - pFade;
    const reflOpacity = 0.35 * (1.0 - pFade);

    this.cardMeshes.forEach((mesh, idx) => {
      const opUniform = this.cardOpacityUniforms[idx];
      if (idx === this.exitActiveIndex) {
        if (opUniform) opUniform.value = 1.0;
        mesh.visible = true;
      } else {
        if (opUniform) opUniform.value = neighborOpacity;
        mesh.visible = elapsed < 250;
      }
    });

    this.reflMeshes.forEach((mesh, idx) => {
      const mat = this.reflMaterials[idx];
      if (mat) {
        mat.uniforms.uOpacity.value = reflOpacity;
      }
      mesh.visible = elapsed < 250;
    });
    this.visibilidadCintas();

    // 2. 0 → ≈ 600 ms: uCurva va de 1 a 0 con ease-in-out (a 300 ms va en 0.5)
    const pCurva = Math.min(1, Math.max(0, elapsed / 600));
    // Curva cúbica ease-in-out simétrica
    const easeCurva = pCurva < 0.5
      ? 4 * pCurva * pCurva * pCurva
      : 1 - Math.pow(-2 * pCurva + 2, 3) / 2;
    this.uniformCurva.value = Math.max(0, 1.0 - easeCurva);

    // Salida del titular [data-n2-titular] hacia arriba
    const titular = document.querySelector<HTMLElement>('[data-n2-titular]');
    if (titular) {
      const pTitular = Math.min(1, Math.max(0, elapsed / 600));
      const translateY = -pTitular * 350;
      titular.style.transform = `translateX(-50%) translateY(${translateY}px)`;
      titular.style.opacity = Math.max(0, 1.0 - pTitular * 1.5).toFixed(3);
    }

    // 3. Actualizar caja de la tarjeta activa en data-cilindro
    this.updateActiveCardBoundingBox(n2Camera, container);
    this.actualizarAtributosEstado();

    // 4. ≈ 1200 ms: finalizar y disparar transición al mundo
    if (elapsed >= 1200) {
      this.isExitAnimating = false;
      this.cancelarRespaldoSalida();
      if (this.exitCallback) {
        const cb = this.exitCallback;
        this.exitCallback = null;
        cb();
      }
      return false;
    }

    return true;
  }

  /**
   * Calcula la proyección 2D de la tarjeta activa durante la salida y actualiza data-cilindro.
   */
  public updateActiveCardBoundingBox(
    camera: THREE.PerspectiveCamera,
    container: HTMLElement
  ): void {
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    const yCenter = this.group.position.y;
    const scaleY = this.group.scale.y;
    const H = this.height * scaleY;
    const yMin = yCenter - H / 2;
    const yMax = yCenter + H / 2;
    const halfW = this.cardWidth / 2;
    const uCurva = this.uniformCurva.value;
    const R = this.radius;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    const v = new THREE.Vector3();

    // Muestreo a lo largo del ancho de la tarjeta activa orientada hacia el frente
    const pasos = 32;
    for (let i = 0; i <= pasos; i++) {
      const xLocal = -halfW + (i / pasos) * this.cardWidth;
      const theta = xLocal / R;
      const curvedX = R * Math.sin(theta);
      const curvedZ = R * Math.cos(theta);
      const flatX = xLocal;
      const flatZ = R;
      const px = flatX + (curvedX - flatX) * uCurva;
      const pz = flatZ + (curvedZ - flatZ) * uCurva;

      for (const py of [yMin, yMax]) {
        v.set(px, py, pz).project(camera);
        const sx = (v.x * 0.5 + 0.5) * width;
        const sy = (-v.y * 0.5 + 0.5) * height;
        if (sx < minX) minX = sx;
        if (sx > maxX) maxX = sx;
        if (sy < minY) minY = sy;
        if (sy > maxY) maxY = sy;
      }
    }

    const ancho = Math.round(maxX - minX);
    const alto = Math.round(maxY - minY);
    const x = Math.round(minX);
    const y = Math.round(minY);

    const actN2 = document.getElementById('act-n2');
    if (actN2) {
      actN2.dataset.cilindro = `${x},${y},${ancho},${alto}`;
    }
  }

  /**
   * Restablece el estado de reposo del menú (curvo, con vecinas y reflejo visibles).
   */
  public resetToReposo(): void {
    this.cancelarRespaldoSalida();
    this.isExitAnimating = false;
    this.exitCallback = null;
    this.uniformCurva.value = 1.0;

    this.cardMeshes.forEach((mesh, idx) => {
      const opUniform = this.cardOpacityUniforms[idx];
      if (opUniform) opUniform.value = 1.0;
      mesh.visible = true;
    });

    this.reflMeshes.forEach((mesh, idx) => {
      const mat = this.reflMaterials[idx];
      if (mat) {
        mat.uniforms.uOpacity.value = 0.35;
      }
      mesh.visible = true;
    });
    this.visibilidadCintas();

    const titular = document.querySelector<HTMLElement>('[data-n2-titular]');
    if (titular) {
      titular.style.transform = 'translateX(-50%)';
      titular.style.opacity = '1';
    }

    this.actualizarAtributosEstado();
  }

  /**
   * Con vidrio transparente importa el orden de dibujo, y todas las tarjetas tienen el mismo centro
   * (el doblado está en el shader): se dibujan de la más lejana a la más cercana según el giro.
   */
  public ordenarProfundidad(anguloDeg: number): void {
    const arc = (2 * Math.PI) / Math.max(1, this.cardMeshes.length);
    const giro = THREE.MathUtils.degToRad(anguloDeg);
    this.cardMeshes.forEach((mesh, idx) => {
      const cercania = Math.cos(idx * arc - giro); // 1 = de frente, −1 = atrás
      mesh.renderOrder = 10 + Math.round((cercania + 1) * 10);
      const refl = this.reflMeshes[idx];
      if (refl) refl.renderOrder = Math.round((cercania + 1) * 4);
      // La cinta, justo después de su tarjeta (antes de las que tiene delante)
      for (const m of this.cintas[idx]?.mallas ?? []) m.renderOrder = mesh.renderOrder + 0.5;
      // De espaldas la tarjeta casi no se ve (su dorso es tenue): la cinta se apaga con ella
      const uFrente = this.frenteCintas[idx];
      if (uFrente) uFrente.value = THREE.MathUtils.smoothstep(cercania, -0.05, 0.35);
    });
  }

  /**
   * La tarjeta bajo el puntero (x, y en px CSS), como Aikawa: el contorno doblado de cada tarjeta que mira
   * hacia la cámara se proyecta a pantalla y gana la más cercana que lo contenga. Usa las matrices reales,
   * así que respeta el giro y la inclinación con el ratón. Devuelve su slug o null.
   */
  public tarjetaBajo(
    x: number,
    y: number,
    camara: THREE.PerspectiveCamera,
    ancho: number,
    alto: number,
    anguloDeg: number,
  ): string | null {
    const arc = (2 * Math.PI) / Math.max(1, this.cardMeshes.length);
    const giro = THREE.MathUtils.degToRad(anguloDeg);
    const curva = this.uniformCurva.value;
    const R = this.radius;
    const medioAlto = this.height / 2;
    const medioAncho = this.cardWidth / 2;
    const pasos = 16;
    const v = this.tempPunto;
    let elegida: string | null = null;
    let profundidadMin = Infinity;

    this.cardMeshes.forEach((mesh, idx) => {
      if (!mesh.visible || Math.cos(idx * arc - giro) <= 0.05) return;
      const grupo = this.cardGroups[idx];
      grupo.updateWorldMatrix(true, false);
      // Las orillas de arriba y de abajo, proyectadas: [x, y, profundidad]
      const orillas = [medioAlto, -medioAlto].map((yLocal) => {
        const puntos: Array<[number, number, number]> = [];
        for (let i = 0; i <= pasos; i++) {
          const xLocal = -medioAncho + (i / pasos) * this.cardWidth;
          const theta = xLocal / R;
          const px = xLocal + (R * Math.sin(theta) - xLocal) * curva;
          const pz = R + (R * Math.cos(theta) - R) * curva;
          v.set(px, yLocal, pz).applyMatrix4(grupo.matrixWorld).project(camara);
          puntos.push([(v.x * 0.5 + 0.5) * ancho, (-v.y * 0.5 + 0.5) * alto, v.z]);
        }
        return puntos;
      });
      // Por tiras y no con el contorno entero: una tarjeta de los lados pasa por detrás de la silueta y su
      // contorno se dobla sobre sí mismo, y la franja junto a la silueta quedaba «fuera» (no se podía
      // pasar ni hacer clic ahí). Las tiras que miran hacia atrás (giradas en pantalla) no cuentan.
      const [arriba, abajo] = orillas;
      for (let i = 0; i < pasos; i++) {
        const tira: Array<[number, number]> = [
          [arriba[i][0], arriba[i][1]],
          [arriba[i + 1][0], arriba[i + 1][1]],
          [abajo[i + 1][0], abajo[i + 1][1]],
          [abajo[i][0], abajo[i][1]],
        ];
        let area = 0;
        for (let k = 0; k < 4; k++) {
          const [ax, ay] = tira[k];
          const [bx, by] = tira[(k + 1) % 4];
          area += ax * by - bx * ay;
        }
        if (area <= 0 || !puntoEnPoligono(x, y, tira)) continue;
        const profundidad = (arriba[i][2] + arriba[i + 1][2] + abajo[i][2] + abajo[i + 1][2]) / 4;
        if (profundidad < profundidadMin) {
          profundidadMin = profundidad;
          elegida = (mesh.userData?.slug as string) ?? null;
        }
      }
    });
    return elegida;
  }

  public getIsExitAnimating(): boolean {
    return this.isExitAnimating;
  }

  private actualizarAtributosEstado(): void {
    const actN2 = document.getElementById('act-n2');
    if (actN2) {
      actN2.dataset.tarjetas = '5';
      const ratio = this.grosor / this.height;
      actN2.dataset.grosor = ratio.toFixed(2);
      actN2.dataset.curva = this.uniformCurva.value.toFixed(2);
      actN2.dataset.cintas = String(this.cintas.reduce((n, c) => n + (c ? c.mallas.length : 0), 0));
    }
  }

  public dispose(): void {
    this.cancelarRespaldoSalida();
    this.isExitAnimating = false;
    this.exitCallback = null;

    this.cintas.forEach((c) => c?.dispose());
    this.cintas = [];
    this.frenteCintas = [];
    this.cardGroups.forEach((g) => {
      this.group.remove(g);
    });
    this.cardGroups = [];
    this.cardMeshes = [];
    this.reflMeshes = [];
    this.cardOpacityUniforms = [];
    this.reflMaterials = [];
    this.textTextures = [];

    this.texturesToDispose.forEach((t) => t.dispose());
    this.texturesToDispose = [];

    this.materialsToDispose.forEach((m) => m.dispose());
    this.materialsToDispose = [];

    this.geometriesToDispose.forEach((g) => g.dispose());
    this.geometriesToDispose = [];
    this.roomEnvTexture = null;
  }
}

/** Regla del rayo: el punto está dentro si cruza el contorno un número impar de veces. */
function puntoEnPoligono(x: number, y: number, contorno: Array<[number, number]>): boolean {
  let dentro = false;
  for (let i = 0, j = contorno.length - 1; i < contorno.length; j = i++) {
    const [xi, yi] = contorno[i];
    const [xj, yj] = contorno[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-6) + xi) dentro = !dentro;
  }
  return dentro;
}
