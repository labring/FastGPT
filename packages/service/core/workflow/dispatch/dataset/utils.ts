import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import { isHttpUrl } from '@fastgpt/global/common/string/url';
import { prepareWorkflowFiles } from '../../utils/context';

export type NormalizeDatasetSearchInputResult = {
  textQueries: string[];
  imageQueries: string[];
};

const dataUrlReg = /^data:/i;

const pushUnique = <T>(list: T[], seen: Set<T>, value: T) => {
  if (!seen.has(value)) {
    seen.add(value);
    list.push(value);
  }
};

const isDataUrl = (input: string) => dataUrlReg.test(input);

/**
 * 将数据集搜索输入拆成文本查询和图片查询。
 * datasetSearchInput 会同时接收用户问题和 userFiles；http(s) URL 和 Data URL
 * 作为文件候选继续判断，其他输入保留为文本检索 query。
 */
export const normalizeDatasetSearchInput = async (
  inputList: string[]
): Promise<NormalizeDatasetSearchInputResult> => {
  const textQueries: string[] = [];
  const imageQueries: string[] = [];
  const seenTextQueries = new Set<string>();
  const fileCandidates: string[] = [];

  for (const rawInput of inputList) {
    const input = rawInput.trim();
    if (!input) continue;

    if (!isHttpUrl(input) && !isDataUrl(input)) {
      pushUnique(textQueries, seenTextQueries, input);
      continue;
    }

    fileCandidates.push(input);
  }

  const files = await prepareWorkflowFiles({ files: fileCandidates.map((url) => ({ url })) });
  files.forEach((file) => {
    if (file.type === ChatFileTypeEnum.image) imageQueries.push(file.url);
  });

  return {
    textQueries,
    imageQueries
  };
};
