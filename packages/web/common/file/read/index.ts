import { loadFile2Buffer } from '../utils';
import { readHtmlFile } from './html';
import { readMdFile } from './md';
import { readPdfFile } from './pdf';
import { readFileRawText } from './rawText';
import { readWordFile } from './word';

export const readFileRawContent = async ({
  file,
  uploadBase64Controller
}: {
  file: File;
  uploadBase64Controller?: (base64: string) => Promise<string>;
}): Promise<{
  rawText: string;
}> => {
  const extension = file?.name?.split('.')?.pop()?.toLowerCase();

  switch (extension) {
    case 'txt':
      return readFileRawText(file);
    case 'md':
      return readMdFile({
        file,
        uploadImgController: uploadBase64Controller
      });
    case 'html':
      return readHtmlFile({
        file,
        uploadImgController: uploadBase64Controller
      });
    case 'pdf':
      const pdf = await loadFile2Buffer({ file });
      return readPdfFile({ pdf });
    case 'docx':
      return readWordFile({
        file,
        uploadImgController: uploadBase64Controller
      });

    default:
      return {
        rawText: ''
      };
  }
};
