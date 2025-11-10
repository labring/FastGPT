import { getErrText } from '@fastgpt/global/common/error/utils';
import Papa from 'papaparse';

export const loadFile2Buffer = ({ file, onError }: { file: File; onError?: (err: any) => void }) =>
  new Promise<ArrayBuffer>((resolve, reject) => {
    try {
      let reader = new FileReader();
      reader.readAsArrayBuffer(file);
      reader.onload = async ({ target }) => {
        if (!target?.result) {
          onError?.('Load file error');
          return reject('Load file error');
        }
        try {
          resolve(target.result as ArrayBuffer);
        } catch (err) {
          console.log(err, 'Load file error');
          onError?.(err);

          reject(getErrText(err, 'Load file error'));
        }
      };
      reader.onerror = (err) => {
        console.log(err, 'Load file error');
        onError?.(err);

        reject(getErrText(err, 'Load file error'));
      };
    } catch (error) {
      reject('The browser does not support file content reading');
    }
  });

export const readFileRawText = ({
  file,
  onError
}: {
  file: File;
  onError?: (err: any) => void;
}) => {
  return new Promise<string>((resolve, reject) => {
    try {
      let reader = new FileReader();
      reader.onload = async ({ target }) => {
        if (!target?.result) {
          onError?.('Load file error');
          return reject('Load file error');
        }
        try {
          resolve(target.result as string);
        } catch (err) {
          console.log(err, 'Load file error');
          onError?.(err);

          reject(getErrText(err, 'Load file error'));
        }
      };
      reader.onerror = (err) => {
        console.log(err, 'Load file error');
        onError?.(err);

        reject(getErrText(err, 'Load file error'));
      };
      detectFileEncoding(file).then((encoding) => {
        console.log(encoding);

        reader.readAsText(
          file,
          ['iso-8859-1', 'windows-1252'].includes(encoding) ? 'gb2312' : 'utf-8'
        );
      });
    } catch (error) {
      reject('The browser does not support file content reading');
    }
  });
};

export const readCsvRawText = async ({ file }: { file: File }) => {
  const rawText = await readFileRawText({ file });
  const csvArr = Papa.parse(rawText).data as string[][];
  return csvArr;
};

async function detectFileEncoding(file: File): Promise<string> {
  const buffer = await loadFile2Buffer({ file });
  const encoding = (() => {
    const encodings = ['utf-8', 'iso-8859-1', 'windows-1252'];
    for (let encoding of encodings) {
      try {
        const decoder = new TextDecoder(encoding, { fatal: true });
        decoder.decode(buffer);
        return encoding; // 如果解码成功，返回当前编码
      } catch (e) {
        // continue to try next encoding
      }
    }
    return null; // 如果没有编码匹配，返回null
  })();

  return encoding || 'utf-8';
}

export const fileToBase64 = (file: File) => {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
};

export const base64ToFile = (base64: string, filename: string) => {
  const arr = base64.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], filename, { type: mime });
};
