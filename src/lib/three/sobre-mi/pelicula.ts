/**
 * La película del círculo de la historia (T45, K16), en WebGL con three.js: la imagen de cada parada se dibuja en un
 * canvas con un shader de película analógica, y el cambio de una imagen a la siguiente se hace dentro del shader
 * (nunca con dos `<img>` en fundido, para que el grano no se duplique): los píxeles claros cambian primero
 * (escalonado 0,7 de luminosidad, suavidad 0,65) y el frente de cambio lleva un destello anamórfico y una separación de
 * color. El tratamiento es común a todas las imágenes (ganancia 1,3, temperatura −0,115, saturación 0,6, contraste
 * 0,85), con desvanecido (0,2 fresca a 1 envejecida), grano, viñeta, rayones verticales, moteado, parpadeo de
 * exposición y aberración cromática, con los parámetros de la ficha (`fabrica/proyecto/referentes/T45.json`, K16).
 *
 * Este módulo importa three: se carga siempre con `import()` desde `lib/sobre-mi/historia.ts`. Sin WebGL, o con el
 * contexto perdido, la sección muestra la `<img>` de la parada actual dentro del círculo.
 */
import { Mesh, NoColorSpace, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, Texture, Vector3, WebGLRenderer, DataTexture, RGBAFormat, UnsignedByteType } from 'three';

const VERTICE = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FRAGMENTO = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uA;
uniform sampler2D uB;
uniform float uAspA;
uniform float uAspB;
uniform float uMezcla;
uniform float uT;
uniform float uEnvejecido;
uniform float uAnimar;
uniform vec3 uFondo;

// E4 (pulido con el autor, 2026-10-15): el hash anterior, fract(p * vec2(123.34, 456.21)) sobre celdas enteras, se
// repetía cada pocas celdas y el grano formaba rayas. Este (hash12 de Dave Hoskins) no tiene periodo visible.
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// La imagen recortada «cover» en un lienzo cuadrado.
vec3 muestra(sampler2D tex, vec2 uv, float asp, float desvio) {
  vec2 s = asp > 1.0 ? vec2(1.0 / asp, 1.0) : vec2(1.0, asp);
  vec2 q = (uv - 0.5) * s + 0.5;
  return vec3(
    texture2D(tex, q + vec2(desvio, 0.0)).r,
    texture2D(tex, q).g,
    texture2D(tex, q - vec2(desvio, 0.0)).b
  );
}

