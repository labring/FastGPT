import { DOMParser } from '@xmldom/xmldom';
import { posix } from 'path';
import { type Entry, fromBuffer, type ZipFile } from 'yauzl';

const powerPointXmlPathRegex = /^ppt\/(?:notesSlides\/notesSlide|slides\/slide)\d+\.xml$/;
const powerPointSlidePathRegex = /^ppt\/slides\/slide\d+\.xml$/;
const powerPointNotesPathRegex = /^ppt\/notesSlides\/notesSlide\d+\.xml$/;
const powerPointSlideRelsPathRegex = /^ppt\/slides\/_rels\/slide\d+\.xml\.rels$/;
const presentationPath = 'ppt/presentation.xml';
const presentationRelsPath = 'ppt/_rels/presentation.xml.rels';
const relationshipsNamespace = 'http://schemas.openxmlformats.org/package/2006/relationships';
const officeRelationshipsNamespaces = [
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  'http://purl.oclc.org/ooxml/officeDocument/relationships'
];
const notesSlideRelationshipTypes = new Set(
  officeRelationshipsNamespaces.map((namespace) => `${namespace}/notesSlide`)
);
const slideRelationshipTypes = new Set(
  officeRelationshipsNamespaces.map((namespace) => `${namespace}/slide`)
);
const presentationNamespaces = new Set([
  'http://schemas.openxmlformats.org/presentationml/2006/main',
  'http://purl.oclc.org/ooxml/presentationml/main'
]);
const drawingNamespaces = new Set([
  'http://schemas.openxmlformats.org/drawingml/2006/main',
  'http://purl.oclc.org/ooxml/drawingml/main'
]);
const maxPowerPointEntries = 10000;
const maxPowerPointXmlFileBytes = 10 * 1024 * 1024;
const maxPowerPointXmlBytes = 100 * 1024 * 1024;

const ELEMENT_NODE = 1;

/** 通过命名空间识别 DrawingML 元素，兼容自定义前缀、默认命名空间与 Strict 格式。 */
const isDrawingElement = (element: Element, name: string) =>
  element.localName === name && drawingNamespaces.has(element.namespaceURI ?? '');

/**
 * Read a paragraph in document order.
 *
 * `a:br` is a soft line break (Shift+Enter) inside one paragraph. Collecting
 * only `a:t` drops it and glues the text on either side into a single word.
 */
const readParagraphText = (paragraphNode: Element) => {
  let text = '';

  const visit = (node: Node) => {
    Array.from(node.childNodes).forEach((child) => {
      if (child.nodeType !== ELEMENT_NODE) return;

      const element = child as Element;
      if (isDrawingElement(element, 't')) {
        text += element.textContent ?? '';
      } else if (isDrawingElement(element, 'br')) {
        text += '\n';
      } else {
        visit(element);
      }
    });
  };

  visit(paragraphNode);
  return text;
};

/**
 * 提取 PPTX 正文与备注，通过幻灯片关系确定备注归属。
 * XML 按各自 BOM 解码，页序优先使用 presentation 声明；缺少元数据时保留编号回退。
 */
