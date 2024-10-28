import mammoth, { images } from 'mammoth';
import { ReadRawTextByBuffer, ReadFileResponse, ImageType } from '../type';
import { html2md } from '../../htmlStr2Md/utils';

/**
 * read docx to markdown
 */
export const readDocsFile = async ({ buffer }: ReadRawTextByBuffer): Promise<ReadFileResponse> => {
  const imageList: ImageType[] = [];
  try {
    const { value: html } = await mammoth.convertToHtml(
      {
        buffer
      },
      {
        convertImage: images.imgElement(async (image) => {
          const imageBase64 = await image.readAsBase64String();
          const uuid = crypto.randomUUID();
          const mime = image.contentType;
          imageList.push({
            uuid,
            base64: imageBase64,
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
    console.log('error doc read:', error);
    return Promise.reject('Can not read doc file, please convert to PDF');
  }
};
