import { DOMParser } from '@xmldom/xmldom';
import { type Entry, fromBuffer, type ZipFile } from 'yauzl';
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

// 资源边界初始值与 parseOffice.ts 的 PPTX 限制对齐，可按真实厂商样本再校准。
const MAX_ZIP_ENTRIES = 10000;
const MAX_XML_FILE_BYTES = 10 * 1024 * 1024;
const MAX_XML_TOTAL_BYTES = 100 * 1024 * 1024;

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

const parsePageContentTextItems = (doc: Document): ParsedTextItem[] => {
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

const detectBaseFontSize = (pagesRows: LayoutRow[][]) => {
  const rows = pagesRows.flat().filter((row) => row.text);
  if (!rows.length) return DEFAULT_FONT_SIZE;

  const frequency = new Map<number, number>();
  rows.forEach((row) => {
    frequency.set(row.fontSize, (frequency.get(row.fontSize) ?? 0) + 1);
  });
  // 稳定排序：相同频次时保持首次出现顺序，对齐 Python Counter.most_common 行为
  const ranked = Array.from(frequency.entries()).sort((a, b) => b[1] - a[1]);
  const candidate = ranked[0][0];

  // 仅当最小字号候选行确实呈现页码特征（页顶/底边距 + 纯数字）时才视为页码字体并降级基准；
  // 否则「正文是最小且最频繁字号、文档无页码」的正常文档会把标题字号误判为基准。
  if (ranked.length >= 2 && candidate === Math.min(...rows.map((row) => row.fontSize))) {
    let candidateRowCount = 0;
    let pageNumberRowCount = 0;
    pagesRows.forEach((pageContentRows) => {
      const textRows = pageContentRows.filter((row) => row.text);
      if (!textRows.length) return;
      const pageYRange: [number, number] = [
        Math.min(...textRows.map((row) => row.yPos)),
        Math.max(...textRows.map((row) => row.yPos))
      ];
      textRows.forEach((row) => {
        if (row.fontSize !== candidate) return;
        candidateRowCount += 1;
        if (isPageNumberPositionRow(row.text, row.yPos, pageYRange)) pageNumberRowCount += 1;
      });
    });
    if (pageNumberRowCount > 0 && pageNumberRowCount * 2 >= candidateRowCount) {
      return ranked[1][0];
    }
  }

  return candidate;
};

const isPageNumberPositionRow = (text: string, yPos: number, pageYRange: [number, number]) => {
  const [yMin, yMax] = pageYRange;
  const pageHeight = yMax - yMin;
  if (pageHeight <= 0) return false;

  const yRatio = (yPos - yMin) / pageHeight;
  if (!(yRatio < PAGE_NUM_Y_RATIO || yRatio > 1.0 - PAGE_NUM_Y_RATIO)) return false;

  return PAGE_NUMBER_PATTERN.test(text);
};

const isPageNumberRow = (
  text: string,
  fontSize: number,
  baseFontSize: number,
  yPos: number,
  pageYRange: [number, number]
) =>
  fontSize <= baseFontSize * PAGE_NUM_SIZE_RATIO && isPageNumberPositionRow(text, yPos, pageYRange);

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

const openZip = (buffer: Buffer) =>
  new Promise<ZipFile>((resolve, reject) => {
    fromBuffer(
      buffer,
      {
        lazyEntries: true,
        decodeStrings: true,
        validateEntrySizes: true,
        strictFileNames: true
      },
      (error, zipFile) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(zipFile);
      }
    );
  });

// 只收集 entry 元数据（文件名 + Entry 句柄），内容按需通过 openReadStream 流式读取，
// 避免 JSZip.loadAsync 把整个压缩包解压到内存。
const collectEntries = (zip: ZipFile) =>
  new Promise<Map<string, Entry>>((resolve, reject) => {
    const entries = new Map<string, Entry>();
    let settled = false;

    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      zip.close();
      reject(error);
    };

    zip.once('error', fail);
    zip.on('entry', (entry: Entry) => {
      if (settled) return;
      if (entries.size >= MAX_ZIP_ENTRIES) {
        fail(new UserError(CommonErrEnum.officeConversionFailed));
        return;
      }
      if (!entry.fileName.endsWith('/')) {
        entries.set(entry.fileName, entry);
      }
      zip.readEntry();
    });
    zip.once('end', () => {
      if (settled) return;
      settled = true;
      resolve(entries);
    });

    if (zip.entryCount > MAX_ZIP_ENTRIES) {
      fail(new UserError(CommonErrEnum.officeConversionFailed));
      return;
    }
    zip.readEntry();
  });

// uncompressedSize 只作前置检查（可被伪造），真实解压字节数在 data chunk 中累计，
// 超限立即销毁 stream 中止解压，防 ZIP bomb。
const readEntryText = (zip: ZipFile, entry: Entry, totalBytes: { value: number }) =>
  new Promise<string>((resolve, reject) => {
    if (
      entry.uncompressedSize > MAX_XML_FILE_BYTES ||
      totalBytes.value + entry.uncompressedSize > MAX_XML_TOTAL_BYTES
    ) {
      reject(new UserError(CommonErrEnum.officeConversionFailed));
      return;
    }

    zip.openReadStream(entry, (error, stream) => {
      if (error) {
        reject(error);
        return;
      }

      const chunks: Buffer[] = [];
      let entryBytes = 0;
      let settled = false;
      const fail = (err: unknown) => {
        if (settled) return;
        settled = true;
        reject(err);
      };

      stream.on('data', (chunk: Buffer) => {
        entryBytes += chunk.length;
        totalBytes.value += chunk.length;
        if (entryBytes > MAX_XML_FILE_BYTES || totalBytes.value > MAX_XML_TOTAL_BYTES) {
          stream.destroy(new UserError(CommonErrEnum.officeConversionFailed));
          return;
        }
        chunks.push(chunk);
      });
      stream.once('error', fail);
      stream.once('end', () => {
        if (settled) return;
        settled = true;
        resolve(Buffer.concat(chunks, entryBytes).toString('utf-8'));
      });
    });
  });

