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
    localStorage.removeItem('nutrifer:geminiModels');
  } catch { /* storage blocked */ }
}

const MODELS_STORAGE = 'nutrifer:geminiModels.v2';

// Proven models go first (Fernanda's choice: an established model answers fast; the newest ones get
// overloaded). Then any other stable flash model, newest first, then preview ones, then flash-lite.
const PREFERRED_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'];

// Listing them (instead of hardcoding names) keeps the app working when Google renames models.
async function listModels(key) {
  const res = await request(`${API}/models?pageSize=200`, { headers: { 'x-goog-api-key': key } }, 15000);
  if (!res.ok) throw new AiError(res.status === 400 || res.status === 403 ? 'key' : 'network', res.detail);
  const models = (res.data?.models ?? []).filter((m) => m.supportedGenerationMethods?.includes('generateContent'));
  const isPreview = (m) => /preview|experimental|exp\b/i.test(`${m.name} ${m.displayName ?? ''} ${m.description ?? ''}`);
  const version = (name) => parseFloat(name.match(/gemini-([\d.]+)/)?.[1] ?? '0');
  const short = (m) => m.name.replace(/^models\//, '');
  const pick = (re) => models.filter((m) => re.test(short(m)));
  const order = (list) => [...list.filter((m) => !isPreview(m)), ...list.filter(isPreview)]
    .map(short);
  const byVersion = (a, b) => version(short(b)) - version(short(a));
  const flash = pick(/^gemini-[\d.]+-flash(-latest)?$/).sort(byVersion);
  const alias = pick(/^gemini-flash-latest$/);
  const lite = pick(/^gemini-[\d.]+-flash-lite(-latest)?$/).sort(byVersion);
  const available = new Set(models.map(short));
  const preferred = PREFERRED_MODELS.filter((m) => available.has(m));
  const ordered = [...new Set([...preferred, ...order(flash), ...alias.map(short), ...order(lite)])];
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
  if (!list.length) {
    // Fresh list (new ordering): only keep the remembered model if it's still the top choice.
    list = await listModels(key);
    preferred = '';
  }
  return [...new Set([preferred, ...list].filter((m) => m && list.includes(m)))];
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
  timeout: 'Gemini no respondió en 30 segundos. Probá de nuevo en un rato.',
  busy: 'Los modelos de Gemini están saturados en este momento. Probá de nuevo en unos minutos.',
  cancel: 'Cálculo cancelado.',
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

const TOTAL_MS = 30000; // whole calculation, across retries and models
const ATTEMPT_MS = 15000; // one request, including reading the whole response
const MAX_MODELS = 3;

// Thinking adds latency and isn't needed for a lookup-style estimate.
// Gemini 2.x takes thinkingBudget; 3.x and later take thinkingLevel.
function thinkingConfig(model) {
  const version = parseFloat(model.match(/gemini-([\d.]+)/)?.[1] ?? '0');
  return version >= 3 ? { thinkingLevel: 'low' } : { thinkingBudget: 0 };
}

// fetch + reading the full body under one time limit (a slow body would otherwise hang forever).
// `outer` is the caller's cancel signal.
async function request(url, options, ms, outer) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort('timeout'), ms);
  const onCancel = () => ctrl.abort('cancel');
  outer?.addEventListener('abort', onCancel);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal });
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch { /* not JSON */ }
    const detail = res.ok ? '' : `${res.status}: ${data?.error?.message ?? ''}`.slice(0, 240);
    return { ok: res.ok, status: res.status, data, detail };
  } catch {
    if (outer?.aborted) throw new AiError('cancel');
    throw new AiError(ctrl.signal.aborted ? 'timeout' : 'network');
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener('abort', onCancel);
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

const responseJson = (data) => JSON.parse(
  data?.candidates?.[0]?.content?.parts?.filter((p) => !p.thought).map((p) => p.text ?? '').join('') ?? '',
);

// Runs a structured task within TOTAL_MS. Tries the last model that worked first; if a model is
// overloaded, slow or retired, moves to the next one. onProgress({ model, attempt }) reports each try.
async function generate(task, text, { onProgress, signal } = {}) {
  const key = getKey();
  if (!key) throw new AiError('nokey');
  const deadline = Date.now() + TOTAL_MS;
  const left = () => deadline - Date.now();
  const models = (await candidateModels(key)).slice(0, MAX_MODELS);
  let lastError = new AiError('model');
  let attempt = 0;

  for (const model of models) {
    const body = requestBody(task, text, model);
    // Per model: one retry without the thinking setting if rejected, one retry if overloaded.
    for (let tries = 0; tries < 2; tries += 1) {
      if (left() < 2000) throw lastError.code === 'model' ? new AiError('timeout') : lastError;
      attempt += 1;
      onProgress?.({ model, attempt });
      let res;
      try {
        res = await request(`${API}/models/${model}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify(body),
        }, Math.min(ATTEMPT_MS, left()), signal);
      } catch (err) {
        if (err.code === 'timeout') { lastError = err; break; } // slow model: next one
        throw err;
      }
      if (res.ok) {
        try {
          const out = { ...task.parse(responseJson(res.data)), model };
          rememberModel(model);
          return out;
        } catch {
          throw new AiError('parse');
        }
      }
      if (res.status === 400 && /think/i.test(res.detail) && body.generationConfig.thinkingConfig) {
        delete body.generationConfig.thinkingConfig;
        continue;
      }
      if (res.status === 503 || res.status === 500) {
        lastError = new AiError('busy', res.detail);
        if (tries === 0) { await new Promise((r) => setTimeout(r, 1000)); continue; }
        break;
      }
      if (res.status === 404) { lastError = new AiError('model', res.detail); break; }
      if (res.status === 429) throw new AiError('quota', res.detail);
      if (res.status === 400 || res.status === 403) throw new AiError('key', res.detail);
      throw new AiError('network', res.detail);
    }
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
// options: { onProgress, signal } (see generate).
export function estimateNutrition(description, options) {
  return generate(NUTRITION, description, options);
}

// Turns a free-text workout note into activities with minutes, calories if the note states them,
// and muscle groups. Calories are never estimated by the model: if the note doesn't say them,
// the app fills them from the user's own kcal-per-hour references.
export function parseWorkout(note, { types, muscles }, options) {
  return generate({
    instructions: `Convertí la descripción de una sesión de actividad física en datos estructurados.
Usá solo estos tipos de actividad: ${types.join(', ')}. La cinta (caminar o trotar en cinta) es "Cinta". Lo que no encaje va como "Otro".
Grupos musculares (solo si hubo trabajo de fuerza): ${muscles.join(', ')}.
Si no se dicen los minutos de una actividad, estimalos de forma conservadora.
En "kcal" copiá solo un número de calorías que la persona haya escrito para esa actividad; si no lo escribió, poné 0. No estimes calorías.
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
              kcal: { type: 'NUMBER', description: 'Calorías escritas por la persona para esta actividad; 0 si no las escribió' },
            },
            required: ['type', 'minutes', 'kcal'],
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
        .map((p) => ({ type: p.type, minutes: Math.round(n(p.minutes)), kcal: Math.round(n(p.kcal)) })),
      muscles: (r.muscles ?? []).filter((m) => muscles.includes(m)),
      detail: String(r.detail ?? '').slice(0, 80),
    }),
  }, note, options);
}

