/**
 * 调用外部 OCR 服务的 LiteParse 引擎实现。
 *
 * LiteParse 的 WASM 构建没有内置 Tesseract，也不会读取 ocrServerUrl
 * （HTTP 引擎分支只在非 wasm32 目标编译），只接受 ocrEngine 回调。
 * 因此这里按 LiteParse 的 OCR 服务规范实现回调：把页面 PNG 以
 * multipart 形式（file + language）POST 到服务地址，再把 results 转换
 * 成 LiteParse 需要的结构。
 *
 * 服务规范示例见 liteparse 的 ocr/README：MiniCPM-OCR、EasyOCR、
 * PaddleOCR 等适配器都实现了同一套接口。
 */

export type LiteParseOcrResult = {
  text: string;
  bbox: [number, number, number, number];
  confidence: number;
  polygon?: [[number, number], [number, number], [number, number], [number, number]];
};

export type LiteParseOcrEngine = {
  recognize: (
    imageData: Uint8Array,
    width: number,
    height: number,
    language: string
  ) => Promise<LiteParseOcrResult[]>;
};

export type HttpOcrEngineOptions = {
  url: string;
  key?: string;
  timeoutMs: number;
};

const MAX_ERROR_BODY_LENGTH = 500;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const toBbox = (value: unknown): LiteParseOcrResult['bbox'] | undefined => {
  if (!Array.isArray(value) || value.length !== 4) return undefined;

  const [x1, y1, x2, y2] = value;
  if (!isFiniteNumber(x1) || !isFiniteNumber(y1) || !isFiniteNumber(x2) || !isFiniteNumber(y2)) {
    return undefined;
  }
  if (x2 <= x1 || y2 <= y1) return undefined;

  return [x1, y1, x2, y2];
};

const toPolygon = (value: unknown): LiteParseOcrResult['polygon'] => {
  if (!Array.isArray(value) || value.length !== 4) return undefined;

  const points: [number, number][] = [];
  for (const point of value) {
    if (!Array.isArray(point) || point.length !== 2) return undefined;
    const [x, y] = point;
    if (!isFiniteNumber(x) || !isFiniteNumber(y)) return undefined;
    points.push([x, y]);
  }

  return points as LiteParseOcrResult['polygon'];
};

/**
 * LiteParse 会丢弃 confidence <= 0.1 的识别结果，服务未返回置信度时按 1 处理，
 * 避免整页文字被静默丢弃。
 */
const toConfidence = (value: unknown) => {
  if (!isFiniteNumber(value)) return 1;
  return Math.min(1, Math.max(0, value));
};

/**
 * 解析 OCR 服务响应。缺少 results 数组说明服务不符合规范，直接抛错；
 * 单条结果里文本为空或 bbox 非法的条目跳过，避免把脏数据交给版面合并。
 */
export const parseHttpOcrResponse = (payload: unknown): LiteParseOcrResult[] => {
  if (!payload || typeof payload !== 'object') {
    throw new Error('OCR server response is not a JSON object');
  }

  const { results } = payload as { results?: unknown };
  if (!Array.isArray(results)) {
    throw new Error('OCR server response is missing a "results" array');
  }

  const parsed: LiteParseOcrResult[] = [];
  for (const item of results) {
    if (!item || typeof item !== 'object') continue;

    const { text, bbox, confidence, polygon } = item as {
      text?: unknown;
      bbox?: unknown;
      confidence?: unknown;
      polygon?: unknown;
    };
    const normalizedText = typeof text === 'string' ? text.trim() : '';
    const normalizedBbox = toBbox(bbox);
    if (!normalizedText || !normalizedBbox) continue;

    const result: LiteParseOcrResult = {
      text: normalizedText,
      bbox: normalizedBbox,
      confidence: toConfidence(confidence)
    };
    const normalizedPolygon = toPolygon(polygon);
    if (normalizedPolygon) result.polygon = normalizedPolygon;

    parsed.push(result);
  }

  return parsed;
};

export const createHttpOcrEngine = ({
  url,
  key,
  timeoutMs
}: HttpOcrEngineOptions): LiteParseOcrEngine => ({
  recognize: async (imageData, _width, _height, language) => {
    // Blob 只接受 ArrayBuffer 视图，复制一份 Uint8Array 避免把 imageData 的
    // ArrayBufferLike（可能来自 SharedArrayBuffer）直接传进去。
    const pageBytes = new Uint8Array(imageData);

    const form = new FormData();
    form.append('file', new Blob([pageBytes], { type: 'image/png' }), 'page.png');
    form.append('language', language);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: key ? { Authorization: `Bearer ${key}` } : undefined,
        body: form,
        signal: controller.signal
      });

      if (!response.ok) {
        const detail = await response
          .text()
          .catch(() => '')
          .then((text) => text.slice(0, MAX_ERROR_BODY_LENGTH));
        throw new Error(
          `OCR server returned HTTP ${response.status}${detail ? `: ${detail}` : ''}`
        );
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new Error('OCR server returned invalid JSON');
      }

      return parseHttpOcrResponse(payload);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`OCR request timed out after ${timeoutMs} ms`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
});
