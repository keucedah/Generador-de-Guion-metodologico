# Generador de Guía Metodológica (UPNFM)

Aplicación web que genera con IA la Guía Metodológica de un espacio formativo del
Programa de Educación Virtual de la UPNFM, y la exporta a PDF o Word.

Los docentes **no necesitan ninguna API key**: la página llama a `api/generate.js`,
una función de Vercel que usa la clave de Gemini guardada en el servidor.

## Publicar en Vercel

1. Crea una API key gratuita de Gemini en https://aistudio.google.com/apikey
2. En https://vercel.com → **Add New… → Project** → importa este repositorio de GitHub
   (sin cambiar ninguna opción de compilación).
3. Antes de desplegar (o después en **Settings → Environment Variables**) agrega:
   - `GEMINI_API_KEY` = tu clave de Gemini
   - `GEMINI_MODEL` (opcional) = modelo a usar; por defecto `gemini-3.8-flash`
4. Despliega. Si agregas o cambias variables después, haz **Redeploy** para que se apliquen.

Cada vez que se suban cambios a la rama principal, Vercel vuelve a publicar automáticamente.

## Archivos

- `index.html` — la aplicación completa (incluye las librerías para leer PDF/Word y exportar).
- `api/generate.js` — función del servidor que arma el prompt y llama a Gemini.
- `vercel.json` — da hasta 60 segundos a la generación.

Si la generación automática no está disponible (por ejemplo, abriendo `index.html`
directamente o en GitHub Pages), la página ofrece una alternativa manual de copiar y pegar
en claude.ai.