// Small end-to-end check for the profile screen: how long it takes and what fails.
export async function testConnection() {
  const started = performance.now();
  const r = await estimateNutrition('1 manzana mediana');
  return { seconds: (performance.now() - started) / 1000, model: r.model, kcal: r.kcal };
}

// UI helper: shows "Calculando con IA… 8 s · modelo" with a Cancel link while a call runs.
// Returns the options to pass to the call and a done() to restore the button.
export function aiProgress(button, statusEl) {
  const ctrl = new AbortController();
  const started = Date.now();
  let model = '';
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Calculando...';
  statusEl.innerHTML = '<span class="ai-progress"></span> <button type="button" class="link ai-cancel">Cancelar</button>';
  const label = statusEl.querySelector('.ai-progress');
  const paint = () => {
    label.textContent = `Calculando con IA… ${Math.round((Date.now() - started) / 1000)} s${model ? ` · ${model}` : ''}`;
  };
  paint();
  const timer = setInterval(paint, 1000);
  statusEl.querySelector('.ai-cancel').addEventListener('click', () => ctrl.abort());
  return {
    options: { signal: ctrl.signal, onProgress: (p) => { model = p.model; paint(); } },
    done(message = '') {
      clearInterval(timer);
      button.disabled = false;
      button.textContent = original;
      statusEl.innerHTML = message;
    },
  };
}

// One line explaining a failure, with Google's own text when there is one.
export function aiErrorHtml(err) {
  const msg = AI_MESSAGES[err?.code] ?? AI_MESSAGES.network;
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  return `<span class="form-error">${esc(msg)}</span>${err?.detail ? `<br><span class="muted">Detalle de Google: ${esc(err.detail)}</span>` : ''}`;
}
