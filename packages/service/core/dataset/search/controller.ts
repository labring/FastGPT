import {
  DatasetSearchModeEnum,
  DatasetSearchModeMap,
  SearchScoreTypeEnum
} from '@fastgpt/global/core/dataset/constants';
import { recallFromVectorStore } from '../../../common/vectorDB/controller';
import { getVectors } from '../../ai/embedding';
import {
  getEmbeddingModel,
  getDefaultRerankModel,
  getLLMModel,
  isImageEmbeddingModel
} from '../../ai/model';
import { MongoDatasetData } from '../data/schema';
import type {
  DatasetCollectionSchemaType,
  DatasetDataSchemaType
} from '@fastgpt/global/core/dataset/type';
import {
  type DatasetDataTextSchemaType,
  type SearchDataResponseItemType
} from '@fastgpt/global/core/dataset/type';
import { MongoDatasetCollection } from '../collection/schema';
import { reRankRecall } from '../../../core/ai/rerank';
import { countPromptTokens } from '../../../common/string/tiktoken/index';
import { datasetSearchResultConcat } from '@fastgpt/global/core/dataset/search/utils';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { jiebaSplit } from '../../../common/string/jieba/index';
import { getCollectionSourceData } from '@fastgpt/global/core/dataset/collection/utils';
import { Types } from '../../../common/mongo';
import json5 from 'json5';
import { MongoDatasetCollectionTags } from '../tag/schema';
import { readFromSecondary } from '../../../common/mongo/utils';
import { MongoDatasetDataText } from '../data/dataTextSchema';
import { type ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import type { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  computeFilterIntersection,
  datasetSearchQueryExtension,
  normalizeImageToBase64
} from './utils';
import type { RerankModelItemType } from '@fastgpt/global/core/ai/model.schema';
import { formatDatasetDataValue } from '../data/controller';
import { pushTrack } from '../../../common/middle/tracks/utils';
import { replaceS3KeyToPreviewUrl } from '../../../core/dataset/utils';
import { addDays } from 'date-fns';
import { getLogger, LogCategories } from '../../../common/logger';
import type { OpenaiAccountType } from '@fastgpt/global/support/user/team/type';
import { createLLMResponse } from '../../ai/llm/request';

const logger = getLogger(LogCategories.MODULE.DATASET.DATA);

export type SearchDatasetDataProps = {
  histories: ChatItemMiniType[];
  teamId: string;
  uid?: string;
  tmbId?: string;
  model: string;
  vlmModel?: string;
  datasetIds: string[];
  reRankQuery: string;
  queries: string[];
  queryImageUrls?: string[];

  [NodeInputKeyEnum.datasetSimilarity]?: number; // min distance
  [NodeInputKeyEnum.datasetMaxTokens]: number; // max Token limit
  [NodeInputKeyEnum.datasetSearchMode]?: DatasetSearchModeEnum;
  [NodeInputKeyEnum.datasetSearchEmbeddingWeight]?: number;

  [NodeInputKeyEnum.datasetSearchUsingReRank]?: boolean;
  [NodeInputKeyEnum.datasetSearchRerankModel]?: RerankModelItemType;
  [NodeInputKeyEnum.datasetSearchRerankWeight]?: number;

  /*
    {
      tags: {
        $and: ["str1","str2"],
        $or: ["str1","str2",null] null means no tags
      },
      createTime: {
        $gte: 'xx',
        $lte: 'xxx'
      }
    }
  */
  collectionFilterMatch?: string;
};

export type SearchDatasetDataResponse = {
  searchRes: SearchDataResponseItemType[];
  embeddingTokens: number;
  reRankInputTokens: number;
  searchMode: `${DatasetSearchModeEnum}`;
  limit: number;
  similarity: number;
  usingReRank: boolean;
  usingSimilarityFilter: boolean;

  queryExtensionResult?: {
    llmModel: string;
    embeddingModel: string;
    requestId: string;
    seconds: number;
    inputTokens: number;
    outputTokens: number;
    usedUserOpenAIKey: boolean;
    embeddingTokens: number;
    query: string;
  };
  deepSearchResult?: { model: string; inputTokens: number; outputTokens: number };
  imageCaptionResult?: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    queries: string[];
  };
};

