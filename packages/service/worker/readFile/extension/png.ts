import { ReadRawTextByBuffer, ReadFileResponse } from '../type';

/**
 * 处理PNG等图片文件
 * 返回一个标准的ReadFileResponse，不尝试解析图片内容
 */
export const readPngFile = async (params: ReadRawTextByBuffer): Promise<ReadFileResponse> => {
  // 获取文件扩展名
  const extension = params.extension.toLowerCase();

  // 返回图片描述信息
  return {
    rawText: '', // 图片没有文本内容
    formatText: `[图片: ${extension}格式]`, // 格式化描述
    imageList: [] // 空图片列表，符合类型定义
  };
};
