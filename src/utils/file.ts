import mammoth from 'mammoth';
import Papa from 'papaparse';
import { getOpenAiEncMap } from './chat/openai';

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
export const splitText_token = ({
  text,
  maxLen,
  slideLen
}: {
  text: string;
  maxLen: number;
  slideLen: number;
}) => {
  const enc = getOpenAiEncMap()['gpt-3.5-turbo'];
  // filter empty text. encode sentence
  const encodeText = enc.encode(text);

  const chunks: string[] = [];
  let tokens = 0;

  let startIndex = 0;
  let endIndex = Math.min(startIndex + maxLen, encodeText.length);
  let chunkEncodeArr = encodeText.slice(startIndex, endIndex);

  const decoder = new TextDecoder();

  while (startIndex < encodeText.length) {
    tokens += chunkEncodeArr.length;
    chunks.push(decoder.decode(enc.decode(chunkEncodeArr)));

    startIndex += maxLen - slideLen;
    endIndex = Math.min(startIndex + maxLen, encodeText.length);
    chunkEncodeArr = encodeText.slice(Math.min(encodeText.length - slideLen, startIndex), endIndex);
  }

  return {
    chunks,
    tokens
  };
};

export const fileToBase64 = (file: File) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => reject(error);
  });
};