export const datasetDataReRank = async ({
  rerankModel,
  data,
  query
}: {
  rerankModel?: RerankModelItemType;
  data: SearchDataResponseItemType[];
  query: string;
}): Promise<{
  results: SearchDataResponseItemType[];
  inputTokens: number;
}> => {
  const { results, inputTokens } = await reRankRecall({
    model: rerankModel,
    query,
    documents: data.map((item) => ({
      id: item.id,
      text: `${item.q}\n${item.a}`.trim()
    }))
  });

  if (results.length === 0) {
    return Promise.reject('Rerank error');
  }

  // add new score to data
  const mergeResult = results
    .map((item, index) => {
      const target = data.find((dataItem) => dataItem.id === item.id);
      if (!target) return null;
      const score = item.score || 0;

      return {
        ...target,
        score: [{ type: SearchScoreTypeEnum.reRank, value: score, index }]
      };
    })
    .filter(Boolean) as SearchDataResponseItemType[];

  return {
    results: mergeResult,
    inputTokens
  };
};
export const filterDatasetDataByMaxTokens = async (
  data: SearchDataResponseItemType[],
  maxTokens: number
) => {
  const filterMaxTokensResult = await (async () => {
    // Count tokens
    const tokensScoreFilter = await Promise.all(
      data.map(async (item) => ({
        ...item,
        tokens: await countPromptTokens(item.q + item.a)
      }))
    );

    const results: SearchDataResponseItemType[] = [];
    let totalTokens = 0;

    for await (const item of tokensScoreFilter) {
      results.push(item);

      totalTokens += item.tokens;

      if (totalTokens > maxTokens) {
        break;
      }
    }

    return results.length === 0 ? data.slice(0, 1) : results;
  })();

  return filterMaxTokensResult;
};

