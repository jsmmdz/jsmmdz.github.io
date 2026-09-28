/**
 * Gestor de Escena Three.js para el mundo de la disciplina (N3).
 *
 * Implementa una escena persistente en #webgl-canvas-container:
 * - Grilla en perspectiva sobre negro con líneas crema sólidas (A1, landberg-01).
 * - Pantallas curvas apoyadas sobre el piso con textura de portada.
 * - Desplazamiento horizontal infinito con inercia exponencial independiente de fps:
 *   v *= exp(-dt / tau), con tau = 0.35 s.
 * - Curvatura dinámica de las pantallas proporcional a la velocidad (0 en reposo).
 * - Exposición de data-velocidad y data-curvatura en #act-n3 en cada cuadro.
 * - Movimiento reducido: arrastre 1:1, sin inercia ni curvatura al soltar.
 * - Soporte de teclado (flechas izquierda/derecha para navegar piezas).
 * - Sin hex suelto: colores tomados de tokens CSS o rgb().
 */
import * as THREE from 'three';
import { transicionConRespaldo } from '@/lib/navigation/instancia';

export interface InfinitePlaneItem {
  id: string;
  slug: string;
  titulo: string;
  disciplinaSlug: string;
  coords: { x: number; y: number; z: number };
  assetType: 'imagen' | 'video' | 'glb';
  assetSrc: string;
  poster?: string;
  href: string;
}

export interface N2DisciplinaItem {
  slug: string;
  nombre: string;
  orden: number;
  texturaSrc: string;
  posterSrc: string;
  tieneMundo: boolean;
}

export class ThreeSceneManager {
  private container: HTMLElement | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private gridLines: THREE.LineSegments | null = null;
  private screenMeshes: THREE.Mesh[] = [];
  private screenGeometry: THREE.BufferGeometry | null = null;
  private originalPlanePositions: Float32Array | null = null;
  private lastAppliedCurvature: number = 0;
  private materials: THREE.MeshBasicMaterial[] = [];
  private texturesToDispose: THREE.Texture[] = [];
  private geometriesToDispose: THREE.BufferGeometry[] = [];
  private materialsToDispose: THREE.Material[] = [];
  private activeDiscipline: string | null = null;
  private items: InfinitePlaneItem[] = [];
  private animFrameId: number | null = null;
  private isDisposed: boolean = false;
  private isPaused: boolean = false;
  private isN3Active: boolean = false;

  // Estado de transición de apertura de pieza (N3 -> N4 Landberg)
  public isExpanding: boolean = false;
  private expansionStartTime: number = 0;
  private expansionDuration: number = 600;
  private expansionStartCamPos: THREE.Vector3 = new THREE.Vector3();
  private expansionTargetCamPos: THREE.Vector3 = new THREE.Vector3();
  private expansionStartLookAt: THREE.Vector3 = new THREE.Vector3();
  private expansionTargetLookAt: THREE.Vector3 = new THREE.Vector3();
  private expansionOnComplete: (() => void) | null = null;
  private expansionCancel: (() => void) | null = null;

  // Estado y objetos de N2 (Menú circular Aikawa)
  private n2IsActive: boolean = false;
  private n2Camera: THREE.PerspectiveCamera | null = null;
  private n2Group: THREE.Group | null = null;
  private n2CylinderGroup: THREE.Group | null = null;
  private n2Materials: THREE.MeshBasicMaterial[] = [];
  private n2ReflectionMaterials: THREE.ShaderMaterial[] = [];
  private n2CurrentAngle: number = 0;
  private n2TargetAngle: number = 0;
  private n2AnimStartTime: number = 0;
  private n2AnimStartAngle: number = 0;
  private n2IsAnimating: boolean = false;
  private n2OnSettledCallback: (() => void) | null = null;
  private n2RingToCylinderAnimating: boolean = false;
  private n2RingAnimStartTime: number = 0;
  private n2RingAnimDuration: number = 1600;

  // Física y estado cinemático
  private currentX: number = 0;
  private currentVelocity: number = 0;
  private currentCurvature: number = 0;
  private pointerVelocity: number = 0;
  private isDragging: boolean = false;
  private lastPointerX: number = 0;
  private lastPointerTime: number = 0;
  private lastFrameTime: number = 0;
  private dragMovedDistance: number = 0;

  // Parámetros de diseño y spec de Landberg
  private readonly stride: number = 4.4;
  private readonly tau: number = 0.35; // Constante de tiempo de decaimiento (s)
  private readonly curvaturaBase: number = 0.6; // Curvatura de las pantallas en reposo (pulido, calcado de landberg-01)
  private readonly gridSpacing: number = 1.4;

  private raycaster: THREE.Raycaster = new THREE.Raycaster();
  private mouseVector: THREE.Vector2 = new THREE.Vector2();
  private tempVec: THREE.Vector3 = new THREE.Vector3();
  private onContextLostCallback?: () => void;
  private onNavigateCallback?: (href: string) => void;
  private eventsAttached: boolean = false;
  private needsRender: number = 3;

  public requestRender(frames: number = 3): void {
    this.needsRender = Math.max(this.needsRender, frames);
  }

