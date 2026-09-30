/**
 * El piso del N3 (K13): una cuadrícula estática de líneas gris tenue que arranca bajo las tarjetas,
 * se desvanece hacia el horizonte y lleva un reflejo de las tarjetas a un décimo de la resolución.
 * La cuadrícula está fija en el mundo: la cámara y el piso no se mueven, las tarjetas sí.
 */
import * as THREE from 'three';
import { PISO_FRAGMENT, PISO_VERTEX } from './glsl';

// Constantes de K13 (fracciones de H o de W, salvo las indicadas)
const CELDA = 0.22; // lado de la casilla, × H
const FUERZA_LINEA = 0.08; // aporte de la línea al color: un gris ≈ #141414
const ALFA = 0.9;
const BAJADA = 0.06; // el borde cercano queda bajo la tarjeta, × H
const RECORRIDO = 6; // hacia atrás, × H
const ANCHO = 8; // a lo ancho, × W
const LABIO = 0.2; // cuánto se pasa del borde inferior de la pantalla, × H
const SEPARACION_REFLEJO = 0.07; // plano del espejo bajo el piso, × H
const LAMPARA = -0.6; // x de la lámpara, × W
const ESCALA_REFLEJO = 0.1; // un décimo de la resolución
const CAM_Z = 41.18;

export class Piso {
  readonly malla: THREE.Mesh;
  /** Multiplicador de aparición (fundido de entrada y de salida), 0..1. */
  readonly aparicion = { v: 0 };

  private readonly material: THREE.ShaderMaterial;
  private readonly geometria: THREE.PlaneGeometry;
  private readonly reflejo: THREE.WebGLRenderTarget;
  private readonly camaraReflejo = new THREE.PerspectiveCamera();
  private readonly matrizReflejo = new THREE.Matrix4();
  private readonly espejo = new THREE.Matrix4();
  private readonly puntoTmp = new THREE.Vector4();
  // Uniforme de la lámpara tipado al crearlo, para no estrechar el tipo al usarlo
  private readonly uLampara: THREE.IUniform<THREE.Vector2> = { value: new THREE.Vector2(0.5, 0.5) };
  private lamparaX = 0;
  private yPiso = 0;

  constructor(anchoMundo: THREE.IUniform<number>) {
    this.geometria = new THREE.PlaneGeometry(1, 1, 48, 24);
    this.geometria.rotateX(-Math.PI / 2);
    this.reflejo = new THREE.WebGLRenderTarget(8, 8, { depthBuffer: false, samples: 0 });
    this.camaraReflejo.matrixWorldAutoUpdate = false;
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        u_W: anchoMundo,
        u_refl: { value: this.reflejo.texture },
        u_reflMatriz: { value: this.matrizReflejo },
        u_lampara: this.uLampara,
        u_celda: { value: 1 },
        u_recorrido: { value: 1 },
        u_lineas: { value: FUERZA_LINEA },
        u_alfa: { value: 0 },
      },
      vertexShader: PISO_VERTEX,
      fragmentShader: PISO_FRAGMENT,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.malla = new THREE.Mesh(this.geometria, this.material);
    this.malla.frustumCulled = false;
    this.malla.renderOrder = -1; // K17: el piso va antes que las tarjetas
  }

  /** Coloca el piso: W y H son el semiancho y el semialto del mundo en z = 0; `yTarjetas`, el borde de abajo. */
  ajustar(W: number, H: number, yTarjetas: number, ventanaAncho: number, ventanaAlto: number, dpr: number): void {
    const y = yTarjetas - BAJADA * H;
    const zCerca = Math.min(CAM_Z * (1 - Math.abs(y) / H) + LABIO * H, 0.8 * CAM_Z);
    const recorrido = RECORRIDO * H;
    this.malla.position.set(0, y, (zCerca - recorrido) / 2);
    this.malla.scale.set(ANCHO * W, 1, zCerca + recorrido);
    this.material.uniforms.u_celda.value = CELDA * H;
    this.material.uniforms.u_recorrido.value = recorrido;
    this.espejo.set(1, 0, 0, 0, 0, -1, 0, 2 * (y - SEPARACION_REFLEJO * H), 0, 0, 1, 0, 0, 0, 0, 1);
    this.lamparaX = LAMPARA * W;
    this.yPiso = y;
    this.reflejo.setSize(Math.max(1, Math.ceil((ventanaAncho * dpr) * ESCALA_REFLEJO)), Math.max(1, Math.ceil((ventanaAlto * dpr) * ESCALA_REFLEJO)));
  }

  /** Pone al día el uniforme de aparición. */
  sincronizar(): void {
    this.material.uniforms.u_alfa.value = ALFA * this.aparicion.v;
    this.malla.visible = this.aparicion.v > 0.001;
  }

  get visible(): boolean {
    return this.malla.visible;
  }

  /** Dibuja solo las tarjetas con una cámara reflejada bajo el piso, a un décimo de la resolución. */
  dibujarReflejo(renderer: THREE.WebGLRenderer, escena: THREE.Scene, camara: THREE.PerspectiveCamera): void {
    this.camaraReflejo.matrixWorld.copy(this.espejo).multiply(camara.matrixWorld);
    this.camaraReflejo.matrixWorldInverse.copy(this.camaraReflejo.matrixWorld).invert();
    this.camaraReflejo.projectionMatrix.copy(camara.projectionMatrix);
    this.camaraReflejo.projectionMatrixInverse.copy(camara.projectionMatrixInverse);
    this.matrizReflejo.multiplyMatrices(this.camaraReflejo.projectionMatrix, this.camaraReflejo.matrixWorldInverse);

    // Dónde cae la lámpara en la imagen del reflejo (para el abanico radial)
    this.puntoTmp.set(this.lamparaX, this.yPiso, 0, 1).applyMatrix4(this.matrizReflejo);
    this.uLampara.value.set((this.puntoTmp.x / this.puntoTmp.w) * 0.5 + 0.5, (this.puntoTmp.y / this.puntoTmp.w) * 0.5 + 0.5);

    const visible = this.malla.visible;
    this.malla.visible = false;
    renderer.setRenderTarget(this.reflejo);
    renderer.render(escena, this.camaraReflejo);
    renderer.setRenderTarget(null);
    this.malla.visible = visible;
  }

  dispose(): void {
    this.geometria.dispose();
    this.material.dispose();
    this.reflejo.dispose();
  }
}
