import mammoth from 'mammoth';
import { ReadRawTextByBuffer, ReadFileResponse } from '../type';
import { html2md } from '../utils';

/**
 * read docx to markdown
 */
export const readDocsFile = async ({ buffer }: ReadRawTextByBuffer): Promise<ReadFileResponse> => {
  try {
    const { value: html } = await mammoth.convertToHtml({
      buffer
    });
    console.log('doc-read1', html);

    const rawText = html2md(html);
    console.log('doc-read2', rawText);
    return {
      rawText
    };
  } catch (error) {
    console.log('error doc read:', error);
    return Promise.reject('Can not read doc file, please convert to PDF');
  }
};
