import { detectFileEncoding } from '@fastgpt/global/common/file/tools';

/**
 * read file raw text
 */
export const readFileRawText = (file: File) => {
  return new Promise<{ rawText: string }>((resolve, reject) => {
    try {
      const reader = new FileReader();
      reader.onload = () => {
        //@ts-ignore
        const encode = detectFileEncoding(reader.result);

        // 再次读取文件，这次使用检测到的编码
        const reader2 = new FileReader();
        reader2.onload = () => {
          resolve({
            rawText: reader2.result as string
          });
        };
        reader2.onerror = (err) => {
          console.log('Error reading file with detected encoding:', err);
          reject('Read file error with detected encoding');
        };
        reader2.readAsText(file, encode);
      };
      reader.onerror = (err) => {
        console.log('error txt read:', err);
        reject('Read file error');
      };
      reader.readAsBinaryString(file);
    } catch (error) {
      reject(error);
    }
  });
};
