import mammoth, { images } from 'mammoth';
import { type ReadRawTextByBuffer, type ReadFileResponse, type UploadFileHandler } from '../type';
import { html2md } from '../../htmlStr2Md/utils';
import { getLogger, LogCategories } from '../../../common/logger';
import { resolveMimeExtension } from '../../../common/s3/utils/mime';

/**
 * read docx to markdown
 */
export const readDocsFile = async (
  { buffer }: ReadRawTextByBuffer,
  options: {
    uploadFile?: UploadFileHandler;
  } = {}
): Promise<ReadFileResponse> => {
  const logger = getLogger(LogCategories.INFRA.WORKER);
  try {
    const { value: html } = await mammoth.convertToHtml(
      {
        buffer
      },
      {
        ignoreEmptyParagraphs: false,
        convertImage: images.imgElement(async (image) => {
          const mime = image.contentType;
          const name = `${crypto.randomUUID()}${resolveMimeExtension(mime)}`;

          if (!options.uploadFile) {
            logger.warn('Missing image upload handler when parsing docx image', { name, mime });
            throw new Error('Missing imageKeyOptions.prefix for parsed document image upload');
          }

          const imageBuffer = await image.read();
          const imageArrayBuffer = new Uint8Array(imageBuffer.byteLength);
          imageArrayBuffer.set(imageBuffer);
          const { key } = await options
            .uploadFile({
              name,
              mime,
              buffer: imageArrayBuffer.buffer
            })
            .catch((error) => {
              logger.warn('Failed to upload docx image from worker', { name, mime, error });
              throw error;
            });

          return {
            src: key
          };
        })
      }
    );

    const { rawText } = await html2md(html);

    return {
      rawText
    };
  } catch (error) {
    logger.error('Failed to parse docx file', { error });
    return Promise.reject('Can not read doc file, please convert to PDF');
  }
};
