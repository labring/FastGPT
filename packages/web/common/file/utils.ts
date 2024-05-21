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
      reader.readAsText(file);
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
