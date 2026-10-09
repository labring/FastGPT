import { getTeamModelHandle } from '@fastgpt/service/core/ai/model/index';
import { getDatasetModelReference } from '@fastgpt/service/core/dataset/model';

/* Dataset collection source parse, not max size. */

import { ParagraphChunkAIModeEnum } from '@fastgpt/global/core/dataset/constants';
import {
  DatasetCollectionDataProcessModeEnum,
  DatasetCollectionTypeEnum,
  DatasetSourceReadTypeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import type {
  DatasetCollectionSchemaType,
  DatasetSchemaType
} from '@fastgpt/global/core/dataset/type';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { checkTeamAiPointsAndLock } from './utils';
import { delay } from '@fastgpt/global/common/system/utils';
import { getDatasetIultmzhFileParseConfig } from '@fastgpt/service/thirdProvider/sangfor/parseConfig';
import { rawText2Chunks, readDatasetSourceRawText } from '@fastgpt/service/core/dataset/read';
import { getLLMMaxChunkSize } from '@fastgpt/global/core/dataset/training/utils';
import { checkDatasetIndexLimit } from '@fastgpt/service/support/permission/teamLimit';
import { predictDataLimitLength } from '@fastgpt/global/core/dataset/utils';
import { getTrainingModeByCollection } from '@fastgpt/service/core/dataset/collection/utils';
import { getDatasetImageIndexCapability } from '@fastgpt/service/core/dataset/utils';
import {
  preCreateDatasetDataAndPushToTrainingQueue,
  pushDataListToTrainingQueue
} from '@fastgpt/service/core/dataset/training/controller';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { postCreateParagraphTitle } from '@fastgpt/service/thirdProvider/fastgptPro/api';
import { pushLLMTrainingUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { UsageItemTypeEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { getModelReferenceValue, isEmptyModelValue } from '@fastgpt/global/core/ai/model/reference';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import {
  claimTrainingTask,
  TrainingLeaseLostError
} from '@fastgpt/service/core/dataset/training/service';

const logger = getLogger(LogCategories.MODULE.DATASET.FILE_PARSE);

/** 自动 AI 分段失败回退原文；强制模式的错误由解析任务重试，成功用量由调用方记账。 */
const requestLLMPargraph = async ({
  rawText,
  modelId,
  teamId,
  billId,
  paragraphChunkAIMode
}: {
  rawText: string;
  modelId?: string;
  teamId: string;
  billId: string;
  paragraphChunkAIMode?: ParagraphChunkAIModeEnum;
}) => {
  if (
    !global.feConfigs?.isPlus ||
    !paragraphChunkAIMode ||
    paragraphChunkAIMode === ParagraphChunkAIModeEnum.forbid
  ) {
    return {
      resultText: rawText,
      totalInputTokens: 0,
      totalOutputTokens: 0
    };
  }

  if (paragraphChunkAIMode === ParagraphChunkAIModeEnum.auto) {
    // Check if the text contains Markdown header structure
    const hasMarkdownHeaders = /^(#+)\s/m.test(rawText);
    const hasMultipleHeaders = (rawText.match(/^(#+)\s/gm) || []).length > 1;

    const isMarkdown = hasMarkdownHeaders && hasMultipleHeaders;

    if (isMarkdown) {
      return {
        resultText: rawText,
        totalInputTokens: 0,
        totalOutputTokens: 0
      };
    }
  }

  try {
    return await postCreateParagraphTitle({ rawText, modelId, teamId, billId });
  } catch (error) {
    if (paragraphChunkAIMode !== ParagraphChunkAIModeEnum.auto) throw error;
    // 自动分段只是增强能力，失败时保留原文，不伪造成功用量。
    logger.warn('Automatic AI paragraph skipped after failure', { teamId, modelId, billId, error });
    return {
      resultText: rawText,
      totalInputTokens: 0,
      totalOutputTokens: 0
    };
  }
};

const reduceQueue = () => {
  global.datasetParseQueueLen =
    global.datasetParseQueueLen > 0 ? global.datasetParseQueueLen - 1 : 0;

  return global.datasetParseQueueLen === 0;
};

/** 读取并分块原文；共用训练租约，解析失败才扣重试次数，容量不足则暂停等待恢复。 */
export const datasetParseQueue = async (): Promise<any> => {
  const max = global.systemEnv?.datasetParseMaxProcess || 10;
  logger.debug('Parse queue size check', { queueSize: global.datasetParseQueueLen, max });
  if (global.datasetParseQueueLen >= max) return;
  global.datasetParseQueueLen++;

  try {
    while (true) {
      const startTime = Date.now();

      let claimed;
      try {
        claimed = await claimTrainingTask<{
          dataset: DatasetSchemaType;
          collection: DatasetCollectionSchemaType;
        }>({
          mode: TrainingModeEnum.parse,
          populate: [{ path: 'collection', select: '-qaPrompt' }, { path: 'dataset' }]
        });
      } catch (error) {
        logger.error('Parse queue fetch task failed', { error });
        await delay(500);
        continue;
      }
      if (!claimed) break;
      const { data, lease: taskLease } = claimed;

      try {
        taskLease.start();
        // Check team points and lock(No mistakes will be thrown here)
        if (!(await checkTeamAiPointsAndLock(data.teamId, String(data._id)))) {
          continue;
        }

        const dataset = data.dataset;
        const collection = data.collection;

        if (!dataset || !collection) {
          logger.warn('Parse queue task skipped: dataset or collection missing', {
            datasetId: data.datasetId,
            collectionId: data.collectionId,
            trainingId: data._id
          });
          await taskLease.complete();
          continue;
        }
        logger.info('Parse queue task started', {
          trainingId: data._id,
          datasetId: data.datasetId,
          collectionId: data.collectionId,
          teamId: data.teamId,
          tmbId: data.tmbId,
          collectionType: collection.type,
          trainingType: collection.trainingType
        });

        try {
          // 解析阶段只严格校验向量模型；辅助模型仅取分块元数据，不校验启用或可调用状态。
          const modelHandle = await getTeamModelHandle({ teamId: String(dataset.teamId) });
          const embeddingModelData = modelHandle.getEmbeddingModelData(
            getDatasetModelReference(dataset, 'embedding')
          );
          const agentModelData = modelHandle.findModelData(
            getDatasetModelReference(dataset, 'agent'),
            { type: 'llm' }
          );
          const vlmModelData = modelHandle.findModelData(getDatasetModelReference(dataset, 'vlm'), {
            type: 'llm',
            vision: true
          });
          const vlmModelConfigured = !isEmptyModelValue(
            getModelReferenceValue({ modelId: dataset.vlmModelId, model: dataset.vlmModel })
          );
          const trainingMode = getTrainingModeByCollection({
            trainingType: collection.trainingType ?? DatasetCollectionDataProcessModeEnum.chunk,
            autoIndexes: collection.autoIndexes,
            imageIndex: collection.imageIndex,
            supportImageIndex:
              vlmModelConfigured ||
              getDatasetImageIndexCapability({ vectorModel: embeddingModelData }).supportImageIndex
          });

          // 1. Parse rawtext
          const sourceReadType = await (async () => {
            if (collection.type === DatasetCollectionTypeEnum.link) {
              if (!collection.rawLink) return Promise.reject('rawLink is missing');
              return {
                type: DatasetSourceReadTypeEnum.link,
                sourceId: collection.rawLink,
                selector: collection.metadata?.webPageSelector
              };
            }
            if (collection.type === DatasetCollectionTypeEnum.file) {
              if (!collection.fileId) return Promise.reject('fileId is missing');
              return {
                type: DatasetSourceReadTypeEnum.fileLocal,
                sourceId: String(collection.fileId)
              };
            }
            if (collection.type === DatasetCollectionTypeEnum.apiFile) {
              if (!collection.apiFileId) return Promise.reject('apiFileId is missing');
              return {
                type: DatasetSourceReadTypeEnum.apiFile,
                sourceId: collection.apiFileId,
                apiDatasetServer: dataset.apiDatasetServer
              };
            }
            if (collection.type === DatasetCollectionTypeEnum.externalFile) {
              if (!collection.externalFileUrl) return Promise.reject('externalFileId is missing');
              return {
                type: DatasetSourceReadTypeEnum.externalFile,
                sourceId: collection.externalFileUrl,
                externalFileId: collection.externalFileId
              };
            }

            return null;
          })();

          if (!sourceReadType) {
            logger.warn('Parse queue task skipped: source read type resolved to null', {
              trainingId: data._id,
              datasetId: data.datasetId,
              collectionId: data.collectionId,
              collectionType: collection.type
            });
            await taskLease.complete();
            continue;
          }

          const { title, rawText } = await readDatasetSourceRawText({
            teamId: data.teamId,
            tmbId: data.tmbId,
            customPdfParse: collection.customPdfParse,
            // 解析开关仅对外部解析路径生效;非 customPdfParse 时传 undefined,rawText 缓存沿用旧 key
            sangforFileParseConfig: collection.customPdfParse
              ? getDatasetIultmzhFileParseConfig(dataset)
              : undefined,
            usageId: data.billId,
            datasetId: data.datasetId,
            ...sourceReadType
          });

          // 3. LLM Pargraph
          const { resultText, totalInputTokens, totalOutputTokens } = await requestLLMPargraph({
            rawText,
            modelId: agentModelData?.modelId ?? dataset.agentModelId,
            teamId: String(data.teamId),
            billId: data.billId,
            paragraphChunkAIMode: collection.paragraphChunkAIMode
          });
          // 跳过 AI 分段时没有用量，不要求文本模型存在；实际消耗不能在缺少计费元数据时静默漏记。
          if (totalInputTokens > 0 || totalOutputTokens > 0) {
            if (!agentModelData)
              throw new Error('AI paragraph model metadata unavailable for billing');
            pushLLMTrainingUsage({
              teamId: data.teamId,
              model: agentModelData,
              inputTokens: totalInputTokens,
              outputTokens: totalOutputTokens,
              usageId: data.billId,
              type: UsageItemTypeEnum.training_paragraph
            });
          }

          // 4. Chunk split
          const chunks = await rawText2Chunks({
            rawText: resultText,
            chunkTriggerType: collection.chunkTriggerType,
            chunkTriggerMinSize: collection.chunkTriggerMinSize,
            chunkSize: collection.chunkSize,
            paragraphChunkDeep: collection.paragraphChunkDeep,
            paragraphChunkMinSize: collection.paragraphChunkMinSize,
            maxSize: getLLMMaxChunkSize(agentModelData),
            overlapRatio:
              collection.trainingType === DatasetCollectionDataProcessModeEnum.chunk ? 0.2 : 0,
            customReg: collection.chunkSplitter ? [collection.chunkSplitter] : [],
            chunkSettingMode: collection.chunkSettingMode,
            trainingType: collection.trainingType,
            backupParse: collection.trainingType === DatasetCollectionDataProcessModeEnum.backup
          });

          // Check dataset limit
          await checkDatasetIndexLimit({
            teamId: data.teamId,
            insertLen: Math.round(predictDataLimitLength(trainingMode, chunks) * 0.7)
          });

          const trainingData = chunks.map((item, index) => ({
            ...item,
            indexes: item.indexes?.map((text) => ({
              type: DatasetDataIndexTypeEnum.custom,
              text
            })),
            chunkIndex: index
          }));

          // 同一租约事务中写入分块并删除解析任务；失去所有权时全部回滚。
          await taskLease.complete(async (session) => {
            // 5. Update collection title(Link)
            await MongoDatasetCollection.updateOne(
              { _id: collection._id },
              {
                ...(title && { name: title }),
                rawTextLength: resultText.length,
                hashRawText: hashStr(resultText)
              },
              { session }
            );

            // QA 需要先完成模型生成，成功后才创建最终数据；其它模式可以先写 indexing 数据。
            if (trainingMode === TrainingModeEnum.qa) {
              await pushDataListToTrainingQueue({
                teamId: data.teamId,
                tmbId: data.tmbId,
                datasetId: dataset._id,
                collectionId: collection._id,
                agentModel: agentModelData,
                vectorModel: embeddingModelData,
                vlmModel: vlmModelData,
                vlmModelConfigured,
                indexSize: collection.indexSize,
                mode: TrainingModeEnum.qa,
                billId: data.billId,
                data: trainingData,
                session
              });
            } else {
              await preCreateDatasetDataAndPushToTrainingQueue({
                teamId: data.teamId,
                tmbId: data.tmbId,
                datasetId: dataset._id,
                collectionId: collection._id,
                agentModel: agentModelData,
                vectorModel: embeddingModelData,
                vlmModel: vlmModelData,
                vlmModelConfigured,
                indexSize: collection.indexSize,
                mode: trainingMode,
                billId: data.billId,
                data: trainingData,
                session
              });
            }
          });

          logger.debug('Parse queue task finished', {
            durationMs: Date.now() - startTime,
            trainingId: data._id,
            datasetId: data.datasetId,
            collectionId: data.collectionId
          });
        } catch (err) {
          if (err instanceof TrainingLeaseLostError) continue;
          if (err === TeamErrEnum.datasetSizeNotEnough) {
            logger.info('Parse queue dataset limit exceeded, locking task', {
              trainingId: data._id,
              datasetId: data.datasetId,
              collectionId: data.collectionId
            });
            await taskLease.fail(i18nT('common:code_error.team_error.dataset_size_not_enough'), {
              blocked: true
            });

            continue;
          }

          logger.error('Parse queue task failed', {
            error: err,
            trainingId: data._id,
            datasetId: data.datasetId,
            collectionId: data.collectionId
          });

          await taskLease.fail(err, { retryDelayMs: 0 });

          await delay(100);
        }
      } finally {
        await taskLease.stop();
      }
    }
  } catch (error) {
    logger.error('Parse queue loop failed', { error });
  } finally {
    if (reduceQueue()) {
      logger.info('Parse queue drained', { queueSize: global.datasetParseQueueLen });
    }

    logger.debug('Parse queue loop exit', { queueSize: global.datasetParseQueueLen });
  }
};
