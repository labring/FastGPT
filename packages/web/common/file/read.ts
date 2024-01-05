import { uploadMarkdownBase64 } from '@fastgpt/global/common/string/markdown';
import { htmlStr2Md } from '../string/markdown';
/**
 * read file raw text
 */
export const readFileRawText = (file: File) => {
  return new Promise((resolve: (_: string) => void, reject) => {
    try {
      const reader = new FileReader();
      reader.onload = () => {
        resolve(reader.result as string);
      };
      reader.onerror = (err) => {
        console.log('error txt read:', err);
        reject('Read file error');
      };
      reader.readAsText(file);
    } catch (error) {
      reject(error);
    }
  });
};

export const readMdFile = async ({
  file,
  uploadImgController
}: {
  file: File;
  uploadImgController: (base64: string) => Promise<string>;
}) => {
  const md = await readFileRawText(file);
  const rawText = await uploadMarkdownBase64({
    rawText: md,
    uploadImgController
  });
  return rawText;
};

export const readHtmlFile = async ({
  file,
  uploadImgController
}: {
  file: File;
  uploadImgController: (base64: string) => Promise<string>;
}) => {
  const md = htmlStr2Md(await readFileRawText(file));
  const rawText = await uploadMarkdownBase64({
    rawText: md,
    uploadImgController
  });

  return rawText;
};
