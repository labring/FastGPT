import {
  DatasetSearchModeEnum,
  DatasetSearchModeMap
} from '@fastgpt/global/core/dataset/constants';
import { addDays } from 'date-fns';
import { getDefaultRerankModel } from '../../../ai/model';
import { pushTrack } from '../../../../common/middle/tracks/utils';
import { replaceS3KeyToPreviewUrl } from '../../../../core/dataset/utils';
import type { SearchDatasetDataProps, SearchDatasetDataResponse } from '../type';
import { getImageCaptionQueries } from './imageCaption';
import { multiQueryRecall } from './multiQueryRecall';
import { reRankSearchResults } from './rerank';
import {
  concatWeightedRecallLists,
  filterSearchResultsByScore,
  removeDuplicateSearchResults
} from './result';
import { countRecallLimit, filterDatasetDataByMaxTokens } from './utils';

/**
 * 执行默认知识库召回主流程。
 *
 * 这条链路可以按“补充 query -> 多路召回 -> 分组融合 -> 精排/过滤 -> 输出格式化”理解：
 * 1. 输入阶段：`textQueries` 是已经完成 query extension 的文本问题；`imageQueries` 是图片
 *    URL 或 FastGPT 内部对象 key。图片会先尝试生成 caption，把图片补成一条可搜索的文本 query。
 * 2. 召回阶段：文本 query 与图片 caption 走 embedding/full-text 召回；原始图片在 embedding
 *    模型支持图片时额外走图片向量召回。任一图片处理失败只丢弃该图片路径，不影响其他 query。
 * 3. 融合阶段：先分别合并“用户文本”“图片 caption”“图片向量”三类结果，再按图文混合权重合成
 *    最终候选集；这样文本搜索保持主导，图片结果作为视觉补充，纯图片搜索则由图片结果主导。
 * 4. 精排与过滤阶段：rerank 只作用于用户文本召回，避免文本 rerank 误伤视觉相似结果；最终统一做
 *    去重、相似度阈值过滤和 token 上限裁剪。
 * 5. 输出阶段：只在返回前把 chunk 内容里的内部图片 key 替换为预览 URL，避免动态 URL 干扰中间去重
 *    和召回融合。
 */
