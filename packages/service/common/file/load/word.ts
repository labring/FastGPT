import mammoth from 'mammoth';
import { htmlToMarkdown } from '../../string/markdown';
import { ReadFileParams } from './type';
/**
 * read docx to markdown
 */
export const readDocFle = async ({ path, metadata = {} }: ReadFileParams) => {
  try {
    const { value: html } = await mammoth.convertToHtml({
      path
    });

    const md = await htmlToMarkdown(html);

    return {
      rawText: md
    };
  } catch (error) {
    console.log('error doc read:', error);
    return Promise.reject('Can not read doc file, please convert to PDF');
  }
};
