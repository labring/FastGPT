import { parentPort } from 'worker_threads';
import { readFileRawText } from './extension/rawText';
import { type ReadRawTextByBuffer, type ReadRawTextProps } from './type';
import { readHtmlRawText } from './extension/html';
import { readPdfFile } from './extension/pdf';
import { readDocsFile } from './extension/docx';
import { readPptxRawText } from './extension/pptx';
import { readXlsxRawText } from './extension/xlsx';
import { readCsvRawText } from './extension/csv';
import { readPngFile } from './extension/png';

// 支持的图片格式列表
const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'ico'];

parentPort?.on('message', async (props: ReadRawTextProps<Uint8Array>) => {
  const read = async (params: ReadRawTextByBuffer) => {
    // 检查是否为图片格式
    if (imageExtensions.includes(params.extension.toLowerCase())) {
      // 使用专门的PNG处理函数处理所有图片格式
      return readPngFile(params);
    }

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
        return readXlsxRawText(params);
      case 'csv':
        return readCsvRawText(params);
      default:
        return Promise.reject(
          `Only support .txt, .md, .html, .pdf, .docx, pptx, .csv, .xlsx. "${params.extension}" is not supported.`
        );
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
      data: await read(newProps)
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