export async function searchDatasetData(
  props: SearchDatasetDataProps
): Promise<SearchDatasetDataResponse> {
  const {
    teamId,
    reRankQuery,
    textQueries,
    imageQueries = [],
    userKey,
    model,
    vlmModel,
    similarity = 0,
    limit: maxTokens,
    searchMode: inputSearchMode = DatasetSearchModeEnum.embedding,
    embeddingWeight = 0.5,
    usingReRank: inputUsingReRank = false,
    rerankModel,
    rerankWeight = 0.5,
    datasetIds = [],
    collectionFilterMatch
  } = props;

  const searchMode = DatasetSearchModeMap[inputSearchMode]
    ? inputSearchMode
    : DatasetSearchModeEnum.embedding;
  const usingReRank = inputUsingReRank && !!reRankQuery && !!getDefaultRerankModel();

  // Step 1: 图片先尝试转成文本描述。caption 会作为普通文本 query 参与后续召回，
  // 这样即使 embedding 模型不支持图片，也能通过 VLM 描述获得一条文本检索路径。
  const imageCaptionQueries = await getImageCaptionQueries({
    vlmModel,
    imageQueries,
    userKey
  });

  // caption 结果需要回传给工作流计费与响应详情；没有生成出有效描述时不输出该段。
  const hasImageCaptionUsage =
    imageCaptionQueries.inputTokens > 0 || imageCaptionQueries.outputTokens > 0;
  const imageCaptionResult: SearchDatasetDataResponse['imageCaptionResult'] =
    imageCaptionQueries.model && (imageCaptionQueries.queries.length > 0 || hasImageCaptionUsage)
      ? {
          model: imageCaptionQueries.model,
          inputTokens: imageCaptionQueries.inputTokens,
          outputTokens: imageCaptionQueries.outputTokens,
          requestIds: imageCaptionQueries.requestIds,
          seconds: imageCaptionQueries.seconds,
          usedUserOpenAIKey: imageCaptionQueries.usedUserOpenAIKey,
          queries: imageCaptionQueries.queries
        }
      : undefined;

  // Step 2: 根据搜索模式决定两条召回链路各自取多少候选。
  // embedding/full-text/mixed 三种模式最终都走同一个 multiQueryRecall，便于统一过滤集合范围。
  const { embeddingLimit, fullTextLimit } = countRecallLimit(searchMode);
  const {
    textEmbeddingRecallResults,
    imageCaptionEmbeddingRecallResults,
    imageVectorRecallResults,
    textFullTextRecallResults,
    imageCaptionFullTextRecallResults,
    tokens: embeddingTokens
  } = await multiQueryRecall({
    teamId,
    datasetIds,
    model,
    imageQueries,
    collectionFilterMatch,
    embeddingLimit,
    fullTextLimit,
    textQueries,
    imageCaptionQueries: imageCaptionQueries.queries
  });

  // Step 3: 先在同一语义来源内融合。
  // 用户文本召回由 text embedding 与 text full-text 融合；图片描述同理，
  // 原始图片向量召回先独立保留，后面再和 caption 召回合并。
  const textRecallResults = concatWeightedRecallLists([
    { weight: embeddingWeight, list: textEmbeddingRecallResults },
    { weight: 1 - embeddingWeight, list: textFullTextRecallResults }
  ]);
  const imageCaptionRecallResults = concatWeightedRecallLists([
    { weight: embeddingWeight, list: imageCaptionEmbeddingRecallResults },
    { weight: 1 - embeddingWeight, list: imageCaptionFullTextRecallResults }
  ]);

  // Step 4: rerank 只处理文本召回。
  // 图片向量结果和 caption 结果仍按 RRF 融合，避免用文本 rerank 把视觉相似结果误杀。
  const {
    results: textRerankRecallResults,
    inputTokens: reRankInputTokens,
    usingReRank: finalUsingReRank
  } = await reRankSearchResults({
    usingReRank,
    textRecallResults,
    rerankModel,
    query: reRankQuery,
    rerankWeight
  });

  const hasTextQuery = textQueries.some((item) => item.trim());
  // Step 5: 合并图片侧结果。caption 是图片的文本解释，权重低于原始图片向量；
  // 但当模型不支持图片向量时，caption 仍能单独提供图片相关召回。
  const imageRecallResults = concatWeightedRecallLists([
    {
      weight: imageCaptionRecallResults.length > 0 ? 0.3 : 0,
      list: imageCaptionRecallResults
    },
    {
      weight: imageVectorRecallResults.length > 0 ? 0.7 : 0,
      list: imageVectorRecallResults
    }
  ]);
  // Step 6: 合并文本侧与图片侧结果。
  // 纯图片搜索时图片结果权重为 1；图文混合搜索时，文本问题保持主导，图片作为补充约束。
  const rrfConcatResults = concatWeightedRecallLists([
    {
      weight: textRerankRecallResults.length > 0 ? 1 : 0,
      list: textRerankRecallResults
    },
    {
      weight: imageRecallResults.length > 0 ? (hasTextQuery ? 0.7 : 1) : 0,
      list: imageRecallResults
    }
  ]);

  // Step 7: 最终过滤顺序固定为：同内容去重 -> 相似度阈值 -> token 上限。
  // 先去重可以避免同一 chunk 因多路召回重复占用相似度过滤和 token 预算。
  const filterSameDataResults = removeDuplicateSearchResults(rrfConcatResults);
  const { results: scoreFilter, usingSimilarityFilter } = filterSearchResultsByScore({
    data: filterSameDataResults,
    usingReRank: finalUsingReRank,
    searchMode,
    similarity
  });

  const filterMaxTokensResult = await filterDatasetDataByMaxTokens(scoreFilter, maxTokens);
  // Step 8: 返回前把 q 中的内部图片 key 转为可预览 URL。
  // 只在最终结果处理，避免中间召回和去重阶段混入带过期时间的动态 URL。
  const finalResult = filterMaxTokensResult.map((item) => {
    item.q = replaceS3KeyToPreviewUrl(item.q, addDays(new Date(), 90));
    return item;
  });

  pushTrack.datasetSearch({ datasetIds, teamId });

  return {
    searchRes: finalResult,
    embeddingTokens,
    reRankInputTokens,
    searchMode,
    limit: maxTokens,
    similarity,
    usingReRank: finalUsingReRank,
    usingSimilarityFilter,
    imageCaptionResult
  };
}
