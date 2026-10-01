/**
 * La cámara de los mundos del portafolio (K2 de Landberg): una perspectiva de 53,4° a 41,18 de
 * distancia. Con ella, un plano en z = 0 calza píxel a píxel con un rectángulo DOM. El N3 y el N4 la
 * comparten: el medio del caso tiene que caer exactamente donde aterrizó la pieza que vuela.
 */
export const FOV = 53.4;
export const CAM_Z = 41.18;

/** Semialto del frustum en z = 0 (unidades del mundo). */
export const SEMIALTO = Math.tan((FOV / 2) * (Math.PI / 180)) * CAM_Z;
