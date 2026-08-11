import type { ParsedPage, TextItem } from '../../type';

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

type PositionedLine = {
  text: string;
  y: number;
  bottom: number;
  pageHeight: number;
  pageIndex: number;
  hasColumnGap: boolean;
};

type PageEdge = 'header' | 'footer';

type EdgeLine = {
  line: PositionedLine;
  edge: PageEdge;
};

const EDGE_POSITION_TOLERANCE_RATIO = 0.01;
const REPEATED_EDGE_MIN_PAGE_RATIO = 0.5;

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
  repeatedNoiseMinCount: 2,
  repeatedNoiseMaxLength: 30,
  dropPurePageNumber: true,
  inlineNoisePhrases: []
} satisfies Required<PdfTextPostprocessOptions>;

/**
 * 将 LiteParse 的坐标文本项恢复为更适合知识库切分的纯文本。
 *
 * 该函数只做低风险文本整理：按 y/x 坐标重组行、结合跨页重复与相对位置过滤
 * 页眉页脚、删除纯页码，并保守合并 PDF 视觉换行。页面边缘的唯一文本默认保留，
 * 避免把紧贴页边的正文误判成页眉页脚。它不做 OCR、不提取图片，也不把页面
 * 截图插入文本，避免改变普通 PDF 解析的成本模型和返回契约。
 */
export const postprocessPdfPages = (
  pages: Pick<ParsedPage, 'height' | 'textItems'>[],
  options: PdfTextPostprocessOptions = {}
) => {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const pageLines = pages.map((page, pageIndex) =>
    extractPositionedPageLines(page, opts, pageIndex)
  );
  const repeatedEdgeLines =
    opts.trimPageEdge && opts.removeRepeatedPageNoise
      ? findRepeatedEdgeLines(pageLines, opts)
      : new Set<PositionedLine>();
  const lines = pageLines.flat().filter((line) => !repeatedEdgeLines.has(line));

  return mergeLines(
    lines.map((line) => line.text),
    opts
  );
};

/**
 * 将单页文本项按视觉坐标重组成文本行。
 *
 * 单页没有足够证据判断页眉页脚，因此这里保留所有边缘文本；跨页噪声识别由
 * `postprocessPdfPages` 在拿到完整页面集合后统一处理。
 */
export const extractPageLines = (
  page: Pick<ParsedPage, 'height' | 'textItems'>,
  options: PdfTextPostprocessOptions = {}
) => {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  return extractPositionedPageLines(page, opts, 0).map((line) => line.text);
};

/**
 * 组装保留页面与文本框位置的行模型，供跨页噪声判断精确定位到具体行。
 */
const extractPositionedPageLines = (
  page: Pick<ParsedPage, 'height' | 'textItems'>,
  opts: Required<PdfTextPostprocessOptions>,
  pageIndex: number
) => {
  const items = (page.textItems || [])
    .map((item) => normalizeTextItem(item, opts))
    .filter((item) => item.text);

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
    .map((line): PositionedLine => {
      const sortedItems = line.items.sort((a, b) => a.x - b.x);

      return {
        text: joinLineItems(sortedItems, medianHeight, opts).trim(),
        y: Math.min(...sortedItems.map((item) => item.y)),
        bottom: Math.max(...sortedItems.map((item) => item.y + item.height)),
        pageHeight: Number(page.height) || 0,
        pageIndex,
        hasColumnGap: hasWideColumnGap(sortedItems, medianHeight, opts)
      };
    })
    .filter((line) => line.text);
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

const hasWideColumnGap = (
  items: NormalizedTextItem[],
  medianHeight: number,
  opts: Required<PdfTextPostprocessOptions>
) => {
  return items.some((item, index) => {
    const next = items[index + 1];
    if (!next) return false;

    return next.x - (item.x + item.width) > medianHeight * opts.wideSpaceGapRatio;
  });
};

const mergeLines = (lines: string[], opts: Required<PdfTextPostprocessOptions>) => {
  const paragraphs: string[] = [];
  let current = '';
  let previousStandalone = false;

  const flush = () => {
    if (current) paragraphs.push(current);
    current = '';
  };

  for (const rawLine of lines) {
    const line = cleanupInlineNoise(normalizeText(rawLine, opts).trim(), opts);
    if (!line) continue;
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

/**
 * 识别跨页、同一边缘位置重复出现的页眉页脚行。
 *
 * 固定边缘比例只用于圈定候选区域；实际删除还要求文本跨页重复、覆盖足够页面且
 * 相对位置稳定。带明显列间距的结构化字段行会被保护，避免表格从页顶开始时误删。
 */
const findRepeatedEdgeLines = (
  pageLines: PositionedLine[][],
  opts: Required<PdfTextPostprocessOptions>
) => {
  const result = new Set<PositionedLine>();
  const pageCount = pageLines.length;
  if (pageCount < 2) return result;

  const groups = new Map<string, EdgeLine[]>();

  for (const line of pageLines.flat()) {
    const edge = getPageEdge(line, opts);
    if (!edge || !isRepeatedEdgeCandidate(line, opts)) continue;

    const key = `${edge}:${line.text}`;
    const group = groups.get(key) ?? [];
    group.push({ line, edge });
    groups.set(key, group);
  }

  const minimumRepeatedPages = Math.max(2, opts.repeatedNoiseMinCount);

  for (const group of groups.values()) {
    const repeatedPages = new Set(group.map(({ line }) => line.pageIndex)).size;
    if (repeatedPages < minimumRepeatedPages) continue;
    if (repeatedPages / pageCount < REPEATED_EDGE_MIN_PAGE_RATIO) continue;

    const positions = group.map(({ line, edge }) => getRelativeEdgePosition(line, edge));
    if (Math.max(...positions) - Math.min(...positions) > EDGE_POSITION_TOLERANCE_RATIO) continue;

    group.forEach(({ line }) => result.add(line));
  }

  return result;
};

const getPageEdge = (
  line: PositionedLine,
  opts: Required<PdfTextPostprocessOptions>
): PageEdge | undefined => {
  if (!line.pageHeight) return;

  const topCutoff = line.pageHeight * opts.headerRatio;
  const bottomCutoff = line.pageHeight * (1 - opts.footerRatio);

  // 文本框跨过正文边界时保留整行，避免只按文本起点误删临界内容。
  if (line.bottom <= topCutoff) return 'header';
  if (line.y >= bottomCutoff) return 'footer';
};

const isRepeatedEdgeCandidate = (
  line: PositionedLine,
  opts: Required<PdfTextPostprocessOptions>
) => {
  if (!line.text) return false;
  if (line.hasColumnGap) return false;
  if (PAGE_NO_RE.test(line.text)) return true;
  if (URL_NOISE_RE.test(line.text)) return true;
  if (line.text.length > opts.repeatedNoiseMaxLength) return false;
  return !SENTENCE_END_RE.test(line.text) && !PARAGRAPH_END_RE.test(line.text);
};

const getRelativeEdgePosition = (line: PositionedLine, edge: PageEdge) => {
  if (!line.pageHeight) return 0;
  return edge === 'header' ? line.y / line.pageHeight : line.bottom / line.pageHeight;
};

const cleanupInlineNoise = (line: string, opts: Required<PdfTextPostprocessOptions>) => {
  let text = line;

  for (const noise of opts.inlineNoisePhrases) {
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
