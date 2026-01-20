import { getErrText } from '@fastgpt/global/common/error/utils';
import Papa from 'papaparse';
import { type AxiosProgressEvent } from 'axios';
import axios from 'axios';
import { parseS3UploadError } from '@fastgpt/global/common/error/s3';
import mime from 'mime-types';
import { fileTypeFromBlob } from 'file-type/core';

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

export const putFileToS3 = async ({
  headers,
  url,
  file,
  onSuccess,
  onUploadProgress,
  maxSize,
  t
}: {
  headers?: Record<string, string>;
  url: string;
  file: File;
  onSuccess?: () => void;
  onUploadProgress?: (progressEvent: AxiosProgressEvent) => void;
  maxSize?: number;
  t: any;
}) => {
  try {
    const res = await axios.put(url, file, {
      headers: {
        ...headers
      },
      onUploadProgress,
      timeout: 5 * 60 * 1000
    });
    if (res.status === 200) {
      onSuccess?.();
    }
  } catch (error) {
    Promise.reject(parseS3UploadError({ t, error, maxSize }));
  }
};

export const checkFileMimeType = async ({
  file,
  // 不传递 allowedMimeTypes 时，默认允许所有 MIME 类型
  allowedMimeTypes,
  allowedTextFallbackMimeTypes
}: {
  file: File;
  allowedMimeTypes?: Set<string>;
  allowedTextFallbackMimeTypes?: Set<string>;
}): Promise<string> => {
  // 严格模式，不通过文件扩展名推断 MIME 类型
  if (allowedMimeTypes && !allowedTextFallbackMimeTypes) {
    const result = await getFileType(file);

    // file-type 没推断出来类型，或者不在白名单中，拒绝上传
    if (result.mime === 'application/octet-stream' || !allowedMimeTypes?.has(result.mime)) {
      throw new Error(`File type ${result.mime} is not allowed`);
    }

    return result.mime;
  }

  // 宽松模式，适合推断文本文件，通过文件扩展名推断 MIME 类型
  else if (allowedMimeTypes && allowedTextFallbackMimeTypes) {
    const result = await getFileType(file);

    // 不是二进制文件、纯文本文件，但是不在白名单中，拒绝上传
    if (result.mime !== 'application/octet-stream' && !allowedMimeTypes?.has(result.mime)) {
      throw new Error(`File type ${result.mime} is not allowed`);
    }

    // 可能是二进制文件、纯文本文件，通过文件扩展名推断 MIME 类型
    if (result.mime === 'application/octet-stream') {
      const textMimeType = mime.lookup(file.name);

      // mime-types 没推断出来类型，或者不在白名单中，拒绝上传
      if (textMimeType === false || !allowedTextFallbackMimeTypes?.has(textMimeType)) {
        throw new Error(`File type ${textMimeType} is not allowed`);
      }

      return textMimeType;
    }

    return result.mime;
  }

  return file.type;
};

export const getMimeTypeByExtensions = (extensions: string[]): string[] => {
  return extensions
    .map((extension) => {
      return mime.lookup(extension);
    })
    .filter(Boolean) as string[];
};

export const getFileType = async (file: Blob) => {
  const result = await fileTypeFromBlob(file);
  return result ? result : { ext: 'bin', mime: 'application/octet-stream' };
};
