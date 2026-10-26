// Barcode scanning (native BarcodeDetector, ZXing fallback) and Open Food Facts lookup.

const ZXING_URL = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js';
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

let zxingPromise;
function loadZxing() {
  zxingPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = ZXING_URL;
    s.onload = () => resolve(window.ZXing);
    s.onerror = () => reject(new Error('zxing'));
    document.head.appendChild(s);
  });
  return zxingPromise;
}

async function nativeDetectorAvailable() {
  if (!('BarcodeDetector' in window)) return false;
  const supported = await window.BarcodeDetector.getSupportedFormats();
  return FORMATS.some((f) => supported.includes(f));
}

// Starts the camera on <video> and resolves with the first code read.
// Returns { promise, stop } so the caller can cancel.
export function startScan(video) {
  let stopped = false;
  let stream;
  let zxingReader;

  const stop = () => {
    stopped = true;
    zxingReader?.reset();
    stream?.getTracks().forEach((t) => t.stop());
  };

  const promise = (async () => {
    if (await nativeDetectorAvailable()) {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      video.srcObject = stream;
      await video.play();
      const detector = new window.BarcodeDetector({ formats: FORMATS });
      while (!stopped) {
        const codes = await detector.detect(video).catch(() => []);
        if (codes.length) {
          stop();
          return codes[0].rawValue;
        }
        await new Promise((r) => setTimeout(r, 200));
      }
      return null;
    }

    const ZXing = await loadZxing();
    const hints = new Map([[ZXing.DecodeHintType.POSSIBLE_FORMATS, [
      ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.EAN_8, ZXing.BarcodeFormat.UPC_A, ZXing.BarcodeFormat.UPC_E,
    ]]]);
    zxingReader = new ZXing.BrowserMultiFormatReader(hints);
    return new Promise((resolve, reject) => {
      zxingReader.decodeFromConstraints({ video: { facingMode: 'environment' } }, video, (result, err) => {
        if (result) {
          stop();
          resolve(result.getText());
        } else if (err && !(err instanceof ZXing.NotFoundException) && !(err instanceof ZXing.ChecksumException) && !(err instanceof ZXing.FormatException)) {
          stop();
          reject(err);
        }
      }).catch(reject);
    });
  })();

  return { promise, stop };
}

// Returns a food draft (per 100 g) plus the list of fields Open Food Facts didn't have.
export async function lookupBarcode(code) {
  const fields = 'product_name,product_name_es,brands,nutriments,serving_quantity';
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${fields}`);
  if (!res.ok && res.status !== 404) throw new Error(`off ${res.status}`);
  const data = await res.json();
  if (data.status !== 1 || !data.product) return null;

  const p = data.product;
  const n = p.nutriments ?? {};
  const val = (key) => (typeof n[key] === 'number' ? Math.round(n[key] * 10) / 10 : null);
  const kcal = val('energy-kcal_100g') ?? (typeof n['energy_100g'] === 'number' ? Math.round(n['energy_100g'] / 4.184) : null);

  const draft = {
    barcode: code,
    name: (p.product_name_es || p.product_name || '').trim(),
    brand: (p.brands || '').split(',')[0].trim(),
    kcal,
    p: val('proteins_100g'),
    c: val('carbohydrates_100g'),
    f: val('fat_100g'),
    unit: { label: 'porción', g: Number(p.serving_quantity) > 0 ? Math.round(Number(p.serving_quantity)) : 100 },
    tags: [],
  };
  const missing = ['name', 'kcal', 'p', 'c', 'f'].filter((k) => draft[k] === null || draft[k] === '');
  return { draft, missing };
}
