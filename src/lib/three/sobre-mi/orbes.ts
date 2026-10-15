/**
 * Los orbes con grano del fondo de «Sobre mí y contacto» (T45, K9), en WebGL con three.js. Es la técnica de Tonami
 * (un campo de orbes que se funden como metabolas, grano de película que depende de la luminosidad, puntos de tinta
 * cuya densidad sigue el tono y partículas que saltan a una cadencia fija), reimplementada con three en lugar de OGL
 * (decisión por defecto del orquestador, aprobada por el autor, 2026-10-14).
 *
 * Este módulo importa three: se carga siempre con `import()` desde `lib/sobre-mi/orbes.ts`, nunca en el JS inicial
 * de `/`. Dibuja sobre el lienzo `canvas[data-sm-lienzo="orbes"]` con alfa: el color de la página lo pone el CSS de
 * la sección y el shader solo aporta los orbes, el grano y las partículas. Los colores llegan como uniformes leídos de
 * las variables CSS (ningún color va escrito aquí).
 */
import { Mesh, NoBlending, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, Vector2, Vector3, WebGLRenderer } from 'three';

const VERTICE = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// K9: orbes con deriva de senos superpuestos; fusión tipo metabola; grano que depende de la luminosidad (más fuerte
// en medios tonos); puntos de tinta cuya densidad sigue la oscuridad del tono; partículas en celdas de 19 px con 2 %
// de probabilidad y radio de 1,5 px que saltan a una cadencia fija.
const FRAGMENTO = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform vec2 uRes;
uniform float uT;
uniform float uEscala;
uniform float uRise;
uniform float uInv;
uniform vec3 uOrbe;
uniform vec3 uOrbeInv;
uniform vec3 uParticula;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float campo(vec2 p) {
  float f = 0.0;
  float aspecto = uRes.x / uRes.y;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float vel = 0.12 + fi * 0.012;
    vec2 c = vec2(
      0.5 + 0.44 * sin(uT * vel * (0.8 + fi * 0.23) + fi * 2.4),
      0.5 + 0.34 * cos(uT * vel * (0.9 + fi * 0.19) + fi * 1.9)
    );
    // El scroll de la historia hace «subir» los orbes (rise).
    c.y = mod(c.y - uRise * (0.35 + fi * 0.11) + 0.4, 1.8) - 0.4;
    vec2 d = (p - c) * vec2(aspecto, 1.0);
    float r = 0.17 + 0.07 * sin(fi * 3.7 + uT * 0.2);
    float k = clamp(1.0 - length(d) / r, 0.0, 1.0);
    f += pow(k * k * (3.0 - 2.0 * k), 1.6);
  }
  return f;
}

