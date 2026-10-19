import { DOMParser } from '@xmldom/xmldom';
import { posix } from 'path';
import { type Entry, fromBuffer, type ZipFile } from 'yauzl';

const powerPointXmlPathRegex = /^ppt\/(?:notesSlides\/notesSlide|slides\/slide)\d+\.xml$/;
const powerPointSlidePathRegex = /^ppt\/slides\/slide\d+\.xml$/;
const powerPointNotesPathRegex = /^ppt\/notesSlides\/notesSlide\d+\.xml$/;
const powerPointSlideRelsPathRegex = /^ppt\/slides\/_rels\/slide\d+\.xml\.rels$/;
const relationshipsNamespace = 'http://schemas.openxmlformats.org/package/2006/relationships';
const notesSlideRelationshipTypes = new Set([
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide',
  'http://purl.oclc.org/ooxml/officeDocument/relationships/notesSlide'
]);
const maxPowerPointEntries = 10000;
const maxPowerPointXmlFileBytes = 10 * 1024 * 1024;
const maxPowerPointXmlBytes = 100 * 1024 * 1024;

const ELEMENT_NODE = 1;

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
      if (element.nodeName === 'a:t') {
        text += element.textContent ?? '';
      } else if (element.nodeName === 'a:br') {
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
 * 兼容 Transitional/Strict 关系和包内相对、绝对路径；无有效关系的备注沿用编号排序。
 */
const parsePowerPoint = async ({
  buffer,
  encoding
}: {
  buffer: Buffer;
  encoding: BufferEncoding;
}) => {
  const decodeXml = (data: Buffer) => {
    try {
      return data.toString(encoding);
    } catch {
      // 上游按整个压缩包探测编码时可能得到 Node.js 不支持的编码名。
      return data.toString('utf-8');
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
          result.push({
            path: entry.fileName,
            content: decodeXml(Buffer.concat(chunks, entryBytes))
          });
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
          powerPointSlideRelsPathRegex.test(entry.fileName)
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

  const parser = new DOMParser();
  const getPartNumber = (path: string) => {
    const match = path.match(/\d+/);
    return match ? parseInt(match[0]) : 0;
  };

  // 备注按创建顺序编号，不能与幻灯片编号直接配对；有效包内关系优先于编号回退。
  const slideOfNotes = new Map<string, number>();
  files
    .filter(({ path }) => powerPointSlideRelsPathRegex.test(path))
    .forEach(({ path, content }) => {
      const relationships = parser
        .parseFromString(content, 'text/xml')
        .getElementsByTagNameNS(relationshipsNamespace, 'Relationship');
      Array.from(relationships).forEach((relationship) => {
        const relationshipType = relationship.getAttribute('Type');
        const target = relationship.getAttribute('Target');
        if (
          !relationshipType ||
          !notesSlideRelationshipTypes.has(relationshipType) ||
          !target ||
          relationship.getAttribute('TargetMode') === 'External'
        ) {
          return;
        }

        // 两种目标都规范化为包内路径，再由固定备注目录校验拒绝越界目标。
        const notesPath = posix.normalize(
          target.startsWith('/') ? target.slice(1) : posix.join('ppt/slides', target)
        );
        if (powerPointNotesPathRegex.test(notesPath)) {
          slideOfNotes.set(notesPath, getPartNumber(path));
        }
      });
    });

  const getOrder = (path: string) => {
    if (!powerPointNotesPathRegex.test(path)) return { slide: getPartNumber(path), notes: 0 };
    return { slide: slideOfNotes.get(path) ?? getPartNumber(path), notes: 1 };
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
      const xmlParagraphNodesList = parser
        .parseFromString(content, 'text/xml')
        .getElementsByTagName('a:p');

      return Array.from(xmlParagraphNodesList)
        .filter((paragraphNode) => paragraphNode.getElementsByTagName('a:t').length != 0)
        .map((paragraphNode) => readParagraphText(paragraphNode))
        .join('\n');
    })
    .join('\n');
};

/**
 * 解析受支持的 Office 文件文本。
 * PPTX 归档按 entry 流式读取，只解压固定 OOXML 路径下且满足大小限制的普通 XML 文件。
 */
export const parseOffice = async ({
  buffer,
  encoding,
  extension
}: {
  buffer: Buffer;
  encoding: BufferEncoding;
  extension: string;
}) => {
  switch (extension) {
    case 'pptx':
      return parsePowerPoint({ buffer, encoding });
    default:
      return Promise.reject('只能读取 .pptx 文件');
  }
};
