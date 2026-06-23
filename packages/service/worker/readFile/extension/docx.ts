import mammoth, { images } from 'mammoth';
import { type ReadRawTextByBuffer, type ReadFileResponse, type ImageType } from '../type';
import { html2md } from '../../htmlStr2Md/utils';
import { getLogger, LogCategories } from '../../../common/logger';
import { isUnsupportedImageMime, convertUnsupportedImageToPng } from '../convertImage';

/**
 * read docx to markdown
 */
export const readDocsFile = async ({ buffer }: ReadRawTextByBuffer): Promise<ReadFileResponse> => {
  const imageList: ImageType[] = [];
  const logger = getLogger(LogCategories.INFRA.WORKER);
  try {
    const { value: html } = await mammoth.convertToHtml(
      {
        buffer
      },
      {
        ignoreEmptyParagraphs: false,
        convertImage: images.imgElement(async (image) => {
          const imageBase64 = await image.readAsBase64String();
          const uuid = crypto.randomUUID();
          let mime = image.contentType;
          let base64 = imageBase64;

          // Convert EMF/WMF to PNG for browser compatibility
          if (isUnsupportedImageMime(mime)) {
            const converted = await convertUnsupportedImageToPng(imageBase64, mime);
            if (converted) {
              base64 = converted.base64;
              mime = converted.mime;
            }
          }

          imageList.push({
            uuid,
            base64,
            mime
          });
          return {
            src: uuid
          };
        })
      }
    );

    const { rawText } = html2md(html);

    return {
      rawText,
      imageList
    };
  } catch (error) {
    logger.error('Failed to parse docx file', { error });
    return Promise.reject('Can not read doc file, please convert to PDF');
  }
};
