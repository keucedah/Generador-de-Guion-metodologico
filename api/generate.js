// api/generate.js
export default async function handler(req, res) {
  // 1. Solo aceptar peticiones POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido. Usa POST.' });
  }

  // 2. Leer la API Key de las variables de entorno de Vercel
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Configuración del servidor incompleta (API Key ausente).' });
  }

  // 3. Recibir el payload del frontend
  const { docente, espacio, fileText, descripcion } = req.body;

  // 4. Construir las instrucciones
  const sysMsg = "Eres un especialista en diseño curricular de la UPNFM. Responde SIEMPRE en formato JSON válido estructurado.";
  
  const prompt = `
Actúa como especialista en diseño curricular de la Universidad Pedagógica Nacional Francisco Morazán (UPNFM).
Redacta la GUÍA METODOLÓGICA formal para este espacio formativo.

DATOS:
- Facultad: ${espacio.facultad === 'Otro' ? espacio.facultadOtro : espacio.facultad}
- Departamento: ${espacio.depto === 'Otro' ? espacio.deptoOtro : espacio.depto}
- Espacio Pedagógico: ${espacio.nombreEspacio} (${espacio.codigo})
- Modalidad: ${espacio.modalidad}
- Docente: ${docente.nombre}

${fileText ? `CONTENIDO EXTRAÍDO (USAR COMO BASE ESTRICTA):\n"""\n${fileText}\n"""\n` : ''}
${descripcion ? `INDICACIONES ADICIONALES:\n"""\n${descripcion}\n"""\n` : ''}

Responde ÚNICAMENTE con un JSON que cumpla este esquema estricto:
{
  "descripcion_espacio": "Descripción ampliada (párrafo)",
  "saberes_previos": "Saberes y experiencias previas",
  "competencias_genericas": "Competencias a desarrollar",
  "subcompetencias": "Sub1\\nSub2",
  "contenidos": "Unidad 1\\n- Tema A",
  "metodologia_trabajo": "Metodología de trabajo en clase...",
  "metodologia_evaluacion": "Metodología de evaluación...",
  "documentos_materiales": "Doc 1\\nDoc 2",
  "planificacion_semanal": [
    {"unidad":"Unidad I", "temas":"Tema 1", "competencias":"Comp...", "contenidos":"Cont...", "materiales":"Recurso...", "actividades":"Act...", "criterios":"Crit..."}
  ],
  "encuentros_tutoriales": [
    {"encuentro":"Encuentro 1", "fecha":"Semana 2", "unidades_temas":"Unidad I", "actividades":"Foro..."}
  ],
  "criterios_acreditacion": [
    {"actividad":"Foro", "porcentaje":"20%", "criterios":"Rúbrica"}
  ]
}`;

  try {
    // 5. Llamada segura a Gemini (forzando salida JSON nativa)
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: sysMsg }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { 
          temperature: 0.4,
          maxOutputTokens: 8192,
          responseMimeType: "application/json" // Fuerza el JSON puro sin Markdown
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'Error en la API de Google');
    }

    const data = await response.json();
    const rawText = data.candidates[0].content.parts[0].text;
    
    // Devolver el JSON parseado al frontend
    return res.status(200).json(JSON.parse(rawText));

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}