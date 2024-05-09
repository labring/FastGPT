import { parentPort } from 'worker_threads';
import { readFileRawText } from './extension/rawText';
import { ReadRawTextByBuffer, ReadRawTextProps } from './type';
import { readHtmlRawText } from './extension/html';
import { readPdfFile } from './extension/pdf';
import { readDocsFile } from './extension/docx';
import { readPptxRawText } from './extension/pptx';
import { readXlsxRawText } from './extension/xlsx';
import { readCsvRawText } from './extension/csv';

parentPort?.on('message', async (props: ReadRawTextProps<Uint8Array>) => {
  const readFileRawContent = async (params: ReadRawTextByBuffer) => {
    switch (params.extension) {
      case 'txt':
      case 'md':
        return readFileRawText(params);
      case 'html':
        return readHtmlRawText(params);
      case 'pdf':
        return readPdfFile(params);
      case 'docx':
        return readDocsFile(params);
      case 'pptx':
        return readPptxRawText(params);
      case 'xlsx':
        const xlsxResult = await readXlsxRawText(params);
        if (params.csvFormat) {
          return {
            rawText: xlsxResult.formatText || ''
          };
        }
        return {
          rawText: xlsxResult.rawText
        };
      case 'csv':
        const csvResult = await readCsvRawText(params);
        if (params.csvFormat) {
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

  //   params.buffer: Uint8Array -> buffer
  const buffer = Buffer.from(props.buffer);
  const newProps: ReadRawTextByBuffer = {
    ...props,
    buffer
  };

  try {
    parentPort?.postMessage({
      type: 'success',
      data: await readFileRawContent(newProps)
    });
  } catch (error) {
    console.log(error);
    parentPort?.postMessage({
      type: 'error',
      data: error
    });
  }

  process.exit();
});
