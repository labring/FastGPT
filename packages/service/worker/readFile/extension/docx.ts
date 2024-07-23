import mammoth from 'mammoth';
import { ReadRawTextByBuffer, ReadFileResponse } from '../type';
import { html2md } from '../../htmlStr2Md/utils';

/**
 * read docx to markdown
 */
export const readDocsFile = async ({ buffer }: ReadRawTextByBuffer): Promise<ReadFileResponse> => {
  try {
    const { value: html } = await mammoth.convertToHtml({
      buffer
    });

    const rawText = html2md(html);

    return {
      rawText
    };
  } catch (error) {
    console.log('error doc read:', error);
    return Promise.reject('Can not read doc file, please convert to PDF');
  }
};