  private ensureRenderer(container: HTMLElement): boolean {
    this.container = container;
    this.isDisposed = false;
    this.isPaused = false;
    this.attachEvents();
    if (this.animFrameId === null) {
      this.animate(performance.now());
    }

    if (this.renderer && container.contains(this.renderer.domElement)) {
      return true;
    }

    this.container = container;
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    try {
      let canvas = container.querySelector('canvas') as HTMLCanvasElement | null;
      if (!canvas) {
        canvas = document.createElement('canvas');
        container.innerHTML = '';
        container.appendChild(canvas);
      }
      const glContext = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!glContext) {
        return false;
      }

      if (!this.renderer) {
        this.renderer = new THREE.WebGLRenderer({
          canvas,
          antialias: false,
          alpha: true,
          powerPreference: 'high-performance',
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.setSize(width, height);
      }

      canvas.style.display = 'block';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.pointerEvents = 'auto';

      if (!this.scene) {
        this.scene = new THREE.Scene();
        this.scene.fog = null;
      }

      if (!this.camera) {
        this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
        this.camera.position.set(0, 1.45, 4.8);
        this.camera.lookAt(0, 1.55, 0);
      }

      if (!this.n2Camera) {
        this.n2Camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
        this.n2Camera.position.set(0, 0.25, 4.8);
        this.n2Camera.lookAt(0, 0.12, 0);
      }

      canvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        if (this.onContextLostCallback) this.onContextLostCallback();
      });

      this.attachEvents();
      this.isDisposed = false;
      this.isPaused = false;
      this.lastFrameTime = performance.now();

      if (this.animFrameId === null) {
        this.animate(performance.now());
      }

      return true;
    } catch {
      return false;
    }
  }

  public mount(
    container: HTMLElement,
    onContextLost?: () => void,
    onNavigate?: (href: string) => void
  ): boolean {
    this.onNavigateCallback = onNavigate;
    this.onContextLostCallback = onContextLost;

    if (!this.ensureRenderer(container)) {
      return false;
    }

    this.setN3Active(true);
    return true;
  }

  public setupN2Menu(
    container: HTMLElement,
    disciplinas: N2DisciplinaItem[],
    initialSlug: string = 'web',
    onSettled?: () => void
  ): boolean {
    if (!this.ensureRenderer(container)) {
      return false;
    }

    this.setN2Active(true);

    if (!this.n2Group && this.scene) {
      this.n2Group = new THREE.Group();
      this.n2CylinderGroup = new THREE.Group();
      this.n2Group.add(this.n2CylinderGroup);

      const R = 1.3;
      const H = 0.95;
      this.n2CylinderGroup.position.set(0, 0.35, 0);

      const arc = (2 * Math.PI) / 5;
      const loader = new THREE.TextureLoader();

      for (let i = 0; i < disciplinas.length; i++) {
        const d = disciplinas[i];
        const thetaCenter = i * arc;

        const tex = loader.load(d.texturaSrc, () => {
          this.requestRender(3);
        });
        tex.colorSpace = THREE.SRGBColorSpace;
        this.texturesToDispose.push(tex);

        const geo = new THREE.CylinderGeometry(R, R, H, 32, 1, true, thetaCenter - arc / 2, arc);
        const mat = new THREE.MeshBasicMaterial({
          map: tex,
          side: THREE.DoubleSide,
        });
        this.geometriesToDispose.push(geo);
        this.materialsToDispose.push(mat);
        this.n2Materials.push(mat);
        this.n2CylinderGroup.add(new THREE.Mesh(geo, mat));

        // Línea fina divisoria rgb(17, 17, 17) entre segmentos
        const thetaBoundary = thetaCenter + arc / 2;
        const divGeo = new THREE.CylinderGeometry(R * 1.002, R * 1.002, H, 2, 1, true, thetaBoundary - 0.006, 0.012);
        const divMat = new THREE.MeshBasicMaterial({
          color: new THREE.Color('rgb(17, 17, 17)'),
          side: THREE.DoubleSide,
        });
        this.geometriesToDispose.push(divGeo);
        this.materialsToDispose.push(divMat);
        this.n2CylinderGroup.add(new THREE.Mesh(divGeo, divMat));

        // Reflejo invertido hacia abajo con desvanecimiento
        const H_refl = H * 0.75;
        const y_refl = -H / 2 - H_refl / 2;
        const reflGeo = new THREE.CylinderGeometry(R, R, H_refl, 32, 1, true, thetaCenter - arc / 2, arc);
        reflGeo.translate(0, y_refl, 0);
        this.geometriesToDispose.push(reflGeo);

        const reflMat = new THREE.ShaderMaterial({
          uniforms: {
            map: { value: tex },
            uOpacity: { value: 0.5 },
          },
          vertexShader: `
            varying vec2 vUv;
            void main() {
              vUv = uv;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `,
          fragmentShader: `
            uniform sampler2D map;
            uniform float uOpacity;
            varying vec2 vUv;
            void main() {
              vec4 texColor = texture2D(map, vec2(vUv.x, 1.0 - vUv.y));
              float fade = pow(vUv.y, 2.5) * uOpacity;
              gl_FragColor = vec4(texColor.rgb, texColor.a * fade);
            }
          `,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        this.materialsToDispose.push(reflMat);
        this.n2ReflectionMaterials.push(reflMat);
        this.n2CylinderGroup.add(new THREE.Mesh(reflGeo, reflMat));
      }

      this.scene.add(this.n2Group);
    }

    const initialIdx = disciplinas.findIndex((d) => d.slug === initialSlug);
    const targetDeg = (initialIdx >= 0 ? initialIdx : 0) * 72;
    this.n2CurrentAngle = targetDeg;
    this.n2TargetAngle = targetDeg;
    this.n2IsAnimating = false;
    this.n2OnSettledCallback = onSettled || null;

    if (this.n2CylinderGroup) {
      this.n2CylinderGroup.rotation.y = -THREE.MathUtils.degToRad(this.n2CurrentAngle);
    }

    const hash = typeof window !== 'undefined' ? window.location.hash.replace('#', '') : '';
    const esN2 =
      (typeof document !== 'undefined' && document.body.dataset.currentLevel === 'N2') ||
      ['web', 'motion', '3d', 'videojuegos', 'editorial', 'disciplinas'].includes(hash);

    if (esN2) {
      this.setCylinderFormedImmediate();
    } else {
      this.prepareRingInitialState();
    }

    const actN2 = document.getElementById('act-n2');
    if (actN2) {
      actN2.dataset.angulo = this.n2CurrentAngle.toFixed(2);
    }

    this.requestRender(4);
    return true;
  }

  public updateCylinderBoundingBox(): void {
    if (!this.n2Camera || !this.container) return;
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.n2Camera.aspect = width / height;
    this.n2Camera.updateProjectionMatrix();

    const scaleY = this.n2CylinderGroup?.scale.y ?? 1;
    const R = 1.3;
    const H = 0.95 * scaleY;
    const yCenter = 0.35;
    const yMin = yCenter - H / 2;
    const yMax = yCenter + H / 2;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    const v = new THREE.Vector3();

    // Puntos extremos visibles frontales
    for (let a = -90; a <= 90; a += 2) {
      const rad = (a * Math.PI) / 180;
      const x = R * Math.sin(rad);
      const z = R * Math.cos(rad);
      for (const y of [yMin, yMax]) {
        v.set(x, y, z).project(this.n2Camera);
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
   * Transforma el anillo plano en cilindro en ≈ 1,6 s con curva ease-in-out (Aikawa paso 5 / T25).
   */
  public startRingToCylinderAnimation(durationMs: number = 1600): void {
    if (!this.n2CylinderGroup) return;
    this.n2RingToCylinderAnimating = true;
    this.n2RingAnimDuration = durationMs;
    this.n2RingAnimStartTime = performance.now();
    this.n2CylinderGroup.scale.y = 0.2;
    this.updateCylinderBoundingBox();

    const titular = document.querySelector<HTMLElement>('[data-n2-titular]');
    if (titular) {
      titular.style.opacity = '0';
    }
    this.resume();
    this.requestRender(120);
  }

  /**
   * Fija el cilindro ya formado (alto 100 %) y el titular visible al entrar directo o desde mundos.
   */
  public setCylinderFormedImmediate(): void {
    this.n2RingToCylinderAnimating = false;
    if (this.n2CylinderGroup) {
      this.n2CylinderGroup.scale.y = 1.0;
    }
    this.updateCylinderBoundingBox();

    const titular = document.querySelector<HTMLElement>('[data-n2-titular]');
    if (titular) {
      titular.style.opacity = '1';
    }
    this.requestRender(5);
  }

  /**
   * Prepara el estado inicial como anillo plano (< 35 % de alto) mientras se está en el home.
   */
  public prepareRingInitialState(): void {
    this.n2RingToCylinderAnimating = false;
    if (this.n2CylinderGroup) {
      this.n2CylinderGroup.scale.y = 0.2;
    }
    this.updateCylinderBoundingBox();

    const titular = document.querySelector<HTMLElement>('[data-n2-titular]');
    if (titular) {
      titular.style.opacity = '0';
    }
    this.requestRender(5);
  }

  public rotateN2ToAngle(targetAngleDeg: number, onSettled?: () => void): void {
    if (!this.n2CylinderGroup) return;
    this.n2AnimStartAngle = this.n2CurrentAngle;
    this.n2TargetAngle = targetAngleDeg;
    this.n2AnimStartTime = performance.now();
    this.n2IsAnimating = true;
    this.n2OnSettledCallback = onSettled || null;
    this.resume();
    this.requestRender(90);
  }

  public setN2AngleImmediate(angleDeg: number): void {
    if (!this.n2CylinderGroup) return;
    this.n2CurrentAngle = angleDeg;
    this.n2TargetAngle = angleDeg;
    this.n2IsAnimating = false;
    this.n2CylinderGroup.rotation.y = -THREE.MathUtils.degToRad(this.n2CurrentAngle);
    const actN2 = document.getElementById('act-n2');
    if (actN2) {
      actN2.dataset.angulo = this.n2CurrentAngle.toFixed(2);
    }
    this.updateCylinderBoundingBox();
    this.requestRender(15);
  }

  public getN2CurrentAngle(): number {
    return this.n2CurrentAngle;
  }

  public getN2TargetAngle(): number {
    return this.n2TargetAngle;
  }

  public getCylinderBox(): { x: number; y: number; ancho: number; alto: number } {
    const actN2 = document.getElementById('act-n2');
    const valor = actN2?.dataset.cilindro ?? '';
    if (valor) {
      const [x, y, ancho, alto] = valor.split(',').map(Number);
      return { x, y, ancho, alto };
    }
    return { x: 371, y: 212, ancho: 698, alto: 336 };
  }

  private attachEvents(): void {
    if (this.eventsAttached) return;
    this.eventsAttached = true;

    window.addEventListener('pointerdown', this.handlePointerDown);
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
    window.addEventListener('pointercancel', this.handlePointerUp);
    window.addEventListener('wheel', this.handleWheel, { passive: false });
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('resize', this.handleResize);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  private handlePointerDown = (e: PointerEvent): void => {
    if (this.isPaused || !this.isN3Active || this.isExpanding) return;
    const target = e.target as HTMLElement | null;
    if (target && target.closest('a, button, input, textarea, select')) {
      return;
    }
    this.isDragging = true;
    this.lastPointerX = e.clientX;
    this.lastPointerTime = performance.now();
    this.dragMovedDistance = 0;
    this.pointerVelocity = 0;
    this.requestRender(60);
  };

  private handlePointerMove = (e: PointerEvent): void => {
    if (!this.isDragging || this.isPaused || !this.isN3Active || this.isExpanding) return;
    const now = performance.now();
    const dt = Math.max((now - this.lastPointerTime) / 1000, 0.001);
    const deltaPx = e.clientX - this.lastPointerX;
    this.dragMovedDistance += Math.abs(deltaPx);

    const pixelsToWorld = 0.006;
    const deltaWorld = deltaPx * pixelsToWorld;

    this.currentX -= deltaWorld;

    const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      this.currentVelocity = 0;
      this.currentCurvature = 0;
    } else {
      const instV = -deltaWorld / dt;
      this.pointerVelocity = this.pointerVelocity * 0.3 + instV * 0.7;
      this.currentVelocity = this.pointerVelocity;
      this.currentCurvature = Math.max(-1, Math.min(1, this.currentVelocity * 0.04));
    }

    this.lastPointerX = e.clientX;
    this.lastPointerTime = now;
    this.requestRender(60);
  };

  private handlePointerUp = (e: PointerEvent): void => {
    if (!this.isDragging) return;
    this.isDragging = false;
    const now = performance.now();
    const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduced) {
      this.currentVelocity = 0;
      this.currentCurvature = 0;
    } else {
      if (now - this.lastPointerTime > 120) {
        this.currentVelocity = 0;
        this.currentCurvature = 0;
      } else {
        this.currentVelocity = this.pointerVelocity;
        this.currentCurvature = Math.max(-1, Math.min(1, this.currentVelocity * 0.04));
      }
    }
    this.requestRender(120);

    const act = document.getElementById('act-n3');
    if (act) {
      act.dataset.velocidad = (Math.abs(this.currentVelocity) < 0.0001 ? 0 : this.currentVelocity).toString();
      act.dataset.curvatura = (Math.abs(this.currentCurvature) < 0.0001 ? 0 : this.currentCurvature).toString();
    }

    // Clic en pantalla 3D si no hubo arrastre
    if (this.dragMovedDistance < 8 && this.renderer && this.camera && !this.isExpanding) {
      const rect = this.renderer.domElement.getBoundingClientRect();
      this.mouseVector.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouseVector.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this.raycaster.setFromCamera(this.mouseVector, this.camera);
      const intersects = this.raycaster.intersectObjects(this.screenMeshes);
      if (intersects.length > 0) {
        const topMesh = intersects[0].object;
        const href = topMesh.userData?.href as string | undefined;
        const slug = topMesh.userData?.slug as string | undefined;
        if (href && slug) {
          try {
            sessionStorage.setItem('n3_active_project', slug);
          } catch {}
          if (act) act.classList.add('n3-expandiendo');
          if (reduced) {
            transicionConRespaldo({ type: 'SELECT_PROJECT', projectSlug: slug }, 1200);
            if (this.onNavigateCallback) {
              this.onNavigateCallback(href);
            } else {
              window.location.href = href;
            }
          } else {
            this.expandProjectScreen(slug, 600)
              .then(() => {
                transicionConRespaldo({ type: 'SELECT_PROJECT', projectSlug: slug }, 1200);
                if (this.onNavigateCallback) {
                  this.onNavigateCallback(href);
                } else {
                  window.location.href = href;
                }
              })
              .catch(() => {
                if (act) act.classList.remove('n3-expandiendo');
              });
          }
        }
      }
    }
  };

  private handleWheel = (e: WheelEvent): void => {
    if (this.isPaused || !this.isN3Active || this.isExpanding) return;
    e.preventDefault();
    const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const delta = (Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX);

    if (reduced) {
      this.currentX += delta * 0.006;
      this.currentVelocity = 0;
      this.currentCurvature = 0;
    } else {
      const impulse = delta * 0.006;
      this.currentVelocity += impulse;
      this.currentVelocity = Math.max(-25, Math.min(25, this.currentVelocity));
      this.currentCurvature = Math.max(-1, Math.min(1, this.currentVelocity * 0.04));
    }
    this.requestRender(60);
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (this.isPaused || !this.isN3Active || this.isExpanding) return;
    const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (reduced) {
        this.currentX += this.stride;
        this.currentVelocity = 0;
        this.currentCurvature = 0;
      } else {
        this.currentVelocity = this.stride / this.tau;
        this.currentCurvature = Math.max(-1, Math.min(1, this.currentVelocity * 0.04));
      }
      this.requestRender(60);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (reduced) {
        this.currentX -= this.stride;
        this.currentVelocity = 0;
        this.currentCurvature = 0;
      } else {
        this.currentVelocity = -this.stride / this.tau;
        this.currentCurvature = Math.max(-1, Math.min(1, this.currentVelocity * 0.04));
      }
      this.requestRender(60);
    }
  };

  private handleResize = (): void => {
    if (!this.container || !this.renderer) return;
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    if (this.camera) {
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    }
    if (this.n2Camera) {
      this.n2Camera.aspect = width / height;
      this.n2Camera.updateProjectionMatrix();
      this.updateCylinderBoundingBox();
    }
    this.renderer.setSize(width, height);
    this.requestRender(30);
  };

  private handleVisibilityChange = (): void => {
    if (document.hidden) {
      this.pause();
    } else if (this.isN3Active) {
      this.resume();
      this.requestRender(30);
    }
  };

  private createCurvedScreenGeometry(width = 3.6, height = 2.1, segments = 32): THREE.BufferGeometry {
    const geo = new THREE.PlaneGeometry(width, height, segments, 1);
    const pos = geo.attributes.position;
    this.originalPlanePositions = new Float32Array(pos.array);
    this.geometriesToDispose.push(geo);
    this.screenGeometry = geo;
    return geo;
  }

  private updateScreenCurvature(c: number): void {
    if (!this.screenGeometry || !this.originalPlanePositions) return;
    // Las pantallas de Landberg son curvas también en reposo (spec § 5: «planos curvos en el
    // mundo»); la velocidad agrega el resto. `c` (data-curvatura) es solo la parte de la velocidad.
    const k = this.curvaturaBase + (1 - this.curvaturaBase) * Math.abs(c);
    if (Math.abs(k - this.lastAppliedCurvature) < 0.001) return;
    this.lastAppliedCurvature = k;

    const pos = this.screenGeometry.attributes.position;
    const halfWidth = 3.6 / 2;
    const maxDepth = 0.45;
    for (let i = 0; i < pos.count; i++) {
      const x = this.originalPlanePositions[i * 3];
      const nx = x / halfWidth;
      const z = Math.pow(nx, 2) * maxDepth * Math.abs(c);
      pos.setZ(i, z);
    }
    pos.needsUpdate = true;
  }

  private setupFloorGrid(): void {
    if (!this.scene) return;
    if (this.gridLines) {
      this.scene.remove(this.gridLines);
      this.gridLines.geometry.dispose();
      if (this.gridLines.material instanceof THREE.Material) {
        this.gridLines.material.dispose();
      }
      this.gridLines = null;
    }

    // Líneas crema sólido rgb(250, 248, 245), 1 px, sin opacidad ni degradados (T22 · A)
    const gridColor = new THREE.Color('rgb(250, 248, 245)');
    const xMin = -60;
    const xMax = 60;
    const zStart = 4.6;
    const zEnd = -80;

    const pts: number[] = [];
    for (let x = xMin; x <= xMax; x += this.gridSpacing) {
      pts.push(x, 0, zStart);
      pts.push(x, 0, zEnd);
    }
    for (let z = zStart; z >= zEnd; z -= this.gridSpacing) {
      pts.push(xMin, 0, z);
      pts.push(xMax, 0, z);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const mat = new THREE.LineBasicMaterial({
      color: gridColor,
      transparent: false,
      toneMapped: false,
      depthWrite: true,
    });
    this.gridLines = new THREE.LineSegments(geo, mat);
    this.scene.add(this.gridLines);
  }

  private createItemMaterial(item: InfinitePlaneItem): THREE.MeshBasicMaterial {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 640;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = 'rgb(14, 14, 18)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    const canvasTexture = new THREE.CanvasTexture(canvas);
    canvasTexture.colorSpace = THREE.SRGBColorSpace;
    this.texturesToDispose.push(canvasTexture);

    const material = new THREE.MeshBasicMaterial({
      map: canvasTexture,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.materialsToDispose.push(material);

    const imageSrc = item.assetSrc || item.poster;
    if (imageSrc) {
      const img = new Image();
      if (imageSrc.startsWith('http://') || imageSrc.startsWith('https://')) {
        img.crossOrigin = 'anonymous';
      }
      img.onload = () => {
        if (this.isDisposed) return;
        const texture = new THREE.Texture(img);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.needsUpdate = true;
        material.map = texture;
        material.needsUpdate = true;
        this.texturesToDispose.push(texture);
        this.requestRender(60);
      };
      img.src = imageSrc;
    }

    return material;
  }

  public swapDisciplineContent(disciplineSlug: string, items: InfinitePlaneItem[]): void {
    if (this.activeDiscipline === disciplineSlug && this.screenMeshes.length > 0) return;
    this.activeDiscipline = disciplineSlug;
    this.populateInfinitePlane(items);
  }

  public populateInfinitePlane(items: InfinitePlaneItem[]): void {
    if (!this.scene) return;
    this.disposeCurrentMeshes();

    this.items = items;
    this.screenMeshes = [];
    this.materials = [];
    this.currentX = 0;
    this.currentVelocity = 0;
    this.currentCurvature = 0;

    this.setupFloorGrid();

    if (items.length === 0) return;

    // Crea materiales para cada ítem base
    for (const item of items) {
      this.materials.push(this.createItemMaterial(item));
    }

    const geo = this.createCurvedScreenGeometry(3.6, 2.1, 32);

    // Mantiene un grupo de 7 pantallas virtuales para repetición infinita sin fisuras
    for (let i = 0; i < 7; i++) {
      const initialSlot = i - 3;
      const itemIdx = ((initialSlot % items.length) + items.length) % items.length;
      const mesh = new THREE.Mesh(geo, this.materials[itemIdx]);
      mesh.position.set(initialSlot * this.stride, 1.05, 0);
      mesh.userData = {
        slot: initialSlot,
        itemIndex: itemIdx,
        slug: items[itemIdx].slug,
        href: items[itemIdx].href,
        titulo: items[itemIdx].titulo,
      };
      this.screenMeshes.push(mesh);
      this.scene.add(mesh);
    }

    this.updateInfiniteScreens();
    this.requestRender(60);
  }

  public expandProjectScreen(slug: string, durationMs: number = 600): Promise<void> {
    if (this.items.length === 0 || !this.camera || !this.scene) {
      return Promise.resolve();
    }

    const camX = this.camera.position.x;
    const targetMesh = this.screenMeshes
      .filter((m) => m.userData?.slug === slug)
      .sort((a, b) => Math.abs(a.position.x - camX) - Math.abs(b.position.x - camX))[0];

    if (!targetMesh) {
      return Promise.resolve();
    }

    // Ocultar otras pantallas y piso para que la pieza protagónica llene la vista
    for (const m of this.screenMeshes) {
      if (m !== targetMesh) {
        m.visible = false;
      }
    }
    if (this.gridLines) {
      this.gridLines.visible = false;
    }

    this.isExpanding = true;
    this.expansionStartTime = performance.now();
    this.expansionDuration = durationMs;

    this.expansionStartCamPos.copy(this.camera.position);
    this.expansionStartLookAt.set(this.camera.position.x, 1.55, 0);

    // Posición destino de la cámara para que la pantalla de 3.6 x 2.1 llene toda la vista
    this.expansionTargetCamPos.set(targetMesh.position.x, targetMesh.position.y, 1.4);
    this.expansionTargetLookAt.set(targetMesh.position.x, targetMesh.position.y, 0);

    // Avance inicial inmediato para que el fotograma 0 ya empiece a expandirse sensiblemente
    const initialEase = 0; // pulido (T23 · E1): sin salto en el primer cuadro; el ease-out quart ya arranca rápido
    this.camera.position.lerpVectors(this.expansionStartCamPos, this.expansionTargetCamPos, initialEase);
    const lookAtPos = new THREE.Vector3().lerpVectors(this.expansionStartLookAt, this.expansionTargetLookAt, initialEase);
    this.camera.lookAt(lookAtPos);

    const k = (1 - initialEase) * this.curvaturaBase;
    if (this.screenGeometry && this.originalPlanePositions) {
      const pos = this.screenGeometry.attributes.position;
      const halfWidth = 3.6 / 2;
      const maxDepth = 0.45;
      for (let i = 0; i < pos.count; i++) {
        const x = this.originalPlanePositions[i * 3];
        const nx = x / halfWidth;
        const z = Math.pow(nx, 2) * maxDepth * k;
        pos.setZ(i, z);
      }
      pos.needsUpdate = true;
    }

    this.resume();
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
    this.requestRender(Math.ceil((durationMs / 1000) * 60) + 10);

    return new Promise<void>((resolve, reject) => {
      this.expansionOnComplete = () => {
        resolve();
      };
      this.expansionCancel = () => {
        this.resetAfterExpansion();
        reject(new Error('Expansión cancelada'));
      };
    });
  }

  public resetAfterExpansion(): void {
    this.isExpanding = false;
    this.expansionOnComplete = null;
    this.expansionCancel = null;
    for (const m of this.screenMeshes) {
      m.visible = true;
    }
    if (this.gridLines) {
      this.gridLines.visible = true;
    }
    if (this.camera) {
      this.camera.position.x = this.currentX;
      this.camera.position.y = 1.45;
      this.camera.position.z = 4.8;
      this.camera.lookAt(this.currentX, 1.55, 0);
    }
    this.updateScreenCurvature(0);
    this.updateInfiniteScreens();
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
    this.requestRender(30);
  }

  public cancelExpansion(): void {
    if (this.expansionCancel) {
      const cb = this.expansionCancel;
      this.expansionCancel = null;
      cb();
    } else {
      this.resetAfterExpansion();
    }
  }

  public centerOnSlug(slug: string): boolean {
    if (this.items.length === 0) return false;
    const itemIndex = this.items.findIndex((item) => item.slug === slug);
    if (itemIndex === -1) return false;

    this.resetAfterExpansion();
    this.currentX = itemIndex * this.stride;
    this.currentVelocity = 0;
    this.currentCurvature = 0;

    if (this.camera) {
      this.camera.position.x = this.currentX;
      this.camera.position.y = 1.45;
      this.camera.position.z = 4.8;
      this.camera.lookAt(this.currentX, 1.55, 0);
    }

    this.updateScreenCurvature(0);
    this.updateInfiniteScreens();
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
    this.requestRender(60);
    return true;
  }

  private updateInfiniteScreens(): void {
    if (this.items.length === 0 || this.screenMeshes.length === 0 || !this.camera) return;

    const centerSlot = Math.round(this.currentX / this.stride);

    // Actualiza la posición de las mallas 3D
    for (let k = -3; k <= 3; k++) {
      const meshIdx = k + 3;
      const slot = centerSlot + k;
      const mesh = this.screenMeshes[meshIdx];
      mesh.position.set(slot * this.stride, 1.05, 0);

      const itemIdx = ((slot % this.items.length) + this.items.length) % this.items.length;
      mesh.material = this.materials[itemIdx];
      mesh.userData = {
        slot,
        itemIndex: itemIdx,
        slug: this.items[itemIdx].slug,
        href: this.items[itemIdx].href,
        titulo: this.items[itemIdx].titulo,
      };
    }

    // Actualiza la proyección 2D de la etiqueta HTML de cada proyecto
    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i];
      const labelEl = document.getElementById(`n3-label-${item.slug}`);
      if (!labelEl) continue;

      const cycleLength = this.items.length * this.stride;
      const nearestCycle = Math.round((this.currentX - i * this.stride) / cycleLength);
      const worldX = nearestCycle * cycleLength + i * this.stride;

      // Sobre el piso, delante de la pantalla: la etiqueta cae sobre el negro y no sobre la
      // imagen (con la etiqueta encima de la portada, el título crema daba ≈ 1,9:1).
      this.tempVec.set(worldX, 0, 0);
      this.tempVec.project(this.camera);

      const screenX = (this.tempVec.x * 0.5 + 0.5) * window.innerWidth;
      const screenY = (-this.tempVec.y * 0.5 + 0.5) * window.innerHeight;

      if (this.tempVec.z > 1 || screenX < -200 || screenX > window.innerWidth + 200) {
        labelEl.style.display = 'none';
      } else {
        labelEl.style.display = 'flex';
        labelEl.style.left = `${screenX}px`;
        labelEl.style.top = `${screenY + 20}px`;
      }
    }
  }

  private disposeCurrentMeshes(): void {
    for (const mesh of this.screenMeshes) {
      if (this.scene) this.scene.remove(mesh);
    }
    this.screenMeshes = [];

    for (const t of this.texturesToDispose) {
      t.dispose();
    }
    this.texturesToDispose = [];

    for (const m of this.materialsToDispose) {
      m.dispose();
    }
    this.materialsToDispose = [];

    for (const g of this.geometriesToDispose) {
      g.dispose();
    }
    this.geometriesToDispose = [];
    this.screenGeometry = null;
    this.originalPlanePositions = null;
  }

  private animate = (now: number): void => {
    if (this.isDisposed) return;
    this.animFrameId = requestAnimationFrame(this.animate);

    if (this.isPaused || document.hidden) return;

    if (this.n2IsActive) {
      if (this.n2IsAnimating) {
        const elapsed = now - this.n2AnimStartTime;
        const duration = 800;
        const progress = Math.min(1, Math.max(0, elapsed / duration));
        const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
        this.n2CurrentAngle = this.n2AnimStartAngle + (this.n2TargetAngle - this.n2AnimStartAngle) * ease;
        if (progress >= 1 || Math.abs(this.n2CurrentAngle - this.n2TargetAngle) < 0.04) {
          this.n2CurrentAngle = this.n2TargetAngle;
          this.n2IsAnimating = false;
          this.updateCylinderBoundingBox();
          if (this.n2OnSettledCallback) {
            const cb = this.n2OnSettledCallback;
            this.n2OnSettledCallback = null;
            cb();
          }
        }
        if (this.n2CylinderGroup) {
          this.n2CylinderGroup.rotation.y = -THREE.MathUtils.degToRad(this.n2CurrentAngle);
        }
        const actN2 = document.getElementById('act-n2');
        if (actN2) {
          actN2.dataset.angulo = this.n2CurrentAngle.toFixed(2);
        }
        this.needsRender = Math.max(this.needsRender, 15);
      }

      if (this.n2RingToCylinderAnimating) {
        const elapsed = now - this.n2RingAnimStartTime;
        const duration = this.n2RingAnimDuration;
        const progress = Math.min(1, Math.max(0, elapsed / duration));
        // Curva ease-in-out cúbica con pico de velocidad hacia los ~0.75 s (Aikawa / T25)
        const ease = progress < 0.5
          ? 4 * progress * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;
        const currentScale = 0.2 + (1.0 - 0.2) * ease;
        if (this.n2CylinderGroup) {
          this.n2CylinderGroup.scale.y = currentScale;
        }
        this.updateCylinderBoundingBox();

        const titular = document.querySelector<HTMLElement>('[data-n2-titular]');
        if (titular) {
          titular.style.opacity = ease.toFixed(3);
        }

        if (progress >= 1) {
          this.n2RingToCylinderAnimating = false;
          if (this.n2CylinderGroup) {
            this.n2CylinderGroup.scale.y = 1.0;
          }
          this.updateCylinderBoundingBox();
          if (titular) {
            titular.style.opacity = '1';
          }
        }
        this.needsRender = Math.max(this.needsRender, 3);
      }

      if (this.needsRender > 0) {
        this.needsRender--;
        if (this.n2Camera && this.renderer && this.scene) {
          this.renderer.render(this.scene, this.n2Camera);
        }
      }
      return;
    }

    if (!this.isN3Active) return;

    if (this.isExpanding) {
      const elapsed = now - this.expansionStartTime;
      const progress = Math.min(1, Math.max(0, elapsed / this.expansionDuration));
      const rawEase = 1 - Math.pow(1 - progress, 4);
      const initialEase = 0; // pulido (T23 · E1): sin salto en el primer cuadro; el ease-out quart ya arranca rápido
      const ease = initialEase + (1 - initialEase) * rawEase;

      if (this.camera) {
        this.camera.position.lerpVectors(this.expansionStartCamPos, this.expansionTargetCamPos, ease);
        const lookAtPos = new THREE.Vector3().lerpVectors(this.expansionStartLookAt, this.expansionTargetLookAt, ease);
        this.camera.lookAt(lookAtPos);
      }

      const k = (1 - ease) * this.curvaturaBase;
      if (this.screenGeometry && this.originalPlanePositions) {
        const pos = this.screenGeometry.attributes.position;
        const halfWidth = 3.6 / 2;
        const maxDepth = 0.45;
        for (let i = 0; i < pos.count; i++) {
          const x = this.originalPlanePositions[i * 3];
          const nx = x / halfWidth;
          const z = Math.pow(nx, 2) * maxDepth * k;
          pos.setZ(i, z);
        }
        pos.needsUpdate = true;
      }

      if (this.renderer && this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera);
      }

      if (progress >= 1) {
        this.isExpanding = false;
        if (this.expansionOnComplete) {
          const cb = this.expansionOnComplete;
          this.expansionOnComplete = null;
          cb();
        }
      }
      return;
    }

    const dt = Math.min(Math.max((now - this.lastFrameTime) / 1000, 0.001), 0.1);
    this.lastFrameTime = now;

    const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduced) {
      this.currentVelocity = 0;
      this.currentCurvature = 0;
    } else if (!this.isDragging) {
      if (Math.abs(this.currentVelocity) > 0.015) {
        // Decaimiento exponencial independiente de fps: v *= exp(-dt / tau)
        this.currentVelocity *= Math.exp(-dt / this.tau);
        this.currentX += this.currentVelocity * dt;
        this.currentCurvature = Math.max(-1, Math.min(1, this.currentVelocity * 0.04));
        this.needsRender = Math.max(this.needsRender, 15);
      } else {
        this.currentVelocity = 0;
        this.currentCurvature = 0;
      }
    }

    const act = document.getElementById('act-n3');
    if (act) {
      const v = Math.abs(this.currentVelocity) < 0.0001 ? 0 : this.currentVelocity;
      const c = Math.abs(this.currentCurvature) < 0.0001 ? 0 : this.currentCurvature;
      act.dataset.velocidad = v.toString();
      act.dataset.curvatura = c.toString();
    }

    if (this.needsRender <= 0) return;
    this.needsRender--;

    this.updateScreenCurvature(this.currentCurvature);
    this.updateInfiniteScreens();

    if (this.camera && this.renderer && this.scene) {
      this.camera.position.x = this.currentX;
      this.camera.lookAt(this.currentX, 1.55, 0);

      if (this.gridLines) {
        this.gridLines.position.x = Math.round(this.currentX / this.gridSpacing) * this.gridSpacing;
      }

      this.renderer.render(this.scene, this.camera);
    }
  };

  public pause(): void {
    this.isPaused = true;
  }

  public resume(): void {
    this.isPaused = false;
  }

  public setN2Active(active: boolean): void {
    this.n2IsActive = active;
    if (active) {
      this.isN3Active = false;
      if (this.scene) this.scene.background = null;
      if (this.renderer) this.renderer.setClearColor(0x000000, 0);
      if (this.n2Group) this.n2Group.visible = true;
      if (this.gridLines) this.gridLines.visible = false;
      for (const m of this.screenMeshes) m.visible = false;
      this.resume();
      this.requestRender(60);
    } else {
      if (this.n2Group) this.n2Group.visible = false;
    }
  }

  public setN3Active(active: boolean): void {
    this.isN3Active = active;
    if (active) {
      this.n2IsActive = false;
      if (this.scene) this.scene.background = new THREE.Color(0x000000);
      if (this.renderer) this.renderer.setClearColor(0x000000, 1);
      if (this.n2Group) this.n2Group.visible = false;
      if (this.gridLines) this.gridLines.visible = true;
      for (const m of this.screenMeshes) m.visible = true;
      this.resume();
      this.requestRender(60);
    } else {
      if (this.gridLines) this.gridLines.visible = false;
      for (const m of this.screenMeshes) m.visible = false;
    }
  }

  public render(): void {
    if (this.isDisposed || !this.renderer || !this.scene) return;
    if (this.n2IsActive && this.n2Camera) {
      this.renderer.render(this.scene, this.n2Camera);
    } else if (this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  private detachEvents(): void {
    if (!this.eventsAttached) return;

    window.removeEventListener('pointerdown', this.handlePointerDown);
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
    window.removeEventListener('pointercancel', this.handlePointerUp);
    window.removeEventListener('wheel', this.handleWheel);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('resize', this.handleResize);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);

    this.eventsAttached = false;
  }

  public destroy(): void {
    this.isDisposed = true;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    this.detachEvents();
    this.disposeCurrentMeshes();
    if (this.n2Group && this.scene) {
      this.scene.remove(this.n2Group);
      this.n2Group = null;
      this.n2CylinderGroup = null;
    }
    if (this.gridLines && this.scene) {
      this.scene.remove(this.gridLines);
      this.gridLines.geometry.dispose();
      if (this.gridLines.material instanceof THREE.Material) {
        this.gridLines.material.dispose();
      }
      this.gridLines = null;
    }
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.domElement.remove();
      this.renderer = null;
    }
    this.scene = null;
    this.camera = null;
    this.n2Camera = null;
    this.container = null;
  }
}

let instance: ThreeSceneManager | null = null;

export function getThreeSceneManager(): ThreeSceneManager {
  if (!instance) {
    instance = new ThreeSceneManager();
  }
  return instance;
}
