/**
 * Las reglas de validación del formulario de contacto (T35), en el navegador y antes de cualquier petición.
 * Son las de Digitalists (K2): nombre de 2 caracteres o más, correo con forma de correo, mensaje de 10 o
 * más, casilla de autorización marcada; la empresa es opcional y nunca falla.
 */

export type CampoValidable = 'name' | 'email' | 'message' | 'autorizacion';

/** El orden en que se listan los mensajes y en que se busca el primer campo inválido (el de la pantalla). */
export const ORDEN_CAMPOS: readonly CampoValidable[] = ['name', 'email', 'message', 'autorizacion'];

export interface DatosFormulario {
  name: string;
  company: string;
  email: string;
  message: string;
  autorizacion: boolean;
}

export interface TextosValidacion {
  nombre: string;
  correoVacio: string;
  correoInvalido: string;
  mensaje: string;
  autorizacion: string;
}

export const LARGO_MINIMO_NOMBRE = 2;
export const LARGO_MINIMO_MENSAJE = 10;
/** La misma expresión de Digitalists: algo, una arroba, algo, un punto y algo, sin espacios. */
export const REGEX_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** El mensaje de error de un campo, o `null` si es válido. */
export function errorDeCampo(campo: CampoValidable, datos: DatosFormulario, textos: TextosValidacion): string | null {
  switch (campo) {
    case 'name':
      return datos.name.trim().length >= LARGO_MINIMO_NOMBRE ? null : textos.nombre;
    case 'email': {
      const correo = datos.email.trim();
      if (correo.length === 0) return textos.correoVacio;
      return REGEX_CORREO.test(correo) ? null : textos.correoInvalido;
    }
    case 'message':
      return datos.message.trim().length >= LARGO_MINIMO_MENSAJE ? null : textos.mensaje;
    case 'autorizacion':
      return datos.autorizacion ? null : textos.autorizacion;
  }
}

/** Los errores de todos los campos que fallan, en el orden de la pantalla. */
export function validarTodo(datos: DatosFormulario, textos: TextosValidacion): Array<{ campo: CampoValidable; mensaje: string }> {
  const errores: Array<{ campo: CampoValidable; mensaje: string }> = [];
  for (const campo of ORDEN_CAMPOS) {
    const mensaje = errorDeCampo(campo, datos, textos);
    if (mensaje) errores.push({ campo, mensaje });
  }
  return errores;
}
