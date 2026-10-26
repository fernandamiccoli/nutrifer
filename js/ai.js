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
    localStorage.removeItem(MODELS_STORAGE);
  } catch { /* storage blocked */ }
}

const MODELS_STORAGE = 'nutrifer:geminiModels';

// Flash models the key can use, newest first, then the lighter "flash-lite" ones as a last resort.
// Listing them (instead of hardcoding names) keeps the app working when Google renames models.
async function listModels(key) {
  let res;
  try {
    res = await fetch(`${API}/models?pageSize=200`, { headers: { 'x-goog-api-key': key } });
  } catch {
    throw new AiError('network');
  }
  if (!res.ok) throw new AiError(res.status === 400 || res.status === 403 ? 'key' : 'network', await errorDetail(res));
  const { models = [] } = await res.json();
  const names = models
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => m.name.replace(/^models\//, ''));
  const version = (n) => parseFloat(n.match(/gemini-([\d.]+)/)?.[1] ?? '0');
  const byVersion = (a, b) => version(b) - version(a);
  const flash = names.filter((n) => /^gemini-[\d.]+-flash(-latest)?$/.test(n)).sort(byVersion);
  const lite = names.filter((n) => /^gemini-[\d.]+-flash-lite(-latest)?$/.test(n)).sort(byVersion);
  const ordered = [...flash, ...(names.includes('gemini-flash-latest') ? ['gemini-flash-latest'] : []), ...lite];
  if (!ordered.length) throw new AiError('model');
  try { localStorage.setItem(MODELS_STORAGE, JSON.stringify(ordered)); } catch { /* storage blocked */ }
  return ordered;
}

async function candidateModels(key) {
  let preferred = '';
  let list = [];
  try {
    preferred = localStorage.getItem(MODEL_STORAGE) || '';
    list = JSON.parse(localStorage.getItem(MODELS_STORAGE) || '[]');
  } catch { /* storage blocked */ }
  if (!list.length) list = await listModels(key);
  return [...new Set([preferred, ...list].filter(Boolean))];
}

function rememberModel(model) {
  try { localStorage.setItem(MODEL_STORAGE, model); } catch { /* storage blocked */ }
}

export async function saveKey(key) {
  const [model] = await listModels(key.trim());
  try {
    localStorage.setItem(KEY_STORAGE, key.trim());
    localStorage.setItem(MODEL_STORAGE, model);
  } catch { throw new AiError('storage'); }
  return model;
}

export class AiError extends Error {
  constructor(code, detail = '') {
    super(code);
    this.code = code;
    this.detail = detail;
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
  timeout: 'Gemini tardó demasiado en responder. Probá de nuevo en un rato.',
  busy: 'Los modelos de Gemini están saturados en este momento. Probá de nuevo en unos minutos.',
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

const TIMEOUT_MS = 20000;
const MAX_MODELS = 3;

// Thinking adds latency and isn't needed for a lookup-style estimate.
// Gemini 2.x takes thinkingBudget; 3.x and later take thinkingLevel.
function thinkingConfig(model) {
  const version = parseFloat(model.match(/gemini-([\d.]+)/)?.[1] ?? '0');
  return version >= 3 ? { thinkingLevel: 'low' } : { thinkingBudget: 0 };
}

async function post(model, key, body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(`${API}/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (err) {
    throw new AiError(err.name === 'AbortError' ? 'timeout' : 'network');
  } finally {
    clearTimeout(timer);
  }
}

// Google's error text, for the diagnostics shown to the user (never contains the key).
async function errorDetail(res) {
  try {
    const data = await res.json();
    return `${res.status}: ${data.error?.message ?? ''}`.slice(0, 240);
  } catch {
    return String(res.status);
  }
}

function requestBody(task, text, model) {
  return {
    systemInstruction: { parts: [{ text: task.instructions }] },
    contents: [{ role: 'user', parts: [{ text }] }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
      responseSchema: task.schema,
      thinkingConfig: thinkingConfig(model),
    },
  };
}

// One model: a retry without the thinking setting if rejected, and one retry if overloaded.
async function callModel(model, key, task, text) {
  const body = requestBody(task, text, model);
  let res = await post(model, key, body);
  if (res.status === 400 && /think/i.test(await errorDetail(res.clone()))) {
    delete body.generationConfig.thinkingConfig;
    res = await post(model, key, body);
  }
  if (res.status === 503 || res.status === 500) {
    await new Promise((r) => setTimeout(r, 1500));
    res = await post(model, key, body);
  }
  return res;
}

const responseJson = (data) => JSON.parse(
  data.candidates?.[0]?.content?.parts?.filter((p) => !p.thought).map((p) => p.text ?? '').join('') ?? '',
);

// Runs a structured task. Tries the last model that worked first; if a model is overloaded,
// slow or retired, moves to the next one.
async function generate(task, text) {
  const key = getKey();
  if (!key) throw new AiError('nokey');
  const models = (await candidateModels(key)).slice(0, MAX_MODELS);
  let lastError = new AiError('model');

  for (const model of models) {
    let res;
    try {
      res = await callModel(model, key, task, text);
    } catch (err) {
      if (err.code === 'timeout') { lastError = err; continue; }
      throw err;
    }
    if (res.ok) {
      try {
        const out = { ...task.parse(responseJson(await res.json())), model };
        rememberModel(model);
        return out;
      } catch {
        throw new AiError('parse');
      }
    }
    const detail = await errorDetail(res);
    if ([500, 503, 404].includes(res.status)) {
      lastError = new AiError(res.status === 404 ? 'model' : 'busy', detail);
      continue;
    }
    if (res.status === 429) throw new AiError('quota', detail);
    if (res.status === 400 || res.status === 403) throw new AiError('key', detail);
    throw new AiError('network', detail);
  }
  throw lastError;
}

const n = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : 0);

const NUTRITION = {
  instructions: INSTRUCTIONS,
  schema: SCHEMA,
  parse: (r) => ({
    grams: n(r.grams) || null,
    kcal: Math.round(n(r.kcal)),
    protein: Math.round(n(r.protein) * 10) / 10,
    carbs: Math.round(n(r.carbs) * 10) / 10,
    fat: Math.round(n(r.fat) * 10) / 10,
    assumptions: String(r.assumptions ?? '').slice(0, 300),
    confidence: ['alta', 'media', 'baja'].includes(r.confidence) ? r.confidence : 'baja',
  }),
};

// description: what was eaten, e.g. "1 huevo a la plancha con un poco de oliva".
export function estimateNutrition(description) {
  return generate(NUTRITION, description);
}

// Turns a free-text workout note into activities with minutes, intensity and muscle groups.
// Calories are NOT asked to the model: the app computes them with METs so they stay consistent.
export function parseWorkout(note, { types, muscles, totalMinutes }) {
  return generate({
    instructions: `Convertí la descripción de una sesión de actividad física en datos estructurados.
Usá solo estos tipos de actividad: ${types.join(', ')}. Lo que no encaje va como "Otro".
Intensidad: "low" (suave), "mid" (moderada) o "high" (intensa); si no se aclara, usá "mid".
Grupos musculares (solo si hubo trabajo de fuerza): ${muscles.join(', ')}.
${totalMinutes ? `La sesión duró ${totalMinutes} minutos en total: repartilos entre las actividades.` : 'Si no se dicen los minutos, estimalos de forma conservadora.'}
No inventes actividades que no se mencionan.`,
    schema: {
      type: 'OBJECT',
      properties: {
        parts: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              type: { type: 'STRING', enum: types },
              minutes: { type: 'NUMBER' },
              intensity: { type: 'STRING', enum: ['low', 'mid', 'high'] },
            },
            required: ['type', 'minutes', 'intensity'],
          },
        },
        muscles: { type: 'ARRAY', items: { type: 'STRING', enum: muscles } },
        detail: { type: 'STRING', description: 'Resumen breve en español rioplatense, por ejemplo "piernas y glúteos + cinta"' },
      },
      required: ['parts', 'muscles', 'detail'],
    },
    parse: (r) => ({
      parts: (r.parts ?? [])
        .filter((p) => types.includes(p.type) && n(p.minutes) > 0)
        .map((p) => ({ type: p.type, minutes: Math.round(n(p.minutes)), intensity: ['low', 'mid', 'high'].includes(p.intensity) ? p.intensity : 'mid' })),
      muscles: (r.muscles ?? []).filter((m) => muscles.includes(m)),
      detail: String(r.detail ?? '').slice(0, 80),
    }),
  }, note);
}

// Small end-to-end check for the profile screen: how long it takes and what fails.
export async function testConnection() {
  const started = performance.now();
  const r = await estimateNutrition('1 manzana mediana');
  return { seconds: (performance.now() - started) / 1000, model: r.model, kcal: r.kcal };
}
