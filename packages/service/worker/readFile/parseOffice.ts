import { DOMParser } from '@xmldom/xmldom';
import { type Entry, fromBuffer, type ZipFile } from 'yauzl';

const powerPointXmlPathRegex = /^ppt\/(?:notesSlides\/notesSlide|slides\/slide)\d+\.xml$/;
const powerPointSlidePathRegex = /^ppt\/slides\/slide\d+\.xml$/;
const maxPowerPointEntries = 10000;
const maxPowerPointXmlFileBytes = 10 * 1024 * 1024;
const maxPowerPointXmlBytes = 100 * 1024 * 1024;

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
      if (!isRegularFile || !powerPointXmlPathRegex.test(entry.fileName)) {
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

  const sortedFiles = files.sort((a, b) => {
    const getSlideNumber = (path: string) => {
      const match = path.match(/\d+/);
      return match ? parseInt(match[0]) : 0;
    };
    return getSlideNumber(a.path) - getSlideNumber(b.path);
  });
  const parser = new DOMParser();

  return sortedFiles
    .map(({ content }) => {
      const xmlParagraphNodesList = parser
        .parseFromString(content, 'text/xml')
        .getElementsByTagName('a:p');

      return Array.from(xmlParagraphNodesList)
        .filter((paragraphNode) => paragraphNode.getElementsByTagName('a:t').length != 0)
        .map((paragraphNode) => {
          const xmlTextNodeList = paragraphNode.getElementsByTagName('a:t');
          return Array.from(xmlTextNodeList)
            .filter((textNode) => textNode.childNodes[0] && textNode.childNodes[0].nodeValue)
            .map((textNode) => textNode.childNodes[0].nodeValue)
            .join('');
        })
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
