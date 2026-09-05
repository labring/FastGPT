import { ensureModelCatalogReady } from '@fastgpt/service/core/ai/config/runtime';
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
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { addMinutes } from 'date-fns';
import { checkTeamAiPointsAndLock } from './utils';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { delay } from '@fastgpt/global/common/system/utils';
import { rawText2Chunks, readDatasetSourceRawText } from '@fastgpt/service/core/dataset/read';
import {
  getDatasetAgentModel,
  getDatasetEmbeddingModel,
  getDatasetVlmModel
} from '@fastgpt/service/core/dataset/model';
import { getLLMMaxChunkSize } from '@fastgpt/global/core/dataset/training/utils';
import { checkDatasetIndexLimit } from '@fastgpt/service/support/permission/teamLimit';
import { predictDataLimitLength } from '@fastgpt/global/core/dataset/utils';
import { getTrainingModeByCollection } from '@fastgpt/service/core/dataset/collection/utils';
import { getDatasetImageIndexCapability } from '@fastgpt/service/core/dataset/utils';
import { pushDataListToTrainingQueue } from '@fastgpt/service/core/dataset/training/controller';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { POST } from '@fastgpt/service/common/api/plusRequest';
import { pushLLMTrainingUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { UsageItemTypeEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { UserError } from '@fastgpt/global/common/error/utils';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import { createParseTaskLease, PARSE_QUEUE_LEASE_TIMEOUT_MINUTES } from './parseLease';

const logger = getLogger(LogCategories.MODULE.DATASET.FILE_PARSE);

const requestLLMPargraph = async ({
  rawText,
  modelId,
  teamId,
  billId,
  paragraphChunkAIMode
}: {
  rawText: string;
  modelId: string;
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
    const hasMultipleHeaders = (rawText.match(/^(#+)\s/g) || []).length > 1;

    const isMarkdown = hasMarkdownHeaders && hasMultipleHeaders;

    if (isMarkdown) {
      return {
        resultText: rawText,
        totalInputTokens: 0,
        totalOutputTokens: 0
      };
    }
  }

  const data = await POST<{
    resultText: string;
    totalInputTokens: number;
    totalOutputTokens: number;
  }>(
    '/core/dataset/training/llmPargraph',
    {
      rawText,
      modelId,
      teamId,
      billId
    },
    { timeout: 600000 }
  );

  return data;
};

const reduceQueue = () => {
  global.datasetParseQueueLen =
    global.datasetParseQueueLen > 0 ? global.datasetParseQueueLen - 1 : 0;

  return global.datasetParseQueueLen === 0;
};

export const datasetParseQueue = async (): Promise<any> => {
  const max = global.systemEnv?.datasetParseMaxProcess || 10;
  logger.debug('Parse queue size check', { queueSize: global.datasetParseQueueLen, max });
  if (global.datasetParseQueueLen >= max) return;
  global.datasetParseQueueLen++;

  try {
    while (true) {
      await ensureModelCatalogReady();
      const startTime = Date.now();

      // 1. Get task and lock 10 minutes ago
      const {
        data,
        done = false,
        error = false
      } = await (async () => {
        try {
          const claimedLockTime = new Date();
          const data = await MongoDatasetTraining.findOneAndUpdate(
            {
              mode: TrainingModeEnum.parse,
              retryCount: { $gt: 0 },
              lockTime: {
                $lte: addMinutes(new Date(), -PARSE_QUEUE_LEASE_TIMEOUT_MINUTES)
              }
            },
            {
              lockTime: claimedLockTime,
              $inc: { retryCount: -1 }
            },
            { new: true }
          )
            .populate<{
              dataset: DatasetSchemaType;
              collection: DatasetCollectionSchemaType;
            }>([
              {
                path: 'collection',
                select: '-qaPrompt'
              },
              {
                path: 'dataset'
              }
            ])
            .lean();

          // task preemption
          if (!data) {
            return {
              done: true
            };
          }
          return {
            data
          };
        } catch {
          return {
            error: true
          };
        }
      })();

      if (done || !data) {
        break;
      }
      if (error) {
        logger.error('Parse queue fetch task failed', { error });
        await delay(500);
        continue;
      }
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
        const deleteResult = await MongoDatasetTraining.deleteOne({
          _id: data._id,
          lockTime: data.lockTime
        });
        if (deleteResult.deletedCount !== 1) {
          logger.warn('Parse queue task lease lost before deleting incomplete task', {
            trainingId: data._id
          });
        }
        continue;
      }
      const agentModelData = getDatasetAgentModel(dataset);
      const embeddingModelData = getDatasetEmbeddingModel(dataset);
      const vlmModelData = getDatasetVlmModel(dataset);

      logger.info('Parse queue task started', {
        trainingId: data._id,
        datasetId: data.datasetId,
        collectionId: data.collectionId,
        teamId: data.teamId,
        tmbId: data.tmbId,
        collectionType: collection.type,
        trainingType: collection.trainingType
      });

      const taskLease = createParseTaskLease({
        taskId: data._id,
        lockTime: data.lockTime,
        updateLock: async (filter, nextLockTime) => {
          const result = await MongoDatasetTraining.updateOne(filter, {
            lockTime: nextLockTime
          });
          return result.matchedCount === 1;
        },
        onLost: () => {
          logger.warn('Parse queue task lease lost', {
            trainingId: data._id,
            datasetId: data.datasetId,
            collectionId: data.collectionId
          });
        },
        onError: (error) => {
          logger.warn('Parse queue task lease heartbeat failed', {
            trainingId: data._id,
            error
          });
        }
      });
      taskLease.start();

      try {
        const trainingMode = getTrainingModeByCollection({
          trainingType: collection.trainingType ?? DatasetCollectionDataProcessModeEnum.chunk,
          autoIndexes: collection.autoIndexes,
          imageIndex: collection.imageIndex,
          supportImageIndex: getDatasetImageIndexCapability({
            vectorModel: embeddingModelData,
            vlmModel: vlmModelData
          }).supportImageIndex
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
          await taskLease.stop();
          const deleteResult = await MongoDatasetTraining.deleteOne(taskLease.getFilter());
          if (deleteResult.deletedCount !== 1) {
            logger.warn('Parse queue task lease lost before deleting invalid task', {
              trainingId: data._id
            });
          }
          continue;
        }

        const { title, rawText } = await readDatasetSourceRawText({
          teamId: data.teamId,
          tmbId: data.tmbId,
          customPdfParse: collection.customPdfParse,
          usageId: data.billId,
          datasetId: data.datasetId,
          ...sourceReadType
        });

        // 3. LLM Pargraph
        if (!agentModelData.modelId) throw new UserError(ModelErrEnum.unExist);
        const { resultText, totalInputTokens, totalOutputTokens } = await requestLLMPargraph({
          rawText,
          modelId: agentModelData.modelId,
          teamId: String(data.teamId),
          billId: data.billId,
          paragraphChunkAIMode: collection.paragraphChunkAIMode
        });
        // Push usage
        pushLLMTrainingUsage({
          teamId: data.teamId,
          model: agentModelData,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          usageId: data.billId,
          type: UsageItemTypeEnum.training_paragraph
        });

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

        // 成功写入前先停止续租，并等待正在进行的 heartbeat 完成，保证下面使用最新 lease。
        await taskLease.stop();
        await mongoSessionRun(async (session) => {
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

          // 6. Push to chunk queue
          await pushDataListToTrainingQueue({
            teamId: data.teamId,
            tmbId: data.tmbId,
            datasetId: dataset._id,
            collectionId: collection._id,
            agentModel: agentModelData,
            vectorModel: embeddingModelData,
            vlmModel: vlmModelData,
            indexSize: collection.indexSize,
            mode: trainingMode,
            billId: data.billId,
            data: trainingData,
            session
          });

          // 7. Delete task
          const deleteResult = await MongoDatasetTraining.deleteOne(taskLease.getFilter(), {
            session
          });
          if (deleteResult.deletedCount !== 1) {
            throw new Error('Parse queue task lease lost before completion');
          }
        });

        logger.debug('Parse queue task finished', {
          durationMs: Date.now() - startTime,
          trainingId: data._id,
          datasetId: data.datasetId,
          collectionId: data.collectionId
        });
      } catch (err) {
        await taskLease.stop();
        if (err === TeamErrEnum.datasetSizeNotEnough) {
          logger.info('Parse queue dataset limit exceeded, locking task', {
            trainingId: data._id,
            datasetId: data.datasetId,
            collectionId: data.collectionId
          });
          await MongoDatasetTraining.updateOne(taskLease.getFilter(), {
            errorMsg: i18nT('common:code_error.team_error.dataset_size_not_enough'),
            lockTime: new Date('2999/5/5')
          });

          continue;
        }

        logger.error('Parse queue task failed', {
          error: err,
          trainingId: data._id,
          datasetId: data.datasetId,
          collectionId: data.collectionId
        });

        await MongoDatasetTraining.updateOne(taskLease.getFilter(), {
          errorMsg: getErrText(err, 'unknown error'),
          lockTime: addMinutes(new Date(), -PARSE_QUEUE_LEASE_TIMEOUT_MINUTES)
        });

        await delay(100);
      } finally {
        await taskLease.stop();
      }
    }
  } catch (error) {
    logger.error('Parse queue loop failed', { error });
  }

  if (reduceQueue()) {
    logger.info('Parse queue drained', { queueSize: global.datasetParseQueueLen });
  }

  logger.debug('Parse queue loop exit', { queueSize: global.datasetParseQueueLen });
};
