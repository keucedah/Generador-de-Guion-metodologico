// api/generate.js
// Función serverless de Vercel: recibe los datos del formulario, arma el prompt
// y llama a Gemini usando la API key guardada en las variables de entorno de Vercel.
// Así los docentes no necesitan ninguna API key.

const MAX_FILE_CHARS = 12000;
const MAX_DESC_CHARS = 4000;
const MAX_FIELD_CHARS = 300;

function clip(value, max = MAX_FIELD_CHARS) {
  return String(value ?? '').slice(0, max);
}

function buildPrompt({ docente = {}, espacio = {}, descripcion = '', fileText = '', fileName = '' }) {
  const facultad = espacio.facultad === 'Otro' ? espacio.facultadOtro : espacio.facultad;
  const depto = espacio.depto === 'Otro' ? espacio.deptoOtro : espacio.depto;

  let texto = clip(fileText, MAX_FILE_CHARS + 100);
  if (String(fileText || '').length > MAX_FILE_CHARS) {
    texto = String(fileText).slice(0, MAX_FILE_CHARS) + '\n[...documento truncado por longitud...]';
  }
  const desc = clip(descripcion, MAX_DESC_CHARS).trim();

  let fuenteInfo = '';
  if (texto) {
    fuenteInfo += `CONTENIDO EXTRAÍDO DEL DOCUMENTO SUBIDO POR EL DOCENTE (archivo: "${clip(fileName)}"). Trátalo como la FUENTE PRINCIPAL y más detallada de información para construir la guía:\n"""\n${texto}\n"""\n\n`;
  }
  if (desc) {
    fuenteInfo += `DESCRIPCIÓN MÍNIMA ${texto ? 'ADICIONAL ' : ''}PROPORCIONADA POR EL DOCENTE:\n"${desc}"\n\n`;
  }
  if (!fuenteInfo) {
    fuenteInfo = 'El docente no proporcionó descripción ni documento adicional; usa buen juicio pedagógico basándote en el nombre y datos del espacio pedagógico proporcionados.\n\n';
  }

  return `Eres un experto en diseño curricular y educación virtual universitaria de la UNIVERSIDAD PEDAGÓGICA NACIONAL FRANCISCO MORAZÁN (UPNFM), Vicerrectoría de Educación a Distancia, Programa de Educación Virtual.

Debes generar el contenido completo de una "Guía Metodológica" a partir de los siguientes datos:

DATOS DEL DOCENTE:
- Nombre: ${clip(docente.nombre)}
- Email: ${clip(docente.email)}
- Horario de atención a consultas: ${clip(docente.horarioAtencion)}

DATOS DEL ESPACIO FORMATIVO:
- Facultad: ${clip(facultad)}
- Departamento/Sección Académica: ${clip(depto)}
- Periodo académico: ${clip(espacio.periodo)}
- Código: ${clip(espacio.codigo)}
- Nombre del espacio pedagógico: ${clip(espacio.nombreEspacio)}
- UV: ${clip(espacio.uv)}
- Requisitos: ${clip(espacio.requisitos)}
- Modalidad: ${clip(espacio.modalidad)}
- Fechas: ${clip(espacio.fechas)}
- Horario de la clase: ${clip(espacio.horarioClase)}

${fuenteInfo}Con base en esto, redacta TODO el contenido pedagógico de la guía, desarrollando y ampliando profesionalmente lo que sea necesario. Si se proporcionó contenido de un documento subido, extrae y reorganiza su información real (objetivos, temas, evaluación, etc.) en la estructura solicitada, en lugar de inventar contenido genérico.

Responde ÚNICAMENTE con un objeto JSON válido (sin texto adicional, sin markdown), con exactamente esta estructura:

{
  "descripcion_espacio": "string - descripción ampliada y profesional del espacio formativo, 2-4 párrafos",
  "saberes_previos": "string - saberes y experiencias previas esperadas del estudiante, 1-2 párrafos",
  "competencias_genericas": "string - competencias genéricas y específicas a desarrollar, redactado en párrafo(s)",
  "subcompetencias": "string - lista de sub-competencias, cada una en una línea nueva",
  "contenidos": "string - contenidos del espacio formativo organizados por unidades o bloques temáticos",
  "metodologia_trabajo": "string - metodología de trabajo en clase, incluyendo criterios de asistencia y lo esperado en encuentros sincrónicos",
  "metodologia_evaluacion": "string - metodología de evaluación",
  "documentos_materiales": "string - documentos y materiales a utilizar, uno por línea",
  "planificacion_semanal": [
    {"unidad":"string","temas":"string","competencias":"string","contenidos":"string","materiales":"string","actividades":"string","criterios":"string"}
  ],
  "encuentros_tutoriales": [
    {"encuentro":"string (ej. 'Encuentro 1')","fecha":"string","unidades_temas":"string","actividades":"string"}
  ],
  "criterios_acreditacion": [
    {"actividad":"string","porcentaje":"string (ej. '20%')","criterios":"string"}
  ]
}

Reglas:
- "planificacion_semanal" debe tener entre 3 y 6 unidades, coherentes con la información proporcionada.
- "encuentros_tutoriales" debe tener entre 3 y 5 encuentros.
- "criterios_acreditacion" debe tener entre 4 y 8 filas, y los porcentajes deben sumar 100%.
- Todo el contenido debe estar en español, con redacción formal, académica y específica al tema descrito (no genérica).
- No inventes datos de identificación distintos a los proporcionados.
- Responde solo el JSON, nada más.`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido. Usa POST.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'El servidor no tiene configurada la variable GEMINI_API_KEY en Vercel.' });
  }

  const body = typeof req.body === 'string' ? safeParse(req.body) : (req.body || {});
  if (!body || !body.espacio) {
    return res.status(400).json({ error: 'Faltan los datos del espacio formativo.' });
  }

  // Modelo principal (se puede cambiar en Vercel con GEMINI_MODEL) y modelos de respaldo
  // por si el principal está saturado o deja de existir.
  const primary = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  const models = [...new Set([primary, 'gemini-3.5-flash', 'gemini-flash-latest'])];
  const prompt = buildPrompt(body);

  let lastError = 'No se pudo contactar a Gemini.';
  // Dos rondas por todos los modelos, con una pausa breve entre intentos.
  for (let round = 0; round < 2; round++) {
    for (const model of models) {
      const result = await callGemini(model, prompt, apiKey);
      if (result.text) return res.status(200).json({ text: result.text });
      lastError = result.error;
      if (!result.retryable) return res.status(502).json({ error: lastError });
      await sleep(round === 0 ? 1500 : 4000);
    }
  }

  return res.status(503).json({
    error: 'El servicio de IA de Google está saturado en este momento. Espera un minuto y presiona "Generar" de nuevo.',
    detalle: lastError
  });
}

