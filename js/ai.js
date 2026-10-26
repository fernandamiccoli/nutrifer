// Nutrition estimates with the Gemini API, called straight from the browser with the user's own key.
// The key lives only in this device's localStorage: it is never in the code, the repo or the backups.
// Only the food description (and portion) is sent; no name, medication or other personal data.

const API = 'https://generativelanguage.googleapis.com/v1beta';
const KEY_STORAGE = 'nutrifer:geminiKey';
const MODEL_STORAGE = 'nutrifer:geminiModel';

export function getKey() {
  try { return localStorage.getItem(KEY_STORAGE) || ''; } catch { return ''; }
}

export const hasKey = () => !!getKey();

export function clearKey() {
  try {
    localStorage.removeItem(KEY_STORAGE);
    localStorage.removeItem(MODEL_STORAGE);
  } catch { /* storage blocked */ }
}

// Picks the newest general "flash" model the key can use, so model renames don't break the app.
async function pickModel(key) {
  let res;
  try {
    res = await fetch(`${API}/models?pageSize=200`, { headers: { 'x-goog-api-key': key } });
  } catch {
    throw new AiError('network');
  }
  if (!res.ok) throw new AiError(res.status === 400 || res.status === 403 ? 'key' : 'network');
  const { models = [] } = await res.json();
  const usable = models
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => m.name.replace(/^models\//, ''))
    .filter((n) => /^gemini-[\d.]+-flash$/.test(n) || /^gemini-[\d.]+-flash-latest$/.test(n) || n === 'gemini-flash-latest');
  if (!usable.length) throw new AiError('model');
  const version = (n) => parseFloat(n.match(/gemini-([\d.]+)/)?.[1] ?? '0');
  return usable.sort((a, b) => version(b) - version(a))[0];
}

export async function saveKey(key) {
  const model = await pickModel(key.trim());
  try {
    localStorage.setItem(KEY_STORAGE, key.trim());
    localStorage.setItem(MODEL_STORAGE, model);
  } catch { throw new AiError('storage'); }
  return model;
}

export class AiError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

export const AI_MESSAGES = {
  nokey: 'Primero cargá tu clave de Gemini en el Perfil.',
  key: 'La clave de Gemini no funciona. Revisala en el Perfil.',
  quota: 'Se alcanzó el límite de uso de Gemini. Probá en un rato.',
  network: 'No pude conectarme con Gemini. Revisá la conexión.',
  model: 'Tu clave no tiene acceso a un modelo de Gemini compatible.',
  parse: 'Gemini respondió algo que no pude leer. Probá de nuevo.',
  storage: 'Este navegador no deja guardar la clave.',
};

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    grams: { type: 'NUMBER', description: 'Peso total estimado de la porción en gramos' },
    kcal: { type: 'NUMBER' },
    protein: { type: 'NUMBER', description: 'gramos' },
    carbs: { type: 'NUMBER', description: 'gramos' },
    fat: { type: 'NUMBER', description: 'gramos' },
    assumptions: { type: 'STRING', description: 'Supuestos usados, en una oración breve en español rioplatense' },
    confidence: { type: 'STRING', enum: ['alta', 'media', 'baja'] },
  },
  required: ['grams', 'kcal', 'protein', 'carbs', 'fat', 'assumptions', 'confidence'],
};

const INSTRUCTIONS = `Sos un asistente de nutrición para una persona en Argentina que registra lo que come.
Estimá energía y macronutrientes de la porción descripta, usando tablas de composición de referencia (ARGENFOODS, USDA).
Incluí lo que se agregó al preparar (por ejemplo aceite, manteca, azúcar) si se menciona; si dice "un poco de aceite", suponé una cucharadita (5 g).
Si la cantidad no está clara, suponé una porción casera típica de Argentina y decilo en "assumptions".
Si es un producto envasado, usá los valores típicos del producto. No inventes precisión: redondeá kcal a enteros y macros a un decimal.`;

// description: what was eaten, e.g. "1 huevo a la plancha con un poco de oliva".
export async function estimateNutrition(description) {
  const key = getKey();
  if (!key) throw new AiError('nokey');
  let model;
  try { model = localStorage.getItem(MODEL_STORAGE); } catch { /* storage blocked */ }
  model ||= await pickModel(key);

  let res;
  try {
    res = await fetch(`${API}/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: INSTRUCTIONS }] },
        contents: [{ role: 'user', parts: [{ text: description }] }],
        generationConfig: { temperature: 0.2, responseMimeType: 'application/json', responseSchema: SCHEMA },
      }),
    });
  } catch {
    throw new AiError('network');
  }
  if (res.status === 404) { // model retired: pick again next time
    try { localStorage.removeItem(MODEL_STORAGE); } catch { /* storage blocked */ }
    throw new AiError('model');
  }
  if (res.status === 429) throw new AiError('quota');
  if (res.status === 400 || res.status === 403) throw new AiError('key');
  if (!res.ok) throw new AiError('network');

  try {
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    const r = JSON.parse(text);
    const n = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : 0);
    return {
      grams: n(r.grams) || null,
      kcal: Math.round(n(r.kcal)),
      protein: Math.round(n(r.protein) * 10) / 10,
      carbs: Math.round(n(r.carbs) * 10) / 10,
      fat: Math.round(n(r.fat) * 10) / 10,
      assumptions: String(r.assumptions ?? '').slice(0, 300),
      confidence: ['alta', 'media', 'baja'].includes(r.confidence) ? r.confidence : 'baja',
      model,
    };
  } catch {
    throw new AiError('parse');
  }
}
