import { ReadFileByBufferParams, ReadFileResponse } from './type.d';

// 加载源文件内容
export const readFileRawText = ({ buffer, encoding }: ReadFileByBufferParams): ReadFileResponse => {
  const content = buffer.toString(encoding);

  return {
    rawText: content
  };
};
