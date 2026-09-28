# Videos de Transición (H.264)

Los videos en esta carpeta NO son copiados por `sincronizar-media.mjs`.
Son generados por un proceso separado de FFmpeg que:
1. Recorta la cola muerta de los 4 clips originales.
2. Recodifica de HEVC a H.264 para compatibilidad universal de navegadores (Chrome, Firefox, Safari).
3. Genera las copias invertidas (`*-atras.mp4`) mediante `ffmpeg -vf reverse`.

Estructura esperada:
- `t1-azul-ambar-adelante.mp4` / `t1-azul-ambar-atras.mp4`
- `t2-ambar-verde-adelante.mp4` / `t2-ambar-verde-atras.mp4`
- `t3-verde-rojo-adelante.mp4` / `t3-verde-rojo-atras.mp4`
- `t4-rojo-editorial-adelante.mp4` / `t4-rojo-editorial-atras.mp4`