export async function searchDatasetData(
  props: SearchDatasetDataProps
): Promise<SearchDatasetDataResponse> {
  const {
    teamId,
    reRankQuery,
    queries,
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
  let searchMode = inputSearchMode;
  let usingReRank = inputUsingReRank;

  // Constants data
  const datasetDataSelectField =
    '_id datasetId collectionId updateTime q a imageId imageDescMap chunkIndex indexes';
  const datsaetCollectionSelectField =
    '_id name fileId rawLink apiFileId externalFileId externalFileUrl';

  /* init params */
  searchMode = DatasetSearchModeMap[searchMode] ? searchMode : DatasetSearchModeEnum.embedding;
  usingReRank = usingReRank && !!getDefaultRerankModel();
  let imageCaptionResult: SearchDatasetDataResponse['imageCaptionResult'];

  // Compatible with topk limit
  let set = new Set<string>();
  let usingSimilarityFilter = false;

  /* function */
  const countRecallLimit = () => {
    if (searchMode === DatasetSearchModeEnum.embedding) {
      return {
        embeddingLimit: 100,
        fullTextLimit: 0
      };
    }
    if (searchMode === DatasetSearchModeEnum.fullTextRecall) {
      return {
        embeddingLimit: 0,
        fullTextLimit: 100
      };
    }
    return {
      embeddingLimit: 80,
      fullTextLimit: 60
    };
  };
  const getForbidData = async () => {
    const collections = await MongoDatasetCollection.find(
      {
        teamId,
        datasetId: { $in: datasetIds },
        forbid: true
      },
      '_id'
    );

    return {
      forbidCollectionIdList: collections.map((item) => String(item._id))
    };
  };

  /*
    Collection metadata filter
    标签过滤：
    1. and 先生效
    2. and 标签和 null 不能共存，否则返回空数组
  */
  const filterCollectionByMetadata = async (): Promise<string[] | undefined> => {
    const getAllCollectionIds = async ({
      parentCollectionIds
    }: {
      parentCollectionIds?: string[];
    }): Promise<string[] | undefined> => {
      if (!parentCollectionIds) return;
      if (parentCollectionIds.length === 0) {
        return [];
      }

      const collections = await MongoDatasetCollection.find(
        {
          teamId,
          datasetId: { $in: datasetIds },
          _id: { $in: parentCollectionIds }
        },
        '_id type',
        {
          ...readFromSecondary
        }
      ).lean();

      const resultIds = new Set<string>();
      collections.forEach((item) => {
        if (item.type !== 'folder') {
          resultIds.add(String(item._id));
        }
      });

      const folderIds = collections
        .filter((item) => item.type === 'folder')
        .map((item) => String(item._id));

      // Get all child collection ids
      if (folderIds.length) {
        const childCollections = await MongoDatasetCollection.find(
          {
            teamId,
            datasetId: { $in: datasetIds },
            parentId: { $in: folderIds }
          },
          '_id type',
          {
            ...readFromSecondary
          }
        ).lean();

        const childIds = await getAllCollectionIds({
          parentCollectionIds: childCollections.map((item) => String(item._id))
        });

        childIds?.forEach((id) => resultIds.add(id));
      }

      return Array.from(resultIds);
    };

    if (!collectionFilterMatch || !global.feConfigs.isPlus) return;

    let tagCollectionIdList: string[] | undefined = undefined;
    let createTimeCollectionIdList: string[] | undefined = undefined;
    let inputCollectionIdList: string[] | undefined = undefined;

    try {
      const jsonMatch =
        typeof collectionFilterMatch === 'object'
          ? collectionFilterMatch
          : json5.parse(collectionFilterMatch);

      const andTags = jsonMatch?.tags?.$and as (string | null)[] | undefined;
      const orTags = jsonMatch?.tags?.$or as (string | null)[] | undefined;

      if (andTags && andTags.length > 0) {
        const uniqueAndTags = Array.from(new Set(andTags));
        if (uniqueAndTags.includes(null) && uniqueAndTags.some((tag) => typeof tag === 'string')) {
          return [];
        }
        if (uniqueAndTags.every((tag) => typeof tag === 'string')) {
          const matchedTags = await MongoDatasetCollectionTags.find(
            {
              teamId,
              datasetId: { $in: datasetIds },
              tag: { $in: uniqueAndTags as string[] }
            },
            '_id datasetId tag',
            { ...readFromSecondary }
          ).lean();

          // Group tags by dataset
          const datasetTagMap = new Map<string, { tagIds: string[]; tagNames: Set<string> }>();

          matchedTags.forEach((tag) => {
            const datasetId = String(tag.datasetId);
            if (!datasetTagMap.has(datasetId)) {
              datasetTagMap.set(datasetId, {
                tagIds: [],
                tagNames: new Set()
              });
            }

            const datasetData = datasetTagMap.get(datasetId)!;
            datasetData.tagIds.push(String(tag._id));
            datasetData.tagNames.add(tag.tag);
          });

          const validDatasetIds = Array.from(datasetTagMap.entries())
            .filter(([, data]) => uniqueAndTags.every((tag) => data.tagNames.has(tag as string)))
            .map(([datasetId]) => datasetId);

          if (validDatasetIds.length === 0) return [];

          const collectionsPromises = validDatasetIds.map((datasetId) => {
            const { tagIds } = datasetTagMap.get(datasetId)!;
            return MongoDatasetCollection.find(
              {
                teamId,
                datasetId,
                tags: { $all: tagIds }
              },
              '_id',
              { ...readFromSecondary }
            ).lean();
          });

          const collectionsResults = await Promise.all(collectionsPromises);
          tagCollectionIdList = collectionsResults.flat().map((item) => String(item._id));
        } else if (uniqueAndTags.every((tag) => tag === null)) {
          const collections = await MongoDatasetCollection.find(
            {
              teamId,
              datasetId: { $in: datasetIds },
              $or: [{ tags: { $size: 0 } }, { tags: { $exists: false } }]
            },
            '_id',
            { ...readFromSecondary }
          ).lean();
          tagCollectionIdList = collections.map((item) => String(item._id));
        }
      } else if (orTags && orTags.length > 0) {
        // Get tagId by tag string
        const orTagArray = await MongoDatasetCollectionTags.find(
          {
            teamId,
            datasetId: { $in: datasetIds },
            tag: { $in: orTags.filter((tag) => tag !== null) }
          },
          '_id',
          { ...readFromSecondary }
        ).lean();
        const orTagIds = orTagArray.map((item) => String(item._id));

        // Get collections by tagId
        const collections = await MongoDatasetCollection.find(
          {
            teamId,
            datasetId: { $in: datasetIds },
            $or: [
              { tags: { $in: orTagIds } },
              ...(orTags.includes(null) ? [{ tags: { $size: 0 } }] : [])
            ]
          },
          '_id',
          { ...readFromSecondary }
        ).lean();

        tagCollectionIdList = collections.map((item) => String(item._id));
      }

      // time
      const getCreateTime = jsonMatch?.createTime?.$gte as string | undefined;
      const lteCreateTime = jsonMatch?.createTime?.$lte as string | undefined;
      if (getCreateTime || lteCreateTime) {
        const collections = await MongoDatasetCollection.find(
          {
            teamId,
            datasetId: { $in: datasetIds },
            createTime: {
              ...(getCreateTime && { $gte: new Date(getCreateTime) }),
              ...(lteCreateTime && {
                $lte: new Date(lteCreateTime)
              })
            }
          },
          '_id'
        );
        createTimeCollectionIdList = collections.map((item) => String(item._id));
      }

      // collectionIds
      const inputCollectionIds = jsonMatch?.collectionIds as string[] | undefined;
      if (Array.isArray(inputCollectionIds) && inputCollectionIds.length > 0) {
        inputCollectionIdList = await getAllCollectionIds({
          parentCollectionIds: inputCollectionIds
        });
        if (inputCollectionIdList && inputCollectionIdList.length === 0) {
          return [];
        }
      }

      // Concat tag, time and collectionIds
      const collectionIds = computeFilterIntersection([
        tagCollectionIdList,
        createTimeCollectionIdList,
        inputCollectionIdList
      ]);

      return await getAllCollectionIds({
        parentCollectionIds: collectionIds
      });
    } catch {}
  };
  type EmbeddingRecallSource = 'text' | 'imageCaption' | 'image';
  type FullTextRecallSource = 'text' | 'imageCaption';
  type VectorRecallTask = {
    source: EmbeddingRecallSource;
    vector: number[];
  };

  const emptyEmbeddingRecallResult = () => ({
    textEmbeddingRecallResults: [] as SearchDataResponseItemType[],
    imageCaptionEmbeddingRecallResults: [] as SearchDataResponseItemType[],
    imageVectorRecallResults: [] as SearchDataResponseItemType[]
  });

  const concatRecallLists = (lists: SearchDataResponseItemType[][], limit: number) => {
    return datasetSearchResultConcat(lists.map((list) => ({ weight: 1, list }))).slice(0, limit);
  };

  const getImageCaptionQueries = async (): Promise<{
    queries: string[];
    inputTokens: number;
    outputTokens: number;
  }> => {
    if (!vlmModel || queryImageUrls.length === 0) {
      return {
        queries: [],
        inputTokens: 0,
        outputTokens: 0
      };
    }

    const vlmModelData = getLLMModel(vlmModel);
    if (!vlmModelData?.vision) {
      return {
        queries: [],
        inputTokens: 0,
        outputTokens: 0
      };
    }

    const results = await Promise.all(
      queryImageUrls.map(async (url, index) => {
        try {
          const {
            answerText,
            usage: { inputTokens, outputTokens }
          } = await createLLMResponse({
            body: {
              model: vlmModelData.model,
              temperature: 0.1,
              stream: true,
              useVision: true,
              messages: [
                {
                  role: 'user',
                  content: [
                    {
                      type: 'image_url',
                      image_url: {
                        url: await normalizeImageToBase64(url)
                      }
                    },
                    {
                      type: 'text',
                      text: '请用一句话描述这张图片的主体、场景、颜色、文字和关键视觉特征。只输出描述，不要解释。'
                    }
                  ]
                }
              ] as any
            }
          });

          return {
            query: answerText.trim(),
            inputTokens,
            outputTokens
          };
        } catch (error) {
          logger.warn('Image caption generation failed during dataset search', {
            model: vlmModelData.model,
            imageIndex: index,
            error
          });

          return {
            query: '',
            inputTokens: 0,
            outputTokens: 0
          };
        }
      })
    );

    return {
      queries: results.map((item) => item.query).filter(Boolean),
      inputTokens: results.reduce((sum, item) => sum + item.inputTokens, 0),
      outputTokens: results.reduce((sum, item) => sum + item.outputTokens, 0)
    };
  };

  const buildVectorRecallTasks = async ({
    textQueries,
    imageCaptionQueries
  }: {
    textQueries: string[];
    imageCaptionQueries: string[];
  }): Promise<{
    tasks: VectorRecallTask[];
    tokens: number;
  }> => {
    const embeddingModel = getEmbeddingModel(model);
    const textTasks = [
      ...textQueries.map((query) => ({ source: 'text' as const, query })),
      ...imageCaptionQueries.map((query) => ({ source: 'imageCaption' as const, query }))
    ];

    const vectorInputs: {
      source: EmbeddingRecallSource;
      input: Parameters<typeof getVectors>[0]['inputs'][number];
    }[] = textTasks.map((item) => ({
      source: item.source,
      input: {
        type: 'text',
        input: item.query
      }
    }));

    if (queryImageUrls.length > 0 && isImageEmbeddingModel(embeddingModel)) {
      const imageInputs = (
        await Promise.all(
          queryImageUrls.map(async (url, index) => {
            try {
              return await normalizeImageToBase64(url);
            } catch (error) {
              // Image search is additive. A stale or unreadable image should not break text recall
              // or other valid images in the same request.
              logger.warn('Image embedding normalization failed during dataset search', {
                imageIndex: index,
                error
              });
            }
          })
        )
      )
        .filter((imageUrl): imageUrl is string => !!imageUrl)
        .map((imageUrl) => ({
          source: 'image',
          input: {
            type: 'image' as const,
            input: imageUrl
          }
        }));

      vectorInputs.push(...imageInputs);
    }

    if (vectorInputs.length === 0) {
      return {
        tasks: [],
        tokens: 0
      };
    }

    const { tokens, vectors } = await getVectors({
      model: embeddingModel,
      inputs: vectorInputs.map((item) => item.input),
      type: 'query'
    });
    const tasks = vectors.map((vector, index) => ({
      source: vectorInputs[index].source,
      vector
    }));

    return {
      tasks,
      tokens
    };
  };

  const embeddingRecall = async ({
    textQueries,
    imageCaptionQueries,
    limit,
    forbidCollectionIdList,
    filterCollectionIdList
  }: {
    textQueries: string[];
    imageCaptionQueries: string[];
    limit: number;
    forbidCollectionIdList: string[];
    filterCollectionIdList?: string[];
  }): Promise<
    ReturnType<typeof emptyEmbeddingRecallResult> & {
      tokens: number;
    }
  > => {
    if (limit === 0) {
      return {
        ...emptyEmbeddingRecallResult(),
        tokens: 0
      };
    }

    const { tasks, tokens } = await buildVectorRecallTasks({
      textQueries,
      imageCaptionQueries
    });

    if (tasks.length === 0) {
      return {
        ...emptyEmbeddingRecallResult(),
        tokens
      };
    }

    const recallResults = await Promise.all(
      tasks.map(async ({ vector }) => {
        return await recallFromVectorStore({
          teamId,
          datasetIds,
          vector,
          limit,
          forbidCollectionIdList,
          filterCollectionIdList
        });
      })
    );

    const collectionIdList = Array.from(
      new Set(recallResults.map((item) => item.results.map((item) => item.collectionId)).flat())
    );
    const indexDataIds = Array.from(
      new Set(recallResults.map((item) => item.results.map((item) => item.id?.trim())).flat())
    );

    const [dataMaps, collectionMaps] = await Promise.all([
      MongoDatasetData.find(
        {
          teamId,
          datasetId: { $in: datasetIds },
          collectionId: { $in: collectionIdList },
          'indexes.dataId': { $in: indexDataIds }
        },
        datasetDataSelectField,
        { ...readFromSecondary }
      )
        .lean()
        .then((res) => {
          const map = new Map<string, DatasetDataSchemaType>();

          res.forEach((item) => {
            item.indexes.forEach((index) => {
              map.set(String(index.dataId), item);
            });
          });

          return map;
        }),
      MongoDatasetCollection.find(
        {
          _id: { $in: collectionIdList }
        },
        datsaetCollectionSelectField,
        { ...readFromSecondary }
      )
        .lean()
        .then((res) => {
          const map = new Map<string, DatasetCollectionSchemaType>();

          res.forEach((item) => {
            map.set(String(item._id), item);
          });

          return map;
        })
    ]);

    const groupedRecallLists: Record<EmbeddingRecallSource, SearchDataResponseItemType[][]> = {
      text: [],
      imageCaption: [],
      image: []
    };

    recallResults.forEach((recallResult, taskIndex) => {
      const task = tasks[taskIndex];
      const set = new Set<string>();

      const list = recallResult.results
        .map((item, index) => {
          const collection = collectionMaps.get(String(item.collectionId));
          if (!collection) {
            logger.warn('Dataset collection not found during recall', {
              collectionId: item.collectionId,
              dataId: item.id
            });
            return;
          }

          const data = dataMaps.get(String(item.id?.trim()));
          if (!data) {
            logger.warn('Dataset data not found during recall', {
              dataId: item.id,
              collectionId: item.collectionId
            });
            return;
          }

          const result: SearchDataResponseItemType = {
            id: String(data._id),
            updateTime: data.updateTime,
            ...formatDatasetDataValue({
              q: data.q,
              a: data.a,
              imageId: data.imageId,
              imageDescMap: data.imageDescMap
            }),
            chunkIndex: data.chunkIndex,
            datasetId: String(data.datasetId),
            collectionId: String(data.collectionId),
            ...getCollectionSourceData(collection),
            score: [{ type: SearchScoreTypeEnum.embedding, value: item?.score || 0, index }]
          };

          return result;
        })
        .filter((item) => {
          if (!item) return false;
          if (set.has(item.id)) return false;
          set.add(item.id);
          return true;
        })
        .map((item, index) => {
          return {
            ...item!,
            score: item!.score.map((item) => ({ ...item, index }))
          };
        }) as SearchDataResponseItemType[];

      groupedRecallLists[task.source].push(list);
    });

    return {
      textEmbeddingRecallResults: concatRecallLists(groupedRecallLists.text, limit),
      imageCaptionEmbeddingRecallResults: concatRecallLists(groupedRecallLists.imageCaption, limit),
      imageVectorRecallResults: concatRecallLists(groupedRecallLists.image, limit),
      tokens
    };
  };
  const fullTextRecall = async ({
    queryGroups,
    limit,
    filterCollectionIdList,
    forbidCollectionIdList
  }: {
    queryGroups: {
      source: FullTextRecallSource;
      queries: string[];
    }[];
    limit: number;
    filterCollectionIdList?: string[];
    forbidCollectionIdList: string[];
  }): Promise<{
    textFullTextRecallResults: SearchDataResponseItemType[];
    imageCaptionFullTextRecallResults: SearchDataResponseItemType[];
  }> => {
    const queryTasks = queryGroups
      .map((group) => group.queries.map((query) => ({ source: group.source, query })))
      .flat();

    if (limit === 0) {
      return {
        textFullTextRecallResults: [],
        imageCaptionFullTextRecallResults: []
      };
    }
    if (queryTasks.length === 0) {
      return {
        textFullTextRecallResults: [],
        imageCaptionFullTextRecallResults: []
      };
    }

    const recallResults = await Promise.all(
      queryTasks.map(async ({ query }) => {
        return (await MongoDatasetDataText.aggregate(
          [
            {
              $match: {
                teamId: new Types.ObjectId(teamId),
                $text: { $search: await jiebaSplit({ text: query }) },
                datasetId: { $in: datasetIds.map((id) => new Types.ObjectId(id)) },
                ...(filterCollectionIdList
                  ? {
                      collectionId: {
                        $in: filterCollectionIdList
                          .filter((id) => !forbidCollectionIdList.includes(id))
                          .map((id) => new Types.ObjectId(id))
                      }
                    }
                  : forbidCollectionIdList?.length
                    ? {
                        collectionId: {
                          $nin: forbidCollectionIdList.map((id) => new Types.ObjectId(id))
                        }
                      }
                    : {})
              }
            },
            {
              $sort: {
                score: { $meta: 'textScore' }
              }
            },
            {
              $limit: limit
            },
            {
              $project: {
                _id: 1,
                collectionId: 1,
                dataId: 1,
                score: { $meta: 'textScore' }
              }
            }
          ],
          {
            ...readFromSecondary
          }
        )) as (DatasetDataTextSchemaType & { score: number })[];
      })
    );

    const dataIds = Array.from(
      new Set(recallResults.map((item) => item.map((item) => item.dataId)).flat())
    );
    const collectionIds = Array.from(
      new Set(recallResults.map((item) => item.map((item) => item.collectionId)).flat())
    );

    // Get data and collections
    const [dataMaps, collectionMaps] = await Promise.all([
      MongoDatasetData.find(
        {
          _id: { $in: dataIds }
        },
        datasetDataSelectField,
        { ...readFromSecondary }
      )
        .lean()
        .then((res) => {
          const map = new Map<string, DatasetDataSchemaType>();

          res.forEach((item) => {
            map.set(String(item._id), item);
          });

          return map;
        }),
      MongoDatasetCollection.find(
        {
          _id: { $in: collectionIds }
        },
        datsaetCollectionSelectField,
        { ...readFromSecondary }
      )
        .lean()
        .then((res) => {
          const map = new Map<string, DatasetCollectionSchemaType>();

          res.forEach((item) => {
            map.set(String(item._id), item);
          });

          return map;
        })
    ]);

    const groupedRecallLists: Record<FullTextRecallSource, SearchDataResponseItemType[][]> = {
      text: [],
      imageCaption: []
    };

    recallResults.forEach((recallResult, taskIndex) => {
      const task = queryTasks[taskIndex];
      const list = recallResult
        .map((item, index) => {
          const collection = collectionMaps.get(String(item.collectionId));
          if (!collection) {
            logger.warn('Dataset collection not found during full-text recall', {
              collectionId: item.collectionId,
              dataId: item.dataId
            });
            return;
          }

          const data = dataMaps.get(String(item.dataId));
          if (!data) {
            logger.warn('Dataset data not found during full-text recall', {
              dataId: item.dataId,
              collectionId: item.collectionId
            });
            return;
          }

          return {
            id: String(data._id),
            datasetId: String(data.datasetId),
            collectionId: String(data.collectionId),
            updateTime: data.updateTime,
            ...formatDatasetDataValue({
              q: data.q,
              a: data.a,
              imageId: data.imageId,
              imageDescMap: data.imageDescMap
            }),
            chunkIndex: data.chunkIndex,
            indexes: data.indexes,
            ...getCollectionSourceData(collection),
            score: [
              {
                type: SearchScoreTypeEnum.fullText,
                value: item.score || 0,
                index
              }
            ]
          };
        })
        .filter((item) => {
          if (!item) return false;
          return true;
        })
        .map((item, index) => {
          return {
            ...item,
            score: item!.score.map((item) => ({ ...item, index }))
          };
        }) as SearchDataResponseItemType[];

      groupedRecallLists[task.source].push(list);
    });

    return {
      textFullTextRecallResults: concatRecallLists(groupedRecallLists.text, limit),
      imageCaptionFullTextRecallResults: concatRecallLists(groupedRecallLists.imageCaption, limit)
    };
  };
  const multiQueryRecall = async ({
    embeddingLimit,
    fullTextLimit,
    textQueries,
    imageCaptionQueries
  }: {
    embeddingLimit: number;
    fullTextLimit: number;
    textQueries: string[];
    imageCaptionQueries: string[];
  }) => {
    const [{ forbidCollectionIdList }, filterCollectionIdList] = await Promise.all([
      getForbidData(),
      filterCollectionByMetadata()
    ]);

    const [
      {
        tokens,
        textEmbeddingRecallResults,
        imageCaptionEmbeddingRecallResults,
        imageVectorRecallResults
      },
      { textFullTextRecallResults, imageCaptionFullTextRecallResults }
    ] = await Promise.all([
      embeddingRecall({
        textQueries,
        imageCaptionQueries,
        limit: embeddingLimit,
        forbidCollectionIdList,
        filterCollectionIdList
      }),
      fullTextRecall({
        queryGroups: [
          { source: 'text', queries: textQueries },
          { source: 'imageCaption', queries: imageCaptionQueries }
        ],
        limit: fullTextLimit,
        filterCollectionIdList,
        forbidCollectionIdList
      })
    ]);

    return {
      tokens,
      textEmbeddingRecallResults,
      imageCaptionEmbeddingRecallResults,
      imageVectorRecallResults,
      textFullTextRecallResults,
      imageCaptionFullTextRecallResults
    };
  };

  const concatWeightedRecallLists = (
    lists: { weight: number; list: SearchDataResponseItemType[] }[]
  ) => {
    return datasetSearchResultConcat(
      lists.filter((item) => item.weight > 0 && item.list.length > 0)
    );
  };

  /* main step */
  const imageCaptionQueries = await getImageCaptionQueries();
  if (imageCaptionQueries.queries.length > 0 && vlmModel) {
    imageCaptionResult = {
      model: getLLMModel(vlmModel).model,
      inputTokens: imageCaptionQueries.inputTokens,
      outputTokens: imageCaptionQueries.outputTokens,
      queries: imageCaptionQueries.queries
    };
  }
  const activeReRankQuery = reRankQuery;
  usingReRank = usingReRank && !!activeReRankQuery && !!getDefaultRerankModel();

  // count limit
  const { embeddingLimit, fullTextLimit } = countRecallLimit();

  // recall
  const {
    textEmbeddingRecallResults,
    imageCaptionEmbeddingRecallResults,
    imageVectorRecallResults,
    textFullTextRecallResults,
    imageCaptionFullTextRecallResults,
    tokens: embeddingTokens
  } = await multiQueryRecall({
    embeddingLimit,
    fullTextLimit,
    textQueries: queries,
    imageCaptionQueries: imageCaptionQueries.queries
  });
  const textRecallResults = concatWeightedRecallLists([
    { weight: embeddingWeight, list: textEmbeddingRecallResults },
    { weight: 1 - embeddingWeight, list: textFullTextRecallResults }
  ]);
  const imageCaptionRecallResults = concatWeightedRecallLists([
    { weight: embeddingWeight, list: imageCaptionEmbeddingRecallResults },
    { weight: 1 - embeddingWeight, list: imageCaptionFullTextRecallResults }
  ]);

  // ReRank results
  const { results: reRankResults, inputTokens: reRankInputTokens } = await (async () => {
    if (!usingReRank || textRecallResults.length === 0) {
      usingReRank = false;
      return {
        results: [],
        inputTokens: 0
      };
    }

    // remove same q and a data
    set = new Set<string>();
    const filterSameDataResults = textRecallResults.filter((item) => {
      // 删除所有的标点符号与空格等，只对文本进行比较
      const str = hashStr(`${item.q}${item.a}`.replace(/[^\p{L}\p{N}]/gu, ''));
      if (set.has(str)) return false;
      set.add(str);
      return true;
    });
    try {
      return await datasetDataReRank({
        rerankModel,
        query: reRankQuery,
        data: filterSameDataResults
      });
    } catch {
      usingReRank = false;
      return {
        results: [],
        inputTokens: 0
      };
    }
  })();

  const textRerankRecallResults = (() => {
    if (reRankResults.length === 0) return textRecallResults;
    if (rerankWeight === 1) return reRankResults;

    return concatWeightedRecallLists([
      { weight: 1 - rerankWeight, list: textRecallResults },
      { weight: rerankWeight, list: reRankResults }
    ]);
  })();
  const hasTextQuery = queries.some((item) => item.trim());
  const finalTextRecallWeight = 1;
  const finalImageRecallWeight = hasTextQuery ? 0.7 : 1;
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
  const rrfConcatResults = concatWeightedRecallLists([
    {
      weight: textRerankRecallResults.length > 0 ? finalTextRecallWeight : 0,
      list: textRerankRecallResults
    },
    {
      weight: imageRecallResults.length > 0 ? finalImageRecallWeight : 0,
      list: imageRecallResults
    }
  ]);

  // remove same q and a data
  set = new Set<string>();
  const filterSameDataResults = rrfConcatResults.filter((item) => {
    // 删除所有的标点符号与空格等，只对文本进行比较
    const str = hashStr(`${item.q}${item.a}`.replace(/[^\p{L}\p{N}]/gu, ''));
    if (set.has(str)) return false;
    set.add(str);
    return true;
  });

  // score filter
  const scoreFilter = (() => {
    if (usingReRank) {
      usingSimilarityFilter = true;

      return filterSameDataResults.filter((item) => {
        const reRankScore = item.score.find((item) => item.type === SearchScoreTypeEnum.reRank);
        if (reRankScore && reRankScore.value < similarity) return false;
        return true;
      });
    }
    if (searchMode === DatasetSearchModeEnum.embedding) {
      usingSimilarityFilter = true;
      return filterSameDataResults.filter((item) => {
        const embeddingScore = item.score.find(
          (item) => item.type === SearchScoreTypeEnum.embedding
        );
        if (embeddingScore && embeddingScore.value < similarity) return false;
        return true;
      });
    }
    return filterSameDataResults;
  })();

  // token filter
  const filterMaxTokensResult = await filterDatasetDataByMaxTokens(scoreFilter, maxTokens);

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
    usingReRank,
    usingSimilarityFilter,
    imageCaptionResult
  };
}

