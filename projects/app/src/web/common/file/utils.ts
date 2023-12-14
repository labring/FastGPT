import mammoth from 'mammoth';
import Papa from 'papaparse';
import { compressBase64ImgAndUpload } from './controller';
import { simpleMarkdownText } from '@fastgpt/global/common/string/markdown';

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
 * read pdf to raw text
 */
export const readPdfContent = (file: File) =>
  new Promise<string>((resolve, reject) => {
    type TokenType = {
      str: string;
      dir: string;
      width: number;
      height: number;
      transform: number[];
      fontName: string;
      hasEOL: boolean;
    };

    try {
      const pdfjsLib = window['pdfjs-dist/build/pdf'];
      pdfjsLib.workerSrc = '/js/pdf.worker.js';

      const readPDFPage = async (doc: any, pageNo: number) => {
        const page = await doc.getPage(pageNo);
        const tokenizedText = await page.getTextContent();

        const viewport = page.getViewport({ scale: 1 });
        const pageHeight = viewport.height;
        const headerThreshold = pageHeight * 0.07; // 假设页头在页面顶部5%的区域内
        const footerThreshold = pageHeight * 0.93; // 假设页脚在页面底部5%的区域内

        const pageTexts: TokenType[] = tokenizedText.items.filter((token: TokenType) => {
          return (
            !token.transform ||
            (token.transform[5] > headerThreshold && token.transform[5] < footerThreshold)
          );
        });

        // concat empty string 'hasEOL'
        for (let i = 0; i < pageTexts.length; i++) {
          const item = pageTexts[i];
          if (item.str === '' && pageTexts[i - 1]) {
            pageTexts[i - 1].hasEOL = item.hasEOL;
            pageTexts.splice(i, 1);
            i--;
          }
        }

        return pageTexts
          .map((token) => {
            const paragraphEnd = token.hasEOL && /([。？！.?!\n\r]|(\r\n))$/.test(token.str);

            return paragraphEnd ? `${token.str}\n` : token.str;
          })
          .join('');
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
          resolve(pageTexts.join(''));
        } catch (err) {
          console.log(err, 'pdf load error');
          reject('解析 PDF 失败');
        }
      };
      reader.onerror = (err) => {
        console.log(err, 'pdf load error');
        reject('解析 PDF 失败');
      };
    } catch (error) {
      reject('浏览器不支持文件内容读取');
    }
  });

/**
 * read docx to markdown
 */
export const readDocContent = (file: File, metadata: Record<string, any>) =>
  new Promise<string>((resolve, reject) => {
    try {
      const reader = new FileReader();
      reader.readAsArrayBuffer(file);
      reader.onload = async ({ target }) => {
        if (!target?.result) return reject('读取 doc 文件失败');
        try {
          // @ts-ignore
          const res = await mammoth.convertToMarkdown({
            arrayBuffer: target.result as ArrayBuffer
          });

          const rawText = await formatMarkdown(res?.value, metadata);

          resolve(rawText);
        } catch (error) {
          window.umami?.track('wordReadError', {
            err: error?.toString()
          });
          console.log('error doc read:', error);

          reject('读取 doc 文件失败, 请转换成 PDF');
        }
      };
      reader.onerror = (err) => {
        window.umami?.track('wordReadError', {
          err: err?.toString()
        });
        console.log('error doc read:', err);

        reject('读取 doc 文件失败');
      };
    } catch (error) {
      reject('浏览器不支持文件内容读取');
    }
  });

/**
 * read csv to json
 * @response {
 *  header: string[],
 *  data: string[][]
 * }
 */
export const readCsvContent = async (file: File) => {
  try {
    const textArr = await readTxtContent(file);
    const csvArr = Papa.parse(textArr).data as string[][];
    if (csvArr.length === 0) {
      throw new Error('csv 解析失败');
    }
    return {
      header: csvArr.shift() as string[],
      data: csvArr.map((item) => item)
    };
  } catch (error) {
    return Promise.reject('解析 csv 文件失败');
  }
};

/**
 * format markdown
 * 1. upload base64
 * 2. replace \
 */
export const formatMarkdown = async (rawText: string = '', metadata: Record<string, any>) => {
  // match base64, upload and replace it
  const base64Regex = /data:image\/.*;base64,([^\)]+)/g;
  const base64Arr = rawText.match(base64Regex) || [];
  // upload base64 and replace it
  await Promise.all(
    base64Arr.map(async (base64Img) => {
      try {
        const str = await compressBase64ImgAndUpload({
          base64Img,
          maxW: 4329,
          maxH: 4329,
          maxSize: 1024 * 1024 * 5,
          metadata
        });

        rawText = rawText.replace(base64Img, str);
      } catch (error) {
        rawText = rawText.replace(base64Img, '');
        rawText = rawText.replace(/!\[.*\]\(\)/g, '');
      }
    })
  );

  // Remove white space on both sides of the picture
  const trimReg = /\s*(!\[.*\]\(.*\))\s*/g;
  if (trimReg.test(rawText)) {
    rawText = rawText.replace(/\s*(!\[.*\]\(.*\))\s*/g, '$1');
  }

  return simpleMarkdownText(rawText);
};

/**
 * file download by text
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
  document.body?.removeChild(downloadLink);
};

export const fileToBase64 = (file: File) => {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
};
