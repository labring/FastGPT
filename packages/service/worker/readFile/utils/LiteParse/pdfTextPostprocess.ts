import type { ParsedPage, TextItem } from '@llamaindex/liteparse';

const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
const CJK_END_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff）》】」』”]$/;
const CJK_START_RE = /^[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff（《【「『“]/;
const SENTENCE_END_RE = /[。！？!?；;：:）】》」』”]$/;
const PARAGRAPH_END_RE = /[。！？!?]$/;
const BULLET_RE = /^(?:[·•●▪-]\s*|\(\d+\)|（[一二三四五六七八九十\d]+）|\d+(?:\.\d+)*\s+)/;
const OBVIOUS_HEADING_RE =
  /^(?:前\s*言|目\s*录|图\s*目\s*录|表\s*目\s*录|参考文献|版权声明|第\s*\d+\s*[章节]|[一二三四五六七八九十]+、|（[一二三四五六七八九十]+）|\d+(?:\.\d+)+\s*)/;
const TOC_LINE_RE = /\.{4,}\s*\d+$/;
const PAGE_NO_RE = /^[-—]?\s*\d{1,5}\s*[-—]?$/;
const URL_NOISE_RE = /^\/?[a-z]{2}(?:\/|\))|^\(\/[a-z]{2}\/?\)$/i;

export type PdfTextPostprocessOptions = {
  normalizeUnicode?: boolean;
  trimPageEdge?: boolean;
  headerRatio?: number;
  footerRatio?: number;
  lineYRatio?: number;
  minSpaceGapRatio?: number;
  wideSpaceGapRatio?: number;
  mergeVisualLines?: boolean;
  removeRepeatedPageNoise?: boolean;
  repeatedNoiseMinCount?: number;
  repeatedNoiseMaxLength?: number;
  dropPurePageNumber?: boolean;
  inlineNoisePhrases?: string[];
};

type NormalizedTextItem = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
};

type LineGroup = {
  y: number;
  items: NormalizedTextItem[];
};

const DEFAULT_OPTIONS = {
  normalizeUnicode: false,
  trimPageEdge: true,
  headerRatio: 0.05,
  footerRatio: 0.05,
  lineYRatio: 0.55,
  minSpaceGapRatio: 0.35,
  wideSpaceGapRatio: 1.2,
  mergeVisualLines: true,
  removeRepeatedPageNoise: true,
  repeatedNoiseMinCount: 3,
  repeatedNoiseMaxLength: 30,
  dropPurePageNumber: true,
  inlineNoisePhrases: []
} satisfies Required<PdfTextPostprocessOptions>;

/**
 * 将 LiteParse 的坐标文本项恢复为更适合知识库切分的纯文本。
 *
 * 该函数只做低风险文本整理：按 y/x 坐标重组行、过滤页面边缘页眉页脚、
 * 删除重复页码/页面噪声，并保守合并 PDF 视觉换行。它不做 OCR、不提取图片，
 * 也不把页面截图插入文本，避免改变普通 PDF 解析的成本模型和返回契约。
 */
export const postprocessLiteParsePages = (
  pages: Pick<ParsedPage, 'height' | 'textItems'>[],
  options: PdfTextPostprocessOptions = {}
) => {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const lines = pages.flatMap((page) => extractPageLines(page, opts));

  return mergeLines(lines, opts);
};

export const extractPageLines = (
  page: Pick<ParsedPage, 'height' | 'textItems'>,
  options: PdfTextPostprocessOptions = {}
) => {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const items = (page.textItems || [])
    .map((item) => normalizeTextItem(item, opts))
    .filter((item) => item.text)
    .filter((item) => !opts.trimPageEdge || isInsidePageBody(item, page, opts));

  if (items.length === 0) return [];

  const medianHeight = median(items.map((item) => item.height || item.fontSize || 10)) || 10;
  const lineTolerance = Math.max(2, medianHeight * opts.lineYRatio);
  const lines: LineGroup[] = [];

  for (const item of items.sort((a, b) => a.y - b.y || a.x - b.x)) {
    const target = lines.find((line) => Math.abs(line.y - item.y) <= lineTolerance);
    if (target) {
      target.items.push(item);
      target.y = (target.y * (target.items.length - 1) + item.y) / target.items.length;
      continue;
    }

    lines.push({ y: item.y, items: [item] });
  }

  return lines
    .sort((a, b) => a.y - b.y)
    .map((line) => joinLineItems(line.items, medianHeight, opts))
    .map((line) => line.trim())
    .filter(Boolean);
};

const normalizeTextItem = (
  item: Partial<TextItem>,
  opts: Required<PdfTextPostprocessOptions>
): NormalizedTextItem => {
  return {
    text: normalizeText(String(item.text || ''), opts).trim(),
    x: Number(item.x) || 0,
    y: Number(item.y) || 0,
    width: Math.max(0, Number(item.width) || 0),
    height: Math.max(0, Number(item.height || item.fontSize) || 0),
    fontSize: Math.max(0, Number(item.fontSize) || 0)
  };
};

const normalizeText = (text: string, opts: Required<PdfTextPostprocessOptions>) => {
  const normalized = opts.normalizeUnicode ? text.normalize('NFKC') : text;

  return normalized
    .replace(/[\u200b\u200c\u200d\ufeff]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s+([，。！？；：、,.!?;:])/g, '$1')
    .replace(/([（《【「『“])\s+/g, '$1')
    .replace(/\s+([）》】」』”])/g, '$1');
};