export type DefaultSearchDatasetDataProps = SearchDatasetDataProps & {
  [NodeInputKeyEnum.datasetSearchUsingExtensionQuery]?: boolean;
  [NodeInputKeyEnum.datasetSearchExtensionModel]?: string;
  [NodeInputKeyEnum.datasetSearchExtensionBg]?: string;
  userKey?: OpenaiAccountType;
};
export const defaultSearchDatasetData = async ({
  datasetSearchUsingExtensionQuery,
  datasetSearchExtensionModel,
  datasetSearchExtensionBg,
  userKey,
  ...props
}: DefaultSearchDatasetDataProps): Promise<SearchDatasetDataResponse> => {
  const query = props.queries[0] || '';
  const histories = props.histories;

  const { searchQueries, reRankQuery, aiExtensionResult } = query
    ? await datasetSearchQueryExtension({
        query,
        llmModel: datasetSearchUsingExtensionQuery
          ? getLLMModel(datasetSearchExtensionModel)?.model
          : undefined,
        embeddingModel: props.model,
        extensionBg: datasetSearchExtensionBg,
        histories,
        userKey
      })
    : {
        searchQueries: [],
        reRankQuery: '',
        aiExtensionResult: undefined
      };

  const result = await searchDatasetData({
    ...props,
    reRankQuery: reRankQuery,
    queries: searchQueries
  });

  return {
    ...result,
    queryExtensionResult: aiExtensionResult
      ? {
          llmModel: aiExtensionResult.llmModel,
          requestId: aiExtensionResult.requestId,
          seconds: aiExtensionResult.seconds,
          inputTokens: aiExtensionResult.inputTokens,
          outputTokens: aiExtensionResult.outputTokens,
          usedUserOpenAIKey: aiExtensionResult.usedUserOpenAIKey,
          embeddingModel: aiExtensionResult.embeddingModel,
          embeddingTokens: aiExtensionResult.embeddingTokens,
          query: searchQueries.join('\n')
        }
      : undefined
  };
};

export type DeepRagSearchProps = SearchDatasetDataProps & {
  [NodeInputKeyEnum.datasetDeepSearchModel]?: string;
  [NodeInputKeyEnum.datasetDeepSearchMaxTimes]?: number;
  [NodeInputKeyEnum.datasetDeepSearchBg]?: string;
};
export const deepRagSearch = (data: DeepRagSearchProps) => global.deepRagHandler(data);
