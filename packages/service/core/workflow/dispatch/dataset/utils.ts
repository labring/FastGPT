import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import { parseUrlToFileType } from '../../utils/context';

export type NormalizeDatasetSearchInputResult = {
  textQueries: string[];
  imageQueries: string[];
};

const httpUrlReg = /^https?:\/\//i;

const pushUnique = <T>(list: T[], seen: Set<T>, value: T) => {
  if (!seen.has(value)) {
    seen.add(value);
    list.push(value);
  }
};

const isHttpUrl = (input: string) => httpUrlReg.test(input);

/**
 * 将数据集搜索输入拆成文本查询和图片查询。
 * datasetSearchInput 会同时接收用户问题和 userFiles；这里只把普通 http(s) URL
 * 作为文件候选继续判断，非 http(s) 输入都保留为文本检索 query。
 */
export const normalizeDatasetSearchInput = (
  inputList: string[]
): NormalizeDatasetSearchInputResult => {
  const textQueries: string[] = [];
  const imageQueries: string[] = [];
  const seenTextQueries = new Set<string>();
  const seenQueryImageUrls = new Set<string>();

  for (const rawInput of inputList) {
    const input = rawInput.trim();
    if (!input) continue;

    if (!isHttpUrl(input)) {
      pushUnique(textQueries, seenTextQueries, input);
      continue;
    }

    const fileInfo = parseUrlToFileType(input);
    if (fileInfo?.type !== ChatFileTypeEnum.image || seenQueryImageUrls.has(input)) {
      continue;
    }

    seenQueryImageUrls.add(input);
    imageQueries.push(input);
  }

  return {
    textQueries,
    imageQueries
  };
};
