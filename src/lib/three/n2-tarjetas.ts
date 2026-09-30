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
}

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
  private roomEnvTexture: THREE.Texture | null = null;
  private onRequestRender?: (frames: number) => void;

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
    });

    this.actualizarAtributosEstado();
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
    });
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
    }
  }

  public dispose(): void {
    this.cancelarRespaldoSalida();
    this.isExitAnimating = false;
    this.exitCallback = null;

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
