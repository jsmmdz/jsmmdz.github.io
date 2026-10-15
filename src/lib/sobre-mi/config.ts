/**
 * La configuración que `SobreMi.astro` escribe en el HTML (`<script type="application/json" data-sm-config>`): los
 * textos que el navegador necesita para el formulario, los rótulos de los rieles y los capítulos de la historia.
 * Se lee y se valida aquí; así el JS de la sección no importa `data/sobre-mi.ts` (que trae las imágenes).
 */
import type { TextosValidacion } from './validacion';

export interface ImagenConfig {
  src: string;
  ancho: number;
  alto: number;
  alt: string;
  pie: string;
}

export interface CapituloConfig {
  id: string;
  digitos: string;
  rotulo: string;
  texto: string;
  extra: string;
  sabias: string;
  imagenes: ImagenConfig[];
}

export interface RotuloConfig {
  izquierdo: string;
  derecho: string;
}

export interface ConfigSobreMi {
  endpoint: string;
  correo: string;
  formulario: {
    errores: TextosValidacion;
    resumen: { uno: string; varios: string; llevar: string };
    campos: Record<string, string>;
    palabras: string[];
  };
  rieles: Record<string, RotuloConfig>;
  historia: { capitulos: CapituloConfig[] };
}

type Objeto = Record<string, unknown>;

const esObjeto = (x: unknown): x is Objeto => typeof x === 'object' && x !== null && !Array.isArray(x);
const texto = (o: Objeto, k: string): string | null => (typeof o[k] === 'string' ? o[k] : null);
const numero = (o: Objeto, k: string): number | null => (typeof o[k] === 'number' ? o[k] : null);
const lista = (o: Objeto, k: string): unknown[] | null => (Array.isArray(o[k]) ? o[k] : null);

function leerImagen(x: unknown): ImagenConfig | null {
  if (!esObjeto(x)) return null;
  const src = texto(x, 'src');
  const ancho = numero(x, 'ancho');
  const alto = numero(x, 'alto');
  const alt = texto(x, 'alt');
  const pie = texto(x, 'pie');
  if (src === null || ancho === null || alto === null || alt === null || pie === null) return null;
  return { src, ancho, alto, alt, pie };
}

function leerCapitulo(x: unknown): CapituloConfig | null {
  if (!esObjeto(x)) return null;
  const id = texto(x, 'id');
  const digitos = texto(x, 'digitos');
  const rotulo = texto(x, 'rotulo');
  const t = texto(x, 'texto');
  const extra = texto(x, 'extra');
  const sabias = texto(x, 'sabias');
  const imgs = lista(x, 'imagenes');
  if (id === null || digitos === null || rotulo === null || t === null || extra === null || sabias === null || imgs === null) return null;
  const imagenes = imgs.map(leerImagen);
  if (imagenes.length === 0 || imagenes.some((i) => i === null)) return null;
  return { id, digitos, rotulo, texto: t, extra, sabias, imagenes: imagenes.filter((i): i is ImagenConfig => i !== null) };
}

function leerErrores(x: unknown): TextosValidacion | null {
  if (!esObjeto(x)) return null;
  const nombre = texto(x, 'nombre');
  const correoVacio = texto(x, 'correoVacio');
  const correoInvalido = texto(x, 'correoInvalido');
  const mensaje = texto(x, 'mensaje');
  const autorizacion = texto(x, 'autorizacion');
  if (nombre === null || correoVacio === null || correoInvalido === null || mensaje === null || autorizacion === null) return null;
  return { nombre, correoVacio, correoInvalido, mensaje, autorizacion };
}

/** Lee y valida la configuración; si falta algo, devuelve `null` y la sección queda sin movimiento ni formulario. */
export function leerConfig(seccion: ParentNode): ConfigSobreMi | null {
  const nodo = seccion.querySelector('script[data-sm-config]');
  if (!nodo) return null;
  let crudo: unknown;
  try {
    crudo = JSON.parse(nodo.textContent ?? '');
  } catch {
    return null;
  }
  if (!esObjeto(crudo)) return null;
  const endpoint = texto(crudo, 'endpoint');
  const correo = texto(crudo, 'correo');
  const formulario = crudo.formulario;
  const rielesCrudo = crudo.rieles;
  const historia = crudo.historia;
  if (endpoint === null || correo === null || !esObjeto(formulario) || !esObjeto(rielesCrudo) || !esObjeto(historia)) return null;

  const errores = leerErrores(formulario.errores);
  const resumen = formulario.resumen;
  const campos = formulario.campos;
  const palabras = lista(formulario, 'palabras');
  if (errores === null || !esObjeto(resumen) || !esObjeto(campos) || palabras === null) return null;
  const uno = texto(resumen, 'uno');
  const varios = texto(resumen, 'varios');
  const llevar = texto(resumen, 'llevar');
  if (uno === null || varios === null || llevar === null) return null;

  const camposTexto: Record<string, string> = {};
  for (const [k, v] of Object.entries(campos)) if (typeof v === 'string') camposTexto[k] = v;

  const rieles: Record<string, RotuloConfig> = {};
  for (const [k, v] of Object.entries(rielesCrudo)) {
    if (!esObjeto(v)) continue;
    const izquierdo = texto(v, 'izquierdo');
    const derecho = texto(v, 'derecho');
    if (izquierdo !== null && derecho !== null) rieles[k] = { izquierdo, derecho };
  }

  const capitulosCrudo = lista(historia, 'capitulos');
  if (capitulosCrudo === null) return null;
  const capitulos = capitulosCrudo.map(leerCapitulo);
  if (capitulos.length === 0 || capitulos.some((c) => c === null)) return null;

  return {
    endpoint,
    correo,
    formulario: { errores, resumen: { uno, varios, llevar }, campos: camposTexto, palabras: palabras.filter((p): p is string => typeof p === 'string') },
    rieles,
    historia: { capitulos: capitulos.filter((c): c is CapituloConfig => c !== null) },
  };
}