const isInsidePageBody = (
  item: NormalizedTextItem,
  page: Pick<ParsedPage, 'height'>,
  opts: Required<PdfTextPostprocessOptions>
) => {
  const pageHeight = Number(page.height) || 0;
  if (!pageHeight) return true;

  const topCutoff = pageHeight * opts.headerRatio;
  const bottomCutoff = pageHeight * (1 - opts.footerRatio);
  return item.y >= topCutoff && item.y <= bottomCutoff;
};

const joinLineItems = (
  items: NormalizedTextItem[],
  medianHeight: number,
  opts: Required<PdfTextPostprocessOptions>
) => {
  let line = '';
  let previous: NormalizedTextItem | undefined;

  for (const item of items.sort((a, b) => a.x - b.x)) {
    if (!previous) {
      line = item.text;
      previous = item;
      continue;
    }

    const gap = item.x - (previous.x + previous.width);
    const shouldSpace =
      gap > medianHeight * opts.wideSpaceGapRatio ||
      (gap > medianHeight * opts.minSpaceGapRatio && needsSpace(line, item.text));

    line = shouldSpace ? `${line} ${item.text}` : joinText(line, item.text);
    previous = item;
  }

  return normalizeText(line, opts);
};

const mergeLines = (lines: string[], opts: Required<PdfTextPostprocessOptions>) => {
  const noiseSet = opts.removeRepeatedPageNoise
    ? findRepeatedNoise(lines, opts)
    : new Set<string>();
  const paragraphs: string[] = [];
  let current = '';
  let previousStandalone = false;

  const flush = () => {
    if (current) paragraphs.push(current);
    current = '';
  };

  for (const rawLine of lines) {
    const line = cleanupInlineNoise(normalizeText(rawLine, opts).trim(), noiseSet, opts);
    if (!line) continue;
    if (noiseSet.has(line)) continue;
    if (opts.dropPurePageNumber && PAGE_NO_RE.test(line)) continue;

    const standalone = isStandaloneLine(line);

    if (!current) {
      current = line;
      previousStandalone = standalone;
      if (standalone) flush();
      continue;
    }

    if (standalone) {
      flush();
      paragraphs.push(line);
      previousStandalone = true;
      continue;
    }

    if (shouldMergeLine(current, line, previousStandalone, opts)) {
      current = joinText(current, line);
    } else {
      flush();
      current = line;
    }

    previousStandalone = false;
  }

  flush();

  return paragraphs.join('\n\n') + (paragraphs.length > 0 ? '\n' : '');
};

const shouldMergeLine = (
  current: string,
  next: string,
  previousStandalone: boolean,
  opts: Required<PdfTextPostprocessOptions>
) => {
  if (!opts.mergeVisualLines) return false;
  if (previousStandalone) return false;
  if (SENTENCE_END_RE.test(current)) return false;
  if (isStandaloneLine(next)) return false;
  return true;
};

const isStandaloneLine = (line: string) => {
  if (PAGE_NO_RE.test(line)) return true;
  if (OBVIOUS_HEADING_RE.test(line)) return true;
  if (TOC_LINE_RE.test(line)) return true;
  if (BULLET_RE.test(line)) return true;
  if (URL_NOISE_RE.test(line)) return true;
  if (line.length <= 14 && CJK_RE.test(line) && !/[，,。！？；;：:]/.test(line)) return true;
  return false;
};

const joinText = (left: string, right: string) => {
  if (!left) return right;
  if (!right) return left;
  if (needsSpace(left, right)) return `${left} ${right}`;
  return `${left}${right}`;
};

const needsSpace = (left: string, right: string) => {
  if (!left || !right) return false;
  if (CJK_END_RE.test(left) && CJK_START_RE.test(right)) return false;
  if (/[-/([{]$/.test(left)) return false;
  if (/^[,.;:!?%)}\]]/.test(right)) return false;
  return /[A-Za-z0-9]$/.test(left) || /^[A-Za-z0-9]/.test(right);
};

const findRepeatedNoise = (lines: string[], opts: Required<PdfTextPostprocessOptions>) => {
  const counts = new Map<string, number>();

  for (const line of lines) {
    const text = normalizeText(line, opts).trim();
    if (!isNoiseCandidate(text, opts)) continue;
    counts.set(text, (counts.get(text) || 0) + 1);
  }

  return new Set(
    [...counts.entries()]
      .filter(([, count]) => count >= opts.repeatedNoiseMinCount)
      .map(([text]) => text)
  );
};

const isNoiseCandidate = (line: string, opts: Required<PdfTextPostprocessOptions>) => {
  if (!line) return false;
  if (PAGE_NO_RE.test(line)) return true;
  if (URL_NOISE_RE.test(line)) return true;
  if (line.length > opts.repeatedNoiseMaxLength) return false;
  if (!SENTENCE_END_RE.test(line) && !PARAGRAPH_END_RE.test(line)) return true;
  return false;
};

const cleanupInlineNoise = (
  line: string,
  noiseSet: Set<string>,
  opts: Required<PdfTextPostprocessOptions>
) => {
  let text = line;
  const candidates = new Set(opts.inlineNoisePhrases);

  // 只对 URL/语言路径类噪声做行内删除，避免把短词误删出正文。
  for (const noise of noiseSet) {
    if (URL_NOISE_RE.test(noise)) candidates.add(noise);
  }

  for (const noise of candidates) {
    if (!noise) continue;
    text = text.split(noise).join(' ');
  }

  return normalizeText(text, opts).trim();
};

const median = (nums: number[]) => {
  const valid = nums.filter(Number.isFinite).sort((a, b) => a - b);
  if (valid.length === 0) return 0;
  return valid[Math.floor(valid.length / 2)];
};