// 厂商 OFD 的 XML 可能存在未闭合标签等致命缺陷；xmldom 默认只告警并继续，
// 这里按严格模式拦截，损坏文件统一落 invalidParseFile 而非产出空文本。
const parseOfdXml = (xml: string) => {
  try {
    return new DOMParser({
      errorHandler: {
        error: (message: string) => {
          throw new Error(message);
        },
        fatalError: (message: string) => {
          throw new Error(message);
        }
      }
    }).parseFromString(xml, 'text/xml');
  } catch {
    throw new UserError(CommonErrEnum.invalidParseFile);
  }
};

const resolveDocumentPath = async (
  zip: ZipFile,
  entries: Map<string, Entry>,
  totalBytes: { value: number }
) => {
  const ofdEntry = entries.get('OFD.xml');
  if (ofdEntry) {
    const ofdXml = await readEntryText(zip, ofdEntry, totalBytes);
    const doc = parseOfdXml(ofdXml);
    const docRoot = findElements(doc, 'DocRoot')[0];
    const docRootPath = docRoot?.textContent?.trim();
    if (docRootPath) {
      return docRootPath.replace(/^\//, '');
    }
  }

  // 无 OFD.xml 或缺少 DocRoot 时，尝试约定路径
  const fallback = Array.from(entries.keys()).find((path) => /^Doc_\d+\/Document\.xml$/.test(path));
  if (!fallback) {
    throw new UserError(CommonErrEnum.invalidParseFile);
  }
  return fallback;
};

const parseDocumentPages = (documentXml: string, documentPath: string) => {
  const doc = parseOfdXml(documentXml);

  const encrypted = findElements(doc, 'EncryptedFile');
  if (encrypted.length) {
    throw new UserError(CommonErrEnum.invalidParseFile);
  }

  const pages = findElements(doc, 'Pages')[0];
  // 缺失声明页面资源的 OFD 视为损坏文件，拒绝产出空/不完整知识库内容
  const pageElements = pages
    ? childElements(pages).filter((page) => localName(page.nodeName) === 'Page')
    : [];
  if (!pageElements.length) {
    throw new UserError(CommonErrEnum.invalidParseFile);
  }

  const docDir = documentPath.includes('/')
    ? documentPath.slice(0, documentPath.lastIndexOf('/'))
    : '';
  return pageElements.map((page, index) => {
    const baseLoc = attrValue(page, 'BaseLoc');
    if (!baseLoc) return `${docDir}/Pages/Page_${index}/Content.xml`;
    return baseLoc.startsWith('/') ? baseLoc.slice(1) : `${docDir}/${baseLoc}`;
  });
};

export const readOfdFile = async ({ buffer }: ReadRawTextByBuffer): Promise<ReadFileResponse> => {
  const logger = getLogger(LogCategories.INFRA.WORKER);
  let zip: ZipFile | undefined;
  let zipClosed = false;
  const closeZip = () => {
    if (zip && !zipClosed) {
      zipClosed = true;
      zip.close();
    }
  };

  try {
    zip = await openZip(buffer);
    const entries = await collectEntries(zip);
    const totalBytes = { value: 0 };

    const documentPath = await resolveDocumentPath(zip, entries, totalBytes);
    const documentEntry = entries.get(documentPath);
    if (!documentEntry) {
      throw new UserError(CommonErrEnum.invalidParseFile);
    }
    const documentXml = await readEntryText(zip, documentEntry, totalBytes);
    const pagePaths = parseDocumentPages(documentXml, documentPath);

    // 超限直接拒绝，避免静默截断导致不完整的知识库数据
    if (pagePaths.length > MAX_PAGE_COUNT) {
      logger.warn('OFD page count exceeds limit, rejecting', {
        pageCount: pagePaths.length,
        maxPageCount: MAX_PAGE_COUNT
      });
      throw new UserError(CommonErrEnum.officeConversionFailed);
    }

    const pageRows: LayoutRow[][] = [];
    for (const pagePath of pagePaths) {
      const contentEntry = entries.get(pagePath);
      if (!contentEntry) {
        throw new UserError(CommonErrEnum.invalidParseFile);
      }
      const contentXml = await readEntryText(zip, contentEntry, totalBytes);
      pageRows.push(analyzeTextItems(parsePageContentTextItems(parseOfdXml(contentXml))));
    }
    closeZip();

    const baseFontSize = detectBaseFontSize(pageRows);
    const pageMarkdowns = pageRows
      .map((rows) => buildPageMarkdown(rows, baseFontSize))
      .filter(Boolean);

    return {
      rawText: pageMarkdowns.join('\n\n')
    };
  } catch (error) {
    logger.error('Failed to parse OFD file', { error });
    if (error instanceof UserError) throw error;
    // 结构类失败（缺 OFD.xml/Document.xml/Content.xml、加密、XML 损坏）与资源超限
    // 已在上方映射诊断码；此处兜底未知失败为通用「文档解析失败」码
    throw new UserError(CommonErrEnum.pdfParseFailed);
  } finally {
    closeZip();
  }
};
