import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { UserError } from '@fastgpt/global/common/error/utils';
import { type ReadRawTextByBuffer, type ReadFileResponse } from '../type';
import { getLogger, LogCategories } from '../../../common/logger';

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

const TITLE_SIZE_RATIO = 1.3;
const INDENT_THRESHOLD = 2.0;
const PAGE_NUM_Y_RATIO = 0.1;
const PAGE_NUM_SIZE_RATIO = 0.85;
const DEFAULT_FONT_SIZE = 10.0;
const MAX_PAGE_COUNT = 2000;
const PAGE_NUMBER_PATTERN = /^[-—–·]?\d{1,4}[-—–·]?$/;

type ParsedTextItem = {
  text: string;
  x: number;
  y: number;
  size: number;
};

type LayoutRow = {
  text: string;
  xStart: number;
  yPos: number;
  fontSize: number;
};

const localName = (name: string) => {
  const index = name.indexOf(':');
  return index === -1 ? name : name.slice(index + 1);
};

const attrValue = (element: Element, name: string) => {
  const { attributes } = element;
  if (!attributes) return '';
  for (let i = 0; i < attributes.length; i++) {
    const attr = attributes[i];
    if (localName(attr.name) === name) return attr.value;
  }
  return '';
};

const childElements = (node: Node): Element[] =>
  Array.from(node.childNodes).filter((child) => child.nodeType === ELEMENT_NODE) as Element[];

const findElements = (node: Node, name: string): Element[] => {
  const found: Element[] = [];
  const visit = (current: Node) => {
    childElements(current).forEach((element) => {
      if (localName(element.nodeName) === name) {
        found.push(element);
      } else {
        visit(element);
      }
    });
  };
  visit(node);
  return found;
};

const parseNumberAttr = (element: Element, name: string) => {
  const raw = attrValue(element, name);
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
};

const parsePageContentTextItems = (contentXml: string): ParsedTextItem[] => {
  const doc = new DOMParser().parseFromString(contentXml, 'text/xml');
  const items: ParsedTextItem[] = [];

  findElements(doc, 'TextObject').forEach((textObject) => {
    const boundary = attrValue(textObject, 'Boundary').split(/\s+/).filter(Boolean).map(Number);
    if (boundary.length < 2 || boundary.some((v) => !Number.isFinite(v))) return;

    const size = parseNumberAttr(textObject, 'Size') ?? DEFAULT_FONT_SIZE;

    childElements(textObject).forEach((child) => {
      if (localName(child.nodeName) !== 'TextCode') return;
      const text = Array.from(child.childNodes)
        .filter((node) => node.nodeType === TEXT_NODE)
        .map((node) => node.nodeValue ?? '')
        .join('');
      if (!text.trim()) return;

      items.push({
        text,
        x: boundary[0] + (parseNumberAttr(child, 'X') ?? 0),
        y: boundary[1] + (parseNumberAttr(child, 'Y') ?? 0),
        size
      });
    });
  });

  return items;
};

const analyzeTextItems = (textItems: ParsedTextItem[]): LayoutRow[] => {
  const yGroups = new Map<number, ParsedTextItem[]>();
  textItems.forEach((item) => {
    const yKey = Number(item.y.toFixed(1));
    const group = yGroups.get(yKey);
    if (group) {
      group.push(item);
    } else {
      yGroups.set(yKey, [item]);
    }
  });

  return Array.from(yGroups.keys())
    .sort((a, b) => a - b)
    .map((yPos) => {
      const lineItems = yGroups
        .get(yPos)!
        .slice()
        .sort((a, b) => a.x - b.x);
      return {
        text: lineItems
          .map((item) => item.text)
          .join('')
          .trim(),
        xStart: Math.min(...lineItems.map((item) => item.x)),
        yPos,
        fontSize: Math.max(...lineItems.map((item) => item.size))
      };
    });
};

const detectBaseFontSize = (fontSizes: number[]) => {
  if (!fontSizes.length) return DEFAULT_FONT_SIZE;

  const frequency = new Map<number, number>();
  fontSizes.forEach((size) => {
    frequency.set(size, (frequency.get(size) ?? 0) + 1);
  });
  // 稳定排序：相同频次时保持首次出现顺序，对齐 Python Counter.most_common 行为
  const ranked = Array.from(frequency.entries()).sort((a, b) => b[1] - a[1]);
  const maxSize = Math.min(...fontSizes);

  if (ranked.length >= 2 && ranked[0][0] === maxSize && ranked[0][1] > ranked[1][1] * 1.5) {
    return ranked[1][0];
  }

  return ranked[0][0];
};

const isPageNumberRow = (
  text: string,
  fontSize: number,
  baseFontSize: number,
  yPos: number,
  pageYRange: [number, number]
) => {
  const [yMin, yMax] = pageYRange;
  const pageHeight = yMax - yMin;
  if (pageHeight <= 0) return false;

  const yRatio = (yPos - yMin) / pageHeight;
  if (!(yRatio < PAGE_NUM_Y_RATIO || yRatio > 1.0 - PAGE_NUM_Y_RATIO)) return false;

  if (fontSize > baseFontSize * PAGE_NUM_SIZE_RATIO) return false;

  return PAGE_NUMBER_PATTERN.test(text);
};

