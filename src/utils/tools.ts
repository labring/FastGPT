import crypto from 'crypto';
import { useToast } from '@/hooks/useToast';
import mammoth from 'mammoth';

/**
 * copy text data
 */
export const useCopyData = () => {
  const { toast } = useToast();

  return {
    copyData: async (data: string, title: string = '复制成功') => {
      try {
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(data);
        } else {
          const textarea = document.createElement('textarea');
          textarea.value = data;
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand('copy');
          document.body.removeChild(textarea);
        }
        toast({
          title,
          status: 'success',
          duration: 1000
        });
      } catch (error) {
        console.log('error->', error);
        toast({
          title: '复制失败',
          status: 'error'
        });
      }
    }
  };
};

export const createHashPassword = (text: string) => {
  const hash = crypto.createHash('sha256').update(text).digest('hex');
  return hash;
};

export const Obj2Query = (obj: Record<string, string | number>) => {
  const queryParams = new URLSearchParams();
  for (const key in obj) {
    queryParams.append(key, `${obj[key]}`);
  }
  return queryParams.toString();
};

/**
 * 读取 txt 文件内容
 */
export const readTxtContent = (file: File) => {
  return new Promise((resolve: (_: string) => void, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(reader.result as string);
    };
    reader.onerror = (err) => {
      console.log('error txt read:', err);
      reject('读取 txt 文件失败');
    };
    reader.readAsText(file);
  });
};

/**
 * 读取 pdf 内容
 */
export const readPdfContent = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const pdfjsLib = window['pdfjs-dist/build/pdf'];
    pdfjsLib.workerSrc = '/js/pdf.worker.js';

    const readPDFPage = async (doc: any, pageNo: number) => {
      const page = await doc.getPage(pageNo);
      const tokenizedText = await page.getTextContent();
      const pageText = tokenizedText.items.map((token: any) => token.str).join('');
      return pageText.replaceAll(/\s+/g, '\n');
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
  });

/**
 * 读取doc
 */
export const readDocContent = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsArrayBuffer(file);
    reader.onload = ({ target }) => {
      if (!target?.result) return reject('读取 doc 文件失败');
      return mammoth.extractRawText({ arrayBuffer: target.result as ArrayBuffer }).then((res) => {
        resolve(res.value);
      });
    };
    reader.onerror = (err) => {
      console.log('error doc read:', err);

      reject('读取 doc 文件失败');
    };
  });

export const vectorToBuffer = (vector: number[]) => {
  let npVector = new Float32Array(vector);

  return Buffer.from(npVector.buffer);
};