void main() {
  vec2 uv = vUv;
  // El cambio dentro del shader: los claros primero, con el frente de cambio resaltado.
  float desvioBase = 0.0007 * (1.0 + 0.4 * uAnimar);
  vec3 b0 = muestra(uB, uv, uAspB, 0.0);
  float lum = dot(b0, vec3(0.299, 0.587, 0.114));
  float escalon = 0.7;
  float suavidad = 0.65;
  float ruido = (hash(floor(uv * 90.0)) - 0.5) * 0.3;
  float avance = uMezcla * (1.0 + escalon + suavidad);
  // El ruido del borde (0,3) mueve el frente; el desvío de 0,1 asegura que con la mezcla en 0 no se cuele nada.
  float cambio = smoothstep(0.0, suavidad, avance - (1.0 - lum) * escalon + ruido * suavidad - 0.1);
  float frente = cambio * (1.0 - cambio) * 4.0;
  // Aberración cromática (0,4; ×2,5 en el frente) y destello anamórfico (0,35; ×2 en el frente).
  float desvio = desvioBase + 0.0045 * frente * 2.5 + 0.0008;
  vec3 a = muestra(uA, uv, uAspA, desvio);
  vec3 b = muestra(uB, uv, uAspB, desvio);
  vec3 c = mix(a, b, cambio);
  float destello = exp(-abs(uv.y - 0.5) * 7.0) * frente * (0.35 * 2.0);
  c += vec3(0.95, 0.97, 1.0) * destello;

  // El tono común: ganancia 1,3, temperatura −0,115, tinte −0,005, saturación 0,6, contraste 0,85.
  c *= 1.3;
  c.r += -0.115 * 0.12;
  c.b -= -0.115 * 0.12;
  c.g += -0.005 * 0.12;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, 0.6);
  c = (c - 0.5) * 0.85 + 0.5;
  // Desvanecido: de 0,2 (fresca) a 1 (envejecida) levanta los negros y enfría un poco.
  float desvanecido = 0.2 + 0.8 * uEnvejecido;
  c = mix(c, c * 0.85 + vec3(0.1, 0.11, 0.14), desvanecido * 0.35);

  float paso = floor(uT * 24.0) * uAnimar;
  vec2 px = uv * 360.0;
  // Grano (0,06) y grano de color (0,4).
  float g = hash(floor(px) + paso * 13.7) - 0.5;
  vec3 gc = vec3(hash(floor(px) + paso * 3.1), hash(floor(px) + paso * 5.3), hash(floor(px) + paso * 7.9)) - 0.5;
  c += g * 0.12 * (0.5 + l) + gc * 0.06 * 0.4;
  // Halación (0,6): un brillo cálido en las luces altas.
  float luz = smoothstep(0.7, 1.1, l);
  c += vec3(0.9, 0.45, 0.3) * luz * 0.6 * 0.08;
  // Rayones verticales (0,28) y moteado (0,4).
  float rayon = step(0.9965, hash(vec2(floor(uv.x * 300.0), paso * 0.37))) * 0.28;
  c += rayon * 0.25;
  float mota = step(0.9985, hash(floor(px * 0.7) + paso * 1.9)) * 0.4;
  c -= mota * 0.35;
  // Parpadeo de exposición (0,4).
  c *= 1.0 + 0.4 * 0.06 * sin(uT * 31.0 + hash(vec2(paso, 3.0)) * 6.2831) * uAnimar;
  // Viñeta (0,2 a 1, según el envejecimiento).
  float vineta = smoothstep(0.35, 0.85, length(uv - 0.5));
  c *= 1.0 - (0.2 + 0.8 * uEnvejecido) * 0.45 * vineta;

  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`;

export interface ImagenPelicula {
  src: string;
  ancho: number;
  alto: number;
}

export interface OpcionesPelicula {
  lienzo: HTMLCanvasElement;
  gl: WebGL2RenderingContext;
  imagenes: ImagenPelicula[];
  /** Con `false` (movimiento reducido) el grano y el parpadeo no se animan. */
  animar: boolean;
  alPerderContexto: () => void;
  alRestaurarContexto: () => void;
}

export interface ControladorPelicula {
  /** Muestra la imagen `indice`: con el cambio dentro del shader (`duracion` s) o de golpe (`inmediato`). */
  mostrar: (indice: number, envejecimiento: number, inmediato: boolean, duracion?: number) => void;
  /** Dibuja un cuadro en el tiempo `t` (s). */
  dibujar: (t: number) => void;
  destruir: () => void;
}

const DURACION_POR_DEFECTO_S = 0.9;
/** Con el cambio, el brillo del frente sigue una curva in-out (la de los saltos de la historia). */
const suave = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function crearPelicula(o: OpcionesPelicula): ControladorPelicula {
  const renderer = new WebGLRenderer({ canvas: o.lienzo, context: o.gl, antialias: false, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const escena = new Scene();
  const camara = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

  // Una textura de relleno (un cuadro oscuro) mientras llega la imagen.
  const relleno = new DataTexture(new Uint8Array([40, 30, 50, 255]), 1, 1, RGBAFormat, UnsignedByteType);
  relleno.colorSpace = NoColorSpace;
  relleno.needsUpdate = true;

  const material = new ShaderMaterial({
    vertexShader: VERTICE,
    fragmentShader: FRAGMENTO,
    uniforms: {
      uA: { value: relleno },
      uB: { value: relleno },
      uAspA: { value: 1 },
      uAspB: { value: 1 },
      uMezcla: { value: 1 },
      uT: { value: 0 },
      uEnvejecido: { value: 1 },
      uAnimar: { value: o.animar ? 1 : 0 },
      uFondo: { value: new Vector3() },
    },
    depthTest: false,
    depthWrite: false,
  });
  const geometria = new PlaneGeometry(2, 2);
  const malla = new Mesh(geometria, material);
  malla.frustumCulled = false;
  escena.add(malla);

  // Las texturas se cargan cuando se necesitan (la actual y sus vecinas).
  const texturas: (Texture | null)[] = o.imagenes.map(() => null);
  const cargando = new Set<number>();
  let destruido = false;
  let perdido = false;
  let sucio = true;

  const cargar = (i: number): void => {
    const imagen = o.imagenes[i];
    if (!imagen || texturas[i] || cargando.has(i) || destruido) return;
    cargando.add(i);
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      cargando.delete(i);
      if (destruido) return;
      const t = new Texture(img);
      t.colorSpace = NoColorSpace;
      t.needsUpdate = true;
      texturas[i] = t;
      sucio = true;
    };
    img.onerror = () => cargando.delete(i);
    img.src = imagen.src;
  };

  let actual = -1;
  let previa = -1;
  let envejecimiento = 1;
  let mezcla = 1;
  let inicio = Number.NaN;
  let duracionCambio = DURACION_POR_DEFECTO_S;
  let ultimoT = 0;

  const aspecto = (i: number): number => {
    const im = o.imagenes[i];
    return im && im.alto > 0 ? im.ancho / im.alto : 1;
  };

  const mostrar: ControladorPelicula['mostrar'] = (indice, env, inmediato, duracion = DURACION_POR_DEFECTO_S) => {
    envejecimiento = env;
    cargar(indice);
    cargar(indice + 1);
    cargar(indice - 1);
    if (indice === actual) return;
    previa = actual < 0 ? indice : actual;
    actual = indice;
    duracionCambio = duracion;
    if (inmediato) {
      mezcla = 1;
      previa = actual;
    } else {
      mezcla = 0;
      inicio = Number.NaN;
    }
    sucio = true;
  };

  const alPerder = (e: Event): void => {
    // Sin esto el navegador no restaura el contexto.
    e.preventDefault();
    perdido = true;
    o.alPerderContexto();
  };
  const alRestaurar = (): void => {
    perdido = false;
    sucio = true;
    o.alRestaurarContexto();
  };
  o.lienzo.addEventListener('webglcontextlost', alPerder);
  o.lienzo.addEventListener('webglcontextrestored', alRestaurar);

  /** El tamaño del lienzo sigue al del círculo: cuadrado, con la resolución del dispositivo (hasta 2). */
  const ajustarTamano = (): void => {
    const lado = Math.max(1, Math.round(o.lienzo.clientWidth));
    const pr = renderer.getPixelRatio();
    const px = Math.round(lado * pr);
    if (o.lienzo.width !== px || o.lienzo.height !== px) renderer.setSize(lado, lado, false);
  };

  return {
    mostrar,
    dibujar: (t) => {
      if (destruido || perdido || actual < 0) return;
      ultimoT = t;
      if (mezcla < 1) {
        if (Number.isNaN(inicio)) inicio = t;
        mezcla = Math.min(1, (t - inicio) / Math.max(0.05, duracionCambio));
        if (mezcla >= 1) previa = actual;
      }
      // Con movimiento reducido solo se dibuja cuando algo cambia (la imagen, el tamaño).
      if (o.animar === false && !sucio && mezcla >= 1) return;
      ajustarTamano();
      const u = material.uniforms;
      u.uA.value = texturas[previa] ?? relleno;
      u.uB.value = texturas[actual] ?? relleno;
      u.uAspA.value = aspecto(previa);
      u.uAspB.value = aspecto(actual);
      u.uMezcla.value = suave(mezcla);
      u.uT.value = ultimoT;
      u.uEnvejecido.value = envejecimiento;
      renderer.render(escena, camara);
      sucio = false;
    },
    destruir: () => {
      destruido = true;
      o.lienzo.removeEventListener('webglcontextlost', alPerder);
      o.lienzo.removeEventListener('webglcontextrestored', alRestaurar);
      for (const t of texturas) t?.dispose();
      relleno.dispose();
      geometria.dispose();
      material.dispose();
      renderer.dispose();
    },
  };
}