// Llama a un modelo. Devuelve { text } si funcionó, o { error, retryable }:
// retryable = true cuando conviene probar de nuevo u otro modelo (saturación, límite, modelo no disponible).
async function callGemini(model, prompt, apiKey) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.4,
          // Margen amplio: en los modelos recientes el "razonamiento" interno también cuenta aquí.
          maxOutputTokens: 32768,
          responseMimeType: 'application/json',
          // En los modelos Gemini 3 el razonamiento "bajo" responde en la mitad del tiempo.
          ...(model.startsWith('gemini-3') ? { thinkingConfig: { thinkingLevel: 'low' } } : {})
        }
      })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const msg = data?.error?.message || `Error ${response.status} en la API de Gemini`;
      // 401/403: clave inválida o bloqueada; reintentar no sirve.
      if (response.status === 401 || response.status === 403) {
        return { error: `La API key de Gemini no es válida o fue bloqueada: ${msg}`, retryable: false };
      }
      // 400 por un modelo retirado sí merece probar otro; otros 400 no.
      const modeloNoDisponible = /no longer available|not found|not supported/i.test(msg);
      if (response.status === 400 && !modeloNoDisponible) return { error: msg, retryable: false };
      return { error: `${model}: ${msg}`, retryable: true };
    }

    const candidate = data?.candidates?.[0];
    if (!candidate) {
      const reason = data?.promptFeedback?.blockReason;
      return { error: reason ? `Gemini bloqueó la solicitud (${reason}).` : 'Gemini no devolvió ninguna respuesta.', retryable: !reason };
    }
    if (candidate.finishReason === 'MAX_TOKENS') {
      return { error: 'La respuesta de la IA fue demasiado larga y se cortó. Intenta con un documento o descripción más breve.', retryable: false };
    }

    const text = (candidate.content?.parts || []).map(p => p.text || '').join('').trim();
    if (!text) return { error: 'Gemini devolvió una respuesta vacía.', retryable: true };
    return { text };
  } catch (error) {
    return { error: error.message || 'Error de conexión con Gemini.', retryable: true };
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function safeParse(str) {
  try { return JSON.parse(str); } catch { return null; }
}