const median = (values: number[]) => {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const buildPageMarkdown = (rows: LayoutRow[], baseFontSize: number) => {
  const contentRows = rows.filter((row) => row.text);
  if (!contentRows.length) return '';

  const normalXs = contentRows
    .filter((row) => row.fontSize < baseFontSize * TITLE_SIZE_RATIO)
    .map((row) => row.xStart);
  const baseX = normalXs.length
    ? median(normalXs)
    : Math.min(...contentRows.map((row) => row.xStart));

  const pageYRange: [number, number] = [
    Math.min(...contentRows.map((row) => row.yPos)),
    Math.max(...contentRows.map((row) => row.yPos))
  ];

  const parts: string[] = [];
  let prevWasTitle = false;

  contentRows.forEach((row) => {
    const text = row.text;
    if (isPageNumberRow(text, row.fontSize, baseFontSize, row.yPos, pageYRange)) return;

    if (row.fontSize >= baseFontSize * TITLE_SIZE_RATIO) {
      if (parts.length && !prevWasTitle) {
        parts.push('\n\n');
      }
      parts.push(`# ${text}\n`);
      prevWasTitle = true;
      return;
    }

    prevWasTitle = false;

    const isParaStart = row.xStart - baseX > INDENT_THRESHOLD;
    if (isParaStart && parts.length) {
      parts.push('\n\n');
    }
    parts.push(`${text}\n`);
  });

  return parts.join('').replace(/\s+$/, '');
};

const resolveDocumentPath = async (zip: JSZip) => {
  const ofdFile = zip.file('OFD.xml');
  if (ofdFile) {
    const ofdXml = await ofdFile.async('string');
    const doc = new DOMParser().parseFromString(ofdXml, 'text/xml');
    const docRoot = findElements(doc, 'DocRoot')[0];
    const docRootPath = docRoot?.textContent?.trim();
    if (docRootPath) {
      return docRootPath.replace(/^\//, '');
    }
  }

  // 无 OFD.xml 或缺少 DocRoot 时，尝试约定路径
  const fallback = Object.keys(zip.files).find((path) => /^Doc_\d+\/Document\.xml$/.test(path));
  if (!fallback) {
    throw new UserError(CommonErrEnum.invalidParseFile);
  }
  return fallback;
};

const parseDocumentPages = async (zip: JSZip, documentPath: string) => {
  const documentFile = zip.file(documentPath);
  if (!documentFile) {
    throw new UserError(CommonErrEnum.invalidParseFile);
  }

  const docDir = documentPath.includes('/')
    ? documentPath.slice(0, documentPath.lastIndexOf('/'))
    : '';
  const documentXml = await documentFile.async('string');
  const doc = new DOMParser().parseFromString(documentXml, 'text/xml');

  const encrypted = findElements(doc, 'EncryptedFile');
  if (encrypted.length) {
    throw new UserError(CommonErrEnum.invalidParseFile);
  }

  const pages = findElements(doc, 'Pages')[0];
  if (!pages) return [];

  return childElements(pages)
    .filter((page) => localName(page.nodeName) === 'Page')
    .map((page, index) => {
      const baseLoc = attrValue(page, 'BaseLoc');
      if (!baseLoc) return `${docDir}/Pages/Page_${index}/Content.xml`;
      return baseLoc.startsWith('/') ? baseLoc.slice(1) : `${docDir}/${baseLoc}`;
    });
};

export const readOfdFile = async ({ buffer }: ReadRawTextByBuffer): Promise<ReadFileResponse> => {
  const logger = getLogger(LogCategories.INFRA.WORKER);

  try {
    const zip = await JSZip.loadAsync(buffer);
    const documentPath = await resolveDocumentPath(zip);
    const pagePaths = await parseDocumentPages(zip, documentPath);

    if (pagePaths.length > MAX_PAGE_COUNT) {
      logger.warn('OFD page count exceeds limit, truncating', {
        pageCount: pagePaths.length,
        maxPageCount: MAX_PAGE_COUNT
      });
    }
    const parsedPagePaths = pagePaths.slice(0, MAX_PAGE_COUNT);

    const pageRows: LayoutRow[][] = [];
    const allFontSizes: number[] = [];

    for (const pagePath of parsedPagePaths) {
      const contentFile = zip.file(pagePath);
      if (!contentFile) continue;

      const contentXml = await contentFile.async('string');
      const rows = analyzeTextItems(parsePageContentTextItems(contentXml));
      pageRows.push(rows);
      allFontSizes.push(...rows.filter((row) => row.text).map((row) => row.fontSize));
    }

    const baseFontSize = detectBaseFontSize(allFontSizes);
    const pageMarkdowns = pageRows
      .map((rows) => buildPageMarkdown(rows, baseFontSize))
      .filter(Boolean);

    return {
      rawText: pageMarkdowns.join('\n\n')
    };
  } catch (error) {
    logger.error('Failed to parse OFD file', { error });
    if (error instanceof UserError) throw error;
    // 结构类失败（缺 OFD.xml/Document.xml、加密）已在上方映射 invalidParseFile；
    // 此处兜底未知失败，对齐 AC-1138030-061 的通用「文档解析失败」码
    throw new UserError(CommonErrEnum.pdfParseFailed);
  }
};
