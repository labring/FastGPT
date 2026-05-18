import { queryExtension } from '../../ai/functions/queryExtension';
import { type ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { getLogger, LogCategories } from '../../../common/logger';
import type { OpenaiAccountType } from '@fastgpt/global/support/user/team/type';
import { getImageBase64 } from '../../../common/file/image/utils';
import { getS3DatasetSource } from '../../../common/s3/sources/dataset';
import { isS3ObjectKey } from '../../../common/s3/utils';
import { serviceEnv } from '../../../env';

const logger = getLogger(LogCategories.MODULE.DATASET.DATA);

/**
 * 计算多个 collection 过滤条件的交集。
 * `undefined` 表示当前过滤维度未启用，应被忽略；空数组表示该维度明确无命中，
 * 会参与交集并让最终结果为空。
 */
export const computeFilterIntersection = (lists: (string[] | undefined)[]) => {
  const validLists = lists.filter((list): list is string[] => list !== undefined);

  if (validLists.length === 0) return undefined;

  // reduce without initial value uses first element as accumulator
  return validLists.reduce((acc, list) => {
    const set = new Set(list);
    return acc.filter((id) => set.has(id));
  });
};

/**
 * 按环境开关规范化图片输入。
 * data URL 已经是模型可读内容，始终原样返回；serviceEnv.MULTIPLE_DATA_TO_BASE64
 * 为 true 时，FastGPT 内部对象 key 和普通图片 URL 都会转成 base64，避免模型服务反向
 * 访问内网/本地存储地址；关闭该开关时，内部对象 key 会换成临时外部访问 URL。
 * 这里不吞异常，由上层按图片粒度降级，避免一张坏图中断整次检索。
 */
export const normalizeImageToBase64 = async (imageUrl: string) => {
  if (imageUrl.startsWith('data:image/')) {
    return imageUrl;
  }

  const isInternalObjectKey =
    isS3ObjectKey(imageUrl, 'dataset') ||
    isS3ObjectKey(imageUrl, 'temp') ||
    isS3ObjectKey(imageUrl, 'chat');

  if (serviceEnv.MULTIPLE_DATA_TO_BASE64) {
    if (isInternalObjectKey) {
      return getS3DatasetSource().getDatasetBase64Image(imageUrl);
    }

    const { completeBase64 } = await getImageBase64(imageUrl);
    return completeBase64;
  }

  if (!isInternalObjectKey) {
    return imageUrl;
  }

  const { url } = await getS3DatasetSource().createExternalUrl({
    key: imageUrl,
    expiredHours: 1
  });
  return url;
};

/**
 * 对文本查询做 query extension。
 * 调用方会先把多个文本 query 合并成一个字符串传入，这里始终按普通字符串处理，
 * 不再兼容旧的“query 已经是扩展结果 JSON”分支。扩展失败时返回原始 query，
 * 保证搜索主链路不被 LLM 扩展能力影响。
 */
export const datasetSearchQueryExtension = async ({
  query,
  llmModel,
  embeddingModel,
  userKey,
  extensionBg = '',
  histories = []
}: {
  query: string;
  llmModel?: string;
  embeddingModel?: string;
  userKey?: OpenaiAccountType;
  extensionBg?: string;
  histories?: ChatItemMiniType[];
}) => {
  /**
   * query extension 结果可能与原 query 只有标点或空格差异。
   * 去重时忽略标点和空白，但保留原始文本，避免影响后续 embedding 和展示。
   */
  const filterSameQuery = (queries: string[]) => {
    const set = new Set<string>();
    const filterSameQueries = queries
      .map((item) => item.trim())
      .filter(Boolean)
      .filter((item) => {
        // 删除所有的标点符号与空格等，只对文本进行比较
        const str = hashStr(item.replace(/[^\p{L}\p{N}]/gu, ''));
        if (set.has(str)) return false;
        set.add(str);
        return true;
      });

    return filterSameQueries;
  };

  let queries = [query];
  let reRankQuery = query;

  // Use LLM to generate extension queries
  const aiExtensionResult = await (async () => {
    if (!llmModel || !embeddingModel) return;

    try {
      const result = await queryExtension({
        chatBg: extensionBg,
        query,
        histories,
        llmModel,
        embeddingModel,
        userKey
      });
      if (result.extensionQueries?.length === 0) return;
      return result;
    } catch (error) {
      logger.error('Failed to generate extension queries', { error });
    }
  })();

  if (aiExtensionResult) {
    queries = filterSameQuery(queries.concat(aiExtensionResult.extensionQueries));
    reRankQuery = queries.join('\n');
  }

  return {
    searchQueries: queries,
    reRankQuery,
    aiExtensionResult
  };
};
