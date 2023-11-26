import mammoth from 'mammoth';
import Papa from 'papaparse';
import { compressBase64ImgAndUpload } from './controller';

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
          // @ts-ignore
          const res = await mammoth.convertToMarkdown({
            arrayBuffer: target.result as ArrayBuffer
          });

          let rawText: string = res?.value || '';

          // match base64, upload and replace it
          const base64Regex = /data:image\/[a-zA-Z]+;base64,([^\)]+)/g;
          const base64Arr = rawText.match(base64Regex) || [];

          // upload base64 and replace it
          await Promise.all(
            base64Arr.map(async (base64) => {
              try {
                const str = await compressBase64ImgAndUpload({
                  base64,
                  maxW: 800,
                  maxH: 800,
                  maxSize: 1024 * 1024 * 2
                });
                rawText = rawText.replace(base64, str);
              } catch (error) {
                rawText = rawText.replace(base64, '');
                rawText = rawText.replaceAll('![]()', '');
              }
            })
          );

          const trimReg = /\s*(!\[.*\]\(.*\))\s*/g;
          if (trimReg.test(rawText)) {
            rawText = rawText.replace(/\s*(!\[.*\]\(.*\))\s*/g, '$1');
          }

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
 * 读取csv
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
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => reject(error);
  });
};
