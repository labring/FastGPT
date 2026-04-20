import { getNanoid } from '@fastgpt/global/common/string/tools';
import fs from 'fs';
import path from 'path';
import decompress from 'decompress';
import { DOMParser } from '@xmldom/xmldom';
import { clearDirFiles } from '../../common/file/utils';
import { UserError } from '@fastgpt/global/common/error/utils';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { getLogger, LogCategories } from '../../common/logger';

const DEFAULTDECOMPRESSSUBLOCATION = '/tmp';
const logger = getLogger(LogCategories.INFRA.WORKER);

function getNewFileName(ext: string) {
  return `${DEFAULTDECOMPRESSSUBLOCATION}/${getNanoid()}.${ext}`;
}

const parseString = (xml: string) => {
  let parser = new DOMParser();
  return parser.parseFromString(xml, 'text/xml');
};

const parsePowerPoint = async ({
  filepath,
  decompressPath,
  encoding
}: {
  filepath: string;
  decompressPath: string;
  encoding: BufferEncoding;
}) => {
  // Files regex that hold our content of interest
  const allFilesRegex = /ppt\/(notesSlides|slides)\/(notesSlide|slide)\d+.xml/g;
  const slidesRegex = /ppt\/slides\/slide\d+.xml/g;

  /** The decompress location which contains the filename in it */

  const files = await decompress(filepath, decompressPath, {
    filter: (x) => !!x.path.match(allFilesRegex)
  });

  // Verify if atleast the slides xml files exist in the extracted files list.
  if (
    files.length == 0 ||
    !files.map((file) => file.path).some((filename) => filename.match(slidesRegex))
  ) {
    return Promise.reject(new UserError(CommonErrEnum.pptxParseFailed));
  }

  // Sort files by slide number to ensure correct order
  const sortedFiles = files.sort((a, b) => {
    const getSlideNumber = (path: string) => {
      const match = path.match(/\d+/);
      return match ? parseInt(match[0]) : 0;
    };
    return getSlideNumber(a.path) - getSlideNumber(b.path);
  });

  // Returning an array of all the xml contents read using fs.readFileSync
  const xmlContentArray = await Promise.all(
    sortedFiles.map(async (file) => {
      // 安全的路径拼接：防止路径遍历攻击
      const safePath = path.join(decompressPath, file.path);
      // 验证最终路径在目标目录内
      const normalizedSafePath = path.normalize(safePath);
      const normalizedDecompressPath = path.normalize(decompressPath);
      if (!normalizedSafePath.startsWith(normalizedDecompressPath + path.sep)) {
        logger.error('Potential path traversal attack detected', {
          decompressPath,
          filePath: file.path,
          resolvedPath: normalizedSafePath
        });
        throw new UserError(CommonErrEnum.pptxParseFailed);
      }

      try {
        return await fs.promises.readFile(safePath, encoding);
      } catch (err) {
        return await fs.promises.readFile(safePath, 'utf-8');
      }
    })
  );

  let responseArr: string[] = [];

  xmlContentArray.forEach((xmlContent) => {
    /** Find text nodes with a:p tags */
    const xmlParagraphNodesList = parseString(xmlContent).getElementsByTagName('a:p');

    /** Store all the text content to respond */
    responseArr.push(
      Array.from(xmlParagraphNodesList)
        // Filter paragraph nodes than do not have any text nodes which are identifiable by a:t tag
        .filter((paragraphNode) => paragraphNode.getElementsByTagName('a:t').length != 0)
        .map((paragraphNode) => {
          /** Find text nodes with a:t tags */
          const xmlTextNodeList = paragraphNode.getElementsByTagName('a:t');
          return Array.from(xmlTextNodeList)
            .filter((textNode) => textNode.childNodes[0] && textNode.childNodes[0].nodeValue)
            .map((textNode) => textNode.childNodes[0].nodeValue)
            .join('');
        })
        .join('\n')
    );
  });

  return responseArr.join('\n');
};

export const parseOffice = async ({
  buffer,
  encoding,
  extension
}: {
  buffer: Buffer;
  encoding: BufferEncoding;
  extension: string;
}) => {
  // Prepare file for processing
  // create temp file subdirectory if it does not exist
  if (!fs.existsSync(DEFAULTDECOMPRESSSUBLOCATION)) {
    fs.mkdirSync(DEFAULTDECOMPRESSSUBLOCATION, { recursive: true });
  }

  // temp file name
  const filepath = getNewFileName(extension);
  const decompressPath = `${DEFAULTDECOMPRESSSUBLOCATION}/${getNanoid()}`;
  //   const decompressPath = `${DEFAULTDECOMPRESSSUBLOCATION}/test`;

  // write new file
  try {
    fs.writeFileSync(filepath, buffer, {
      encoding
    });
  } catch (err) {
    fs.writeFileSync(filepath, buffer, {
      encoding: 'utf-8'
    });
  }

  let text: string = '';
  try {
    switch (extension) {
      case 'pptx':
        text = await parsePowerPoint({ filepath, decompressPath, encoding });
        break;
      default:
        throw new UserError(CommonErrEnum.pptxParseFailed);
    }
  } catch (error) {
    if (error instanceof UserError) throw error;
    logger.error(`Load ppt error`, { error });
    throw new UserError(CommonErrEnum.pptxParseFailed);
  } finally {
    try {
      fs.unlinkSync(filepath);
    } catch {
      // ignore
    }
    try {
      clearDirFiles(decompressPath);
    } catch (error) {
      logger.error('Failed to parse pptx file', { extension, error });
    }
  }

  return text;
};