void main() {
  vec2 p = vUv;
  float f = campo(p);
  // El tono de los orbes (suavidad 1,6; contraste 1,15) y una viñeta leve (0,2).
  float tono = smoothstep(0.06, 1.05, f);
  tono = pow(tono, 1.0 / 1.15);
  float vineta = 1.0 - 0.2 * smoothstep(0.35, 0.95, length(p - 0.5) * 1.35);
  tono *= vineta;

  vec2 px = gl_FragCoord.xy / uEscala;
  float paso = floor(uT * 12.0);
  // Grano de película: más fuerte en los medios tonos (dependencia de luminosidad 0,55).
  float medios = 1.0 - abs(tono * 2.0 - 1.0) * 0.55;
  float grano = (hash(floor(px / 1.4) + paso * vec2(17.0, 31.0)) - 0.5) * 0.2 * medios;
  // Puntos de tinta: su densidad sigue el tono.
  float punto = step(hash(floor(px / 1.2) + 7.0), tono * 0.55) * tono * 0.4;

  vec3 orbe = mix(uOrbe, uOrbeInv, uInv);
  float alfa = clamp(tono * 0.82 + punto + grano * (0.5 + tono), 0.0, 1.0);
  vec3 color = orbe;

  // Partículas: celdas de 19 px, 2 % de probabilidad, radio de 1,5 px; saltan dos veces por segundo.
  vec2 celda = floor(px / 19.0);
  float salto = floor(uT * 2.0);
  float azar = hash(celda + salto * 3.7);
  if (azar > 0.98) {
    vec2 centro = (celda + vec2(hash(celda + 1.3 + salto), hash(celda + 9.1 + salto))) * 19.0;
    float irregular = 1.0 + 0.5 * (hash(floor((px - centro) * 0.7) + celda) - 0.5);
    float particula = 1.0 - smoothstep(0.7, 1.5 * irregular, length(px - centro));
    color = mix(color, uParticula, particula);
    alfa = max(alfa, particula);
  }
  gl_FragColor = vec4(color * alfa, alfa);
}
`;

export interface ParametrosOrbes {
  /** El color de los orbes (0 a 1 por canal) y el de la escena invertida, ya mezclados entre Día y Noche. */
  orbe: readonly [number, number, number];
  orbeInvertida: readonly [number, number, number];
  particula: readonly [number, number, number];
  /** Cuánto de la escena invertida (0 a 1). */
  inversion: number;
  /** El scroll en pantallas: los orbes suben con él. */
  subida: number;
}

export interface ControladorOrbes {
  /** Dibuja un cuadro en el tiempo `t` (s). */
  dibujar: (t: number, p: ParametrosOrbes) => void;
  /** El tamaño del lienzo en px CSS y la escala de resolución (1 = una muestra por px CSS). */
  redimensionar: (ancho: number, alto: number, escala: number) => void;
  destruir: () => void;
}

export interface OpcionesOrbes {
  lienzo: HTMLCanvasElement;
  gl: WebGL2RenderingContext;
}

export function crearOrbes({ lienzo, gl }: OpcionesOrbes): ControladorOrbes {
  // Contexto sin antialias y con alfa (K9): el color de la página lo pone el CSS.
  const renderer = new WebGLRenderer({ canvas: lienzo, context: gl, antialias: false, alpha: true, premultipliedAlpha: true });
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 0);
  const escena = new Scene();
  const camara = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const material = new ShaderMaterial({
    vertexShader: VERTICE,
    fragmentShader: FRAGMENTO,
    uniforms: {
      uRes: { value: new Vector2(1, 1) },
      uT: { value: 0 },
      uEscala: { value: 1 },
      uRise: { value: 0 },
      uInv: { value: 0 },
      uOrbe: { value: new Vector3() },
      uOrbeInv: { value: new Vector3() },
      uParticula: { value: new Vector3() },
    },
    transparent: true,
    blending: NoBlending,
    depthTest: false,
    depthWrite: false,
  });
  const geometria = new PlaneGeometry(2, 2);
  const malla = new Mesh(geometria, material);
  malla.frustumCulled = false;
  escena.add(malla);

  return {
    dibujar: (t, p) => {
      const u = material.uniforms;
      u.uT.value = t;
      u.uRise.value = p.subida;
      u.uInv.value = p.inversion;
      u.uOrbe.value.set(p.orbe[0], p.orbe[1], p.orbe[2]);
      u.uOrbeInv.value.set(p.orbeInvertida[0], p.orbeInvertida[1], p.orbeInvertida[2]);
      u.uParticula.value.set(p.particula[0], p.particula[1], p.particula[2]);
      renderer.render(escena, camara);
    },
    redimensionar: (ancho, alto, escala) => {
      const w = Math.max(1, Math.round(ancho * escala));
      const h = Math.max(1, Math.round(alto * escala));
      renderer.setSize(w, h, false);
      material.uniforms.uRes.value.set(w, h);
      material.uniforms.uEscala.value = escala;
    },
    destruir: () => {
      geometria.dispose();
      material.dispose();
      renderer.dispose();
    },
  };
}