const parsePowerPoint = async (buffer: Buffer) => {
  /** OPC 的 XML 部件只使用 UTF-8 或带 BOM 的 UTF-16，不能复用压缩包探测到的编码。 */
  const decodeXml = (data: Buffer) => {
    try {
      const encoding = (() => {
        if (data[0] === 0xff && data[1] === 0xfe) return 'utf-16le';
        if (data[0] === 0xfe && data[1] === 0xff) return 'utf-16be';
        return 'utf-8';
      })();
      return new TextDecoder(encoding, { fatal: true }).decode(data);
    } catch {
      throw new Error('解析 PPT 失败');
    }
  };

  const zip = await new Promise<ZipFile>((resolve, reject) => {
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

  const files = await new Promise<{ path: string; content: string }[]>((resolve, reject) => {
    const result: { path: string; content: string }[] = [];
    let entriesRead = 0;
    let totalXmlBytes = 0;
    let settled = false;

    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      zip.close();
      reject(error);
    };

    const readEntryContent = (entry: Entry) => {
      zip.openReadStream(entry, (error, stream) => {
        if (error) {
          fail(error);
          return;
        }

        const chunks: Buffer[] = [];
        let entryBytes = 0;
        stream.on('data', (chunk: Buffer) => {
          entryBytes += chunk.length;
          totalXmlBytes += chunk.length;

          // 元数据可被伪造，必须按流中真实输出字节中止解压。
          if (entryBytes > maxPowerPointXmlFileBytes || totalXmlBytes > maxPowerPointXmlBytes) {
            stream.destroy(new Error('解析 PPT 失败'));
            return;
          }
          chunks.push(chunk);
        });
        stream.once('error', fail);
        stream.once('end', () => {
          if (settled) return;
          try {
            result.push({
              path: entry.fileName,
              content: decodeXml(Buffer.concat(chunks, entryBytes))
            });
          } catch (error) {
            fail(error);
            return;
          }
          zip.readEntry();
        });
      });
    };

    zip.once('error', fail);
    zip.on('entry', (entry: Entry) => {
      entriesRead += 1;
      if (entriesRead > maxPowerPointEntries) {
        fail('解析 PPT 失败');
        return;
      }

      const createdOnUnix = entry.versionMadeBy >>> 8 === 3;
      const unixMode = entry.externalFileAttributes >>> 16;
      const unixFileType = unixMode & 0xf000;
      const isRegularFile =
        !entry.fileName.endsWith('/') &&
        (!createdOnUnix || unixFileType === 0 || unixFileType === 0x8000);

      // yauzl 在 entry 事件前校验原始路径；这里只读取锚定 OOXML 路径下的普通文件。
      if (
        !isRegularFile ||
        !(
          powerPointXmlPathRegex.test(entry.fileName) ||
          powerPointSlideRelsPathRegex.test(entry.fileName) ||
          entry.fileName === presentationPath ||
          entry.fileName === presentationRelsPath
        )
      ) {
        zip.readEntry();
        return;
      }

      if (
        entry.uncompressedSize > maxPowerPointXmlFileBytes ||
        totalXmlBytes + entry.uncompressedSize > maxPowerPointXmlBytes
      ) {
        fail('解析 PPT 失败');
        return;
      }
      readEntryContent(entry);
    });
    zip.once('end', () => {
      if (settled) return;
      settled = true;
      if (!result.some((file) => powerPointSlidePathRegex.test(file.path))) {
        reject('解析 PPT 失败');
        return;
      }
      resolve(result);
    });

    if (zip.entryCount > maxPowerPointEntries) {
      fail('解析 PPT 失败');
      return;
    }
    zip.readEntry();
  });

  const filesByPath = new Map(files.map((file) => [file.path, file]));
  const parser = new DOMParser({
    errorHandler: () => {
      throw new Error('解析 PPT 失败');
    }
  });

  /** 损坏 XML 必须返回明确解析错误，避免 xmldom 自动修补后静默产出不完整文本。 */
  const parseXml = (content: string) => {
    try {
      const document = parser.parseFromString(content, 'text/xml');
      if (!document?.documentElement) throw new Error('解析 PPT 失败');
      return document;
    } catch {
      throw new Error('解析 PPT 失败');
    }
  };

  const getPartNumber = (path: string) => {
    const match = path.match(/\d+/);
    return match ? parseInt(match[0]) : 0;
  };

  /** 读取包内关系并解析目标 URI；外部目标不会被解释成本地部件。 */
  const readRelationships = ({ sourcePath, content }: { sourcePath: string; content: string }) =>
    Array.from(
      parseXml(content).getElementsByTagNameNS(relationshipsNamespace, 'Relationship')
    ).flatMap((relationship) => {
      const type = relationship.getAttribute('Type');
      const target = relationship.getAttribute('Target');
      if (!type || !target || relationship.getAttribute('TargetMode') === 'External') return [];

      return [
        {
          id: relationship.getAttribute('Id') ?? '',
          type,
          target: posix.normalize(
            target.startsWith('/') ? target.slice(1) : posix.join(posix.dirname(sourcePath), target)
          )
        }
      ];
    });

  // 幻灯片编号不代表显示页序；通过 presentation 的 r:id 按声明顺序定位实际部件。
  const slideOrder = (() => {
    const presentation = filesByPath.get(presentationPath);
    const presentationRels = filesByPath.get(presentationRelsPath);
    if (!presentation || !presentationRels) return new Map<string, number>();

    const slideTargets = new Map(
      readRelationships({ sourcePath: presentationPath, content: presentationRels.content })
        .filter(
          ({ type, target }) =>
            slideRelationshipTypes.has(type) && powerPointSlidePathRegex.test(target)
        )
        .map(({ id, target }) => [id, target])
    );
    const orderedPaths = Array.from(
      parseXml(presentation.content).getElementsByTagNameNS('*', 'sldId')
    )
      .filter((element) => presentationNamespaces.has(element.namespaceURI ?? ''))
      .flatMap((element) => {
        const id = officeRelationshipsNamespaces
          .map((namespace) => element.getAttributeNS(namespace, 'id'))
          .find(Boolean);
        const target = id ? slideTargets.get(id) : undefined;
        return target && filesByPath.has(target) ? [target] : [];
      });
    if (!orderedPaths.length) return new Map<string, number>();

    // 不丢弃旧解析器会读取的未列出部件，按编号追加到已知页序之后。
    const fallbackPaths = files
      .filter(({ path }) => powerPointSlidePathRegex.test(path))
      .map(({ path }) => path)
      .sort((a, b) => getPartNumber(a) - getPartNumber(b));
    return new Map(
      Array.from(new Set([...orderedPaths, ...fallbackPaths])).map((path, index) => [path, index])
    );
  })();

  // 备注归属保存完整部件路径，避免把来源身份与页序混为同一个数字。
  const slideOfNotes = new Map<string, string>();
  files
    .filter(({ path }) => powerPointSlideRelsPathRegex.test(path))
    .forEach(({ path, content }) => {
      const sourcePath = path.replace('/_rels/', '/').replace(/\.rels$/, '');
      // 孤立关系不能覆盖有效来源，也无需解析其可能损坏的 XML。
      if (!filesByPath.has(sourcePath)) return;

      readRelationships({ sourcePath, content }).forEach(({ type, target }) => {
        if (
          notesSlideRelationshipTypes.has(type) &&
          powerPointNotesPathRegex.test(target) &&
          filesByPath.has(target)
        ) {
          slideOfNotes.set(target, sourcePath);
        }
      });
    });

  const getOrder = (path: string) => {
    const notes = powerPointNotesPathRegex.test(path);
    const sourcePath = notes
      ? (slideOfNotes.get(path) ?? `ppt/slides/slide${getPartNumber(path)}.xml`)
      : path;
    const slide = slideOrder.size
      ? (slideOrder.get(sourcePath) ?? slideOrder.size + getPartNumber(sourcePath))
      : getPartNumber(sourcePath);
    return { slide, notes: notes ? 1 : 0 };
  };
  const sortedFiles = files
    .filter(({ path }) => powerPointXmlPathRegex.test(path))
    .sort((a, b) => {
      const orderA = getOrder(a.path);
      const orderB = getOrder(b.path);
      return orderA.slide - orderB.slide || orderA.notes - orderB.notes;
    });

  return sortedFiles
    .map(({ content }) => {
      const xmlParagraphNodesList = parseXml(content).getElementsByTagNameNS('*', 'p');

      return Array.from(xmlParagraphNodesList)
        .filter(
          (paragraphNode) =>
            isDrawingElement(paragraphNode, 'p') &&
            Array.from(paragraphNode.getElementsByTagNameNS('*', 't')).some((element) =>
              isDrawingElement(element, 't')
            )
        )
        .map((paragraphNode) => readParagraphText(paragraphNode))
        .join('\n');
    })
    .join('\n');
};

/**
 * 解析受支持的 Office 文件文本。
 * PPTX 归档按 entry 流式读取，只解压固定 OOXML 路径下且满足大小限制的普通 XML 文件。
 * encoding 参数保留以兼容调用方，XML 按部件自身的编码解析。
 */
export const parseOffice = async ({
  buffer,
  extension
}: {
  buffer: Buffer;
  encoding: BufferEncoding;
  extension: string;
}) => {
  switch (extension) {
    case 'pptx':
      return parsePowerPoint(buffer);
    default:
      return Promise.reject('只能读取 .pptx 文件');
  }
};
