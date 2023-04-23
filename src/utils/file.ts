import mammoth from 'mammoth';
import Papa from 'papaparse';
import { encode } from 'gpt-token-utils';

/**
 * 读取 txt 文件内容
 */
export const readTxtContent = (file: File) => {
  return new Promise((resolve: (_: string) => void, reject) => {
    try {
      const reader = new FileReader();
      reader.onload = () => {
        resolve(reader.result as string);
      };
      reader.onerror = (err) => {
        console.log('error txt read:', err);
        reject('读取 txt 文件失败');
      };
      reader.readAsText(file);
    } catch (error) {
      reject('浏览器不支持文件内容读取');
    }
  });
};

/**
 * 读取 pdf 内容
 */
export const readPdfContent = (file: File) =>
  new Promise<string>((resolve, reject) => {
    try {
      const pdfjsLib = window['pdfjs-dist/build/pdf'];
      pdfjsLib.workerSrc = '/js/pdf.worker.js';

      const readPDFPage = async (doc: any, pageNo: number) => {
        const page = await doc.getPage(pageNo);
        const tokenizedText = await page.getTextContent();
        const pageText = tokenizedText.items.map((token: any) => token.str).join(' ');
        return pageText;
      };

      let reader = new FileReader();
      reader.readAsArrayBuffer(file);
      reader.onload = async (event) => {
        if (!event?.target?.result) return reject('解析 PDF 失败');
        try {
          const doc = await pdfjsLib.getDocument(event.target.result).promise;
          const pageTextPromises = [];
          for (let pageNo = 1; pageNo <= doc.numPages; pageNo++) {
            pageTextPromises.push(readPDFPage(doc, pageNo));
          }
          const pageTexts = await Promise.all(pageTextPromises);
          resolve(pageTexts.join('\n'));
        } catch (err) {
          console.log(err, 'pdfjs error');
          reject('解析 PDF 失败');
        }
      };
      reader.onerror = (err) => {
        console.log(err, 'reader error');
        reject('解析 PDF 失败');
      };
    } catch (error) {
      reject('浏览器不支持文件内容读取');
    }
  });

/**
 * 读取doc
 */
export const readDocContent = (file: File) =>
  new Promise<string>((resolve, reject) => {
    try {
      const reader = new FileReader();
      reader.readAsArrayBuffer(file);
      reader.onload = async ({ target }) => {
        if (!target?.result) return reject('读取 doc 文件失败');
        try {
          const res = await mammoth.extractRawText({
            arrayBuffer: target.result as ArrayBuffer
          });
          resolve(res?.value);
        } catch (error) {
          reject('读取 doc 文件失败, 请转换成 PDF');
        }
      };
      reader.onerror = (err) => {
        console.log('error doc read:', err);

        reject('读取 doc 文件失败');
      };
    } catch (error) {
      reject('浏览器不支持文件内容读取');
    }
  });

/**
 * 读取csv
 */
export const readCsvContent = async (file: File) => {
  try {
    const textArr = await readTxtContent(file);
    const json = Papa.parse(textArr).data as string[][];
    if (json.length === 0) {
      throw new Error('csv 解析失败');
    }
    return {
      header: json.shift()?.filter((item) => item) as string[],
      data: json.map((item) => item?.filter((item) => item))
    };
  } catch (error) {
    return Promise.reject('解析 csv 文件失败');
  }
};

/**
 * file download
 */
export const fileDownload = ({
  text,
  type,
  filename
}: {
  text: string;
  type: string;
  filename: string;
}) => {
  // 导出为文件
  const blob = new Blob([`\uFEFF${text}`], { type: `${type};charset=utf-8;` });

  // 创建下载链接
  const downloadLink = document.createElement('a');
  downloadLink.href = window.URL.createObjectURL(blob);
  downloadLink.download = filename;

  // 添加链接到页面并触发下载
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);
};

/**
 * text split into chunks
 * maxLen - one chunk len. max: 3500
 * slideLen - The size of the before and after Text
 * maxLen > slideLen
 */
export const splitText = ({
  text,
  maxLen,
  slideLen
}: {
  text: string;
  maxLen: number;
  slideLen: number;
}) => {
  const textArr =
    text.match(/[！？。\n.]+|[^\s]+/g)?.filter((item) => {
      const text = item.replace(/(\\n)/g, '\n').trim();
      if (text && text !== '\n') return true;
      return false;
    }) || [];

  const chunks: { sum: number; arr: string[] }[] = [{ sum: 0, arr: [] }];

  for (let i = 0; i < textArr.length; i++) {
    const tokenLen = encode(textArr[i]).length;
    chunks[chunks.length - 1].sum += tokenLen;
    chunks[chunks.length - 1].arr.push(textArr[i]);

    //  current length is over maxLen. create new chunk
    if (chunks[chunks.length - 1].sum + tokenLen >= maxLen) {
      // get slide len text as the initial value
      const chunk: { sum: number; arr: string[] } = { sum: 0, arr: [] };
      for (let j = chunks[chunks.length - 1].arr.length - 1; j >= 0; j--) {
        const chunkText = chunks[chunks.length - 1].arr[j];
        const tokenLen = encode(chunkText).length;
        chunk.sum += tokenLen;
        chunk.arr.unshift(chunkText);

        if (chunk.sum >= slideLen) {
          break;
        }
      }
      chunks.push(chunk);
    }
  }

  const result = chunks.map((item) => item.arr.join(''));
  return result;
};
