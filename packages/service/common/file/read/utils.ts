import { markdownProcess } from '@fastgpt/global/common/string/markdown';
import { uploadMongoImg } from '../image/controller';
import { MongoImageTypeEnum } from '@fastgpt/global/common/file/image/constants';
import { addHours } from 'date-fns';
import { ReadFileByBufferParams } from './type';
import { readFileRawText } from '../read/rawText';
import { readMarkdown } from '../read/markdown';
import { readHtmlRawText } from '../read/html';
import { readPdfFile } from '../read/pdf';
import { readWordFile } from '../read/word';
import { readCsvRawText } from '../read/csv';
import { readPptxRawText } from '../read/pptx';
import { readXlsxRawText } from '../read/xlsx';

export const initMarkdownText = ({
  teamId,
  md,
  metadata
}: {
  md: string;
  teamId: string;
  metadata?: Record<string, any>;
}) =>
  markdownProcess({
    rawText: md,
    uploadImgController: (base64Img) =>
      uploadMongoImg({
        type: MongoImageTypeEnum.collectionImage,
        base64Img,
        teamId,
        metadata,
        expiredTime: addHours(new Date(), 2)
      })
  });

export const readFileRawContent = async ({
  extension,
  csvFormat,
  params
}: {
  csvFormat?: boolean;
  extension: string;
  params: ReadFileByBufferParams;
}) => {
  switch (extension) {
    case 'txt':
      return readFileRawText(params);
    case 'md':
      return readMarkdown(params);
    case 'html':
      return readHtmlRawText(params);
    case 'pdf':
      return readPdfFile(params);
    case 'docx':
      return readWordFile(params);
    case 'pptx':
      return readPptxRawText(params);
    case 'xlsx':
      const xlsxResult = await readXlsxRawText(params);
      if (csvFormat) {
        return {
          rawText: xlsxResult.formatText || ''
        };
      }
      return {
        rawText: xlsxResult.rawText
      };
    case 'csv':
      const csvResult = await readCsvRawText(params);
      if (csvFormat) {
        return {
          rawText: csvResult.formatText || ''
        };
      }
      return {
        rawText: csvResult.rawText
      };
    default:
      return Promise.reject('Only support .txt, .md, .html, .pdf, .docx, pptx, .csv, .xlsx');
  }
};
