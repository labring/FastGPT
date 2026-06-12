/* Dataset collection source parse, not max size. */

import { ParagraphChunkAIModeEnum } from '@fastgpt/global/core/dataset/constants';
import { addLog } from '@fastgpt/service/common/system/log';
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
import { delay } from '@fastgpt/service/common/bullmq';
import { rawText2Chunks, readDatasetSourceRawText } from '@fastgpt/service/core/dataset/read';
import { getLLMModelById } from '@fastgpt/service/core/ai/model';
import { getLLMMaxChunkSize } from '@fastgpt/global/core/dataset/training/utils';
import { checkDatasetIndexLimit } from '@fastgpt/service/support/permission/teamLimit';
import { predictDataLimitLength } from '@fastgpt/global/core/dataset/utils';
import { getTrainingModeByCollection } from '@fastgpt/service/core/dataset/collection/utils';
import { pushDataListToTrainingQueue } from '@fastgpt/service/core/dataset/training/controller';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import {
  markParseStart,
  markParseEnd,
  markDataTrainingPhaseTrace
} from '@fastgpt/service/core/dataset/training/utils';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { createDataDrafts } from '@fastgpt/service/core/dataset/data/controller';
import type { PushDataChunkType } from '@fastgpt/global/openapi/core/dataset/data/api';
import { POST } from '@fastgpt/service/common/api/plusRequest';
import { pushLLMTrainingUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { UsageItemTypeEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { i18nT } from '@fastgpt/web/i18n/utils';
import { getS3DatasetSource } from '@fastgpt/service/common/s3/sources/dataset';
import { detectAndDecodeBuffer } from '@fastgpt/service/common/file/encoding';
import { excelBufferToCSV } from '@fastgpt/service/common/file/csv';

const logger = getLogger(LogCategories.MODULE.DATASET.FILE_PARSE);

const requestLLMPargraph = async ({
  rawText,
  modelId,
  billId,
  paragraphChunkAIMode
}: {
  rawText: string;
  modelId: string;
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
      billId
    },
    { timeout: 600000 }
  );

  return data;
};

const reduceGpuQueue = () => {
  global.datasetParseQueueLen =
    global.datasetParseQueueLen > 0 ? global.datasetParseQueueLen - 1 : 0;

  return global.datasetParseQueueLen === 0;
};

const reduceNonGpuQueue = () => {
  global.datasetParseNonGpuQueueLen =
    global.datasetParseNonGpuQueueLen > 0 ? global.datasetParseNonGpuQueueLen - 1 : 0;

  return global.datasetParseNonGpuQueueLen === 0;
};

const runParseQueue = async ({
  queueName,
  isGpuFilter,
  getQueueLen,
  incrementQueue,
  decrementQueue,
  max
}: {
  queueName: string;
  isGpuFilter: boolean | { $ne: boolean };
  getQueueLen: () => number;
  incrementQueue: () => void;
  decrementQueue: () => boolean;
  max: number;
}): Promise<any> => {
  addLog.debug(`[${queueName}] Queue size: ${getQueueLen()}`);
  if (max != null && max > 0 && getQueueLen() >= max) return;
  incrementQueue();
  const timeout = global.systemEnv.customPdfParse?.timeout || 10;

  try {
    while (true) {
      const startTime = Date.now();

      // 1. Get task and lock timeout minutes ago
      const {
        data,
        done = false,
        error = false
      } = await (async () => {
        try {
          const data = await MongoDatasetTraining.findOneAndUpdate(
            {
              mode: TrainingModeEnum.parse,
              useGpuQueue: isGpuFilter,
              retryCount: { $gt: 0 },
              lockTime: { $lte: addMinutes(new Date(), -timeout) }
            },
            {
              lockTime: new Date(),
              $inc: { retryCount: -1 }
            }
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
        } catch (error) {
          return {
            error: true
          };
        }
      })();

      if (done || !data) {
        break;
      }
      if (error) {
        logger.error(`[${queueName}] fetch task failed`, { error });
        await delay(500);
        continue;
      }
      // Check team points and lock(No mistakes will be thrown here)
      // NOTE: findOneAndUpdate has already locked this record. If balance check
      // fails we MUST delete it immediately, otherwise it stays locked for 3 min.
      if (!(await checkTeamAiPointsAndLock(data.teamId))) {
        await MongoDatasetTraining.deleteOne({ _id: data._id });
        continue;
      }

      const dataset = data.dataset;
      const collection = data.collection;

      if (!dataset || !collection) {
        logger.warn(`[${queueName}] task skipped: dataset or collection missing`, {
          datasetId: data.datasetId,
          collectionId: data.collectionId,
          trainingId: data._id
        });
        await MongoDatasetTraining.deleteOne({ _id: data._id });
        continue;
      }

      logger.info(`[${queueName}] started`, {
        trainingId: data._id,
        datasetId: data.datasetId,
        collectionId: data.collectionId,
        teamId: data.teamId,
        tmbId: data.tmbId,
        collectionType: collection.type,
        trainingType: collection.trainingType
      });

      // Set parseStartTime on first pickup so listV2 status can distinguish
      // "truly queued" from "processing started (even if no worker is active right now)".
      // Using { $exists: false } in the filter makes this an idempotent one-shot —
      // retries won't overwrite the original timestamp.
      // Capture the timestamp so Data-level phaseTimings can share the same value —
      // the Data's parse phase starts when the worker picks up the parse task,
      // not when the Data record is later created inside the session.
      const parseStartTime = collection.parseStartTime || new Date();
      await markParseStart({ collectionId: String(collection._id), startTime: parseStartTime });

      try {
        const trainingMode = getTrainingModeByCollection({
          trainingType: collection.trainingType,
          autoIndexes: collection.autoIndexes,
          imageIndex: collection.imageIndex,
          small2bigIndexes: collection.small2bigIndexes
        });

        const isBackupMode =
          collection.trainingType === DatasetCollectionDataProcessModeEnum.backup ||
          collection.trainingType === DatasetCollectionDataProcessModeEnum.template;

        // 1. Parse rawtext
        let title: string | undefined;
        let rawText = '';

        if (
          isBackupMode &&
          collection.type === DatasetCollectionTypeEnum.file &&
          collection.fileId
        ) {
          // backup/template CSV 文件：直接读取原始字节，跳过 Markdown 转换
          const { buffer, extension } = await getS3DatasetSource().getDatasetFileBuffer(
            String(collection.fileId)
          );
          if (extension === 'xlsx' || extension === 'xls') {
            rawText = excelBufferToCSV(buffer) || '';
            if (!rawText) {
              if (buffer.length > 500 * 1024) throw new Error('template_excel_too_much_data');
              throw new Error('template_excel_file_empty');
            }
          } else {
            rawText = detectAndDecodeBuffer(buffer).content;
          }
        } else {
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
            logger.warn(`[${queueName}] task skipped: source read type resolved to null`, {
              trainingId: data._id,
              datasetId: data.datasetId,
              collectionId: data.collectionId,
              collectionType: collection.type
            });
            await MongoDatasetTraining.deleteOne({
              _id: data._id
            });
            continue;
          }

          ({ title, rawText } = await readDatasetSourceRawText({
            teamId: data.teamId,
            tmbId: data.tmbId,
            customPdfParse: collection.customPdfParse,
            usageId: data.billId,
            datasetId: data.datasetId,
            ...sourceReadType
          }));
        }

        // 3. LLM Pargraph（backup/template 模式跳过 LLM 处理，避免破坏 CSV 结构）
        const { resultText, totalInputTokens, totalOutputTokens } = isBackupMode
          ? { resultText: rawText, totalInputTokens: 0, totalOutputTokens: 0 }
          : await requestLLMPargraph({
              rawText,
              modelId: getLLMModelById(dataset.agentModelId)?.id || dataset.agentModelId,
              billId: data.billId,
              paragraphChunkAIMode: collection.paragraphChunkAIMode
            });

        // 释放 rawText 内存，resultText 已包含处理后的内容
        rawText = null as any;

        // Push usage（backup/template 模式不消耗 LLM tokens）
        if (!isBackupMode) {
          pushLLMTrainingUsage({
            teamId: data.teamId,
            modelId: getLLMModelById(dataset.agentModelId)?.id || dataset.agentModelId,
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
          maxSize: getLLMMaxChunkSize(getLLMModelById(dataset.agentModelId)),
          overlapRatio:
            collection.trainingType === DatasetCollectionDataProcessModeEnum.chunk ? 0.2 : 0,
          customReg: collection.chunkSplitter ? [collection.chunkSplitter] : [],
          backupParse: isBackupMode
        });

        // Check dataset limit
        await checkDatasetIndexLimit({
          teamId: data.teamId,
          insertLen: Math.round(predictDataLimitLength(trainingMode, chunks) * 0.7)
        });

        const parsedDatas: PushDataChunkType[] = chunks.map((item, index) => ({
          q: item.q,
          a: item.a,
          indexes: item.indexes?.map((text) => ({
            type: DatasetDataIndexTypeEnum.custom,
            text
          })),
          chunkIndex: index,
          metadata: item.metadata
        }));

        await mongoSessionRun(async (session) => {
          // 5. Update collection title(Link)
          await MongoDatasetCollection.updateOne(
            { _id: collection._id },
            {
              ...(title && collection.type === DatasetCollectionTypeEnum.link && { name: title }),
              rawTextLength: resultText.length,
              hashRawText: hashStr(resultText),
              // backup/template 模式：原始内容已解析完成，标记为已解析
              ...(isBackupMode ? { updateTime: new Date() } : {})
            },
            { session }
          );

          // 5.5 Create Data drafts after parsing completes.
          //     Subsequent training stages (vector/image/auto etc.) only UPDATE these records.
          const draftResults = await createDataDrafts({
            items: parsedDatas.map((item, i) => ({
              q: item.q || '',
              a: item.a || '',
              chunkIndex: i,
              metadata: item.metadata
            })),
            teamId: data.teamId,
            tmbId: data.tmbId,
            datasetId: dataset._id,
            collectionId: collection._id,
            session
          });
          // Associate dataId with training records → generateVector uses UPDATE path
          draftResults.forEach((result, i) => {
            parsedDatas[i].id = String(result._id);
          });

          // 6. Push to chunk queue
          await pushDataListToTrainingQueue({
            teamId: data.teamId,
            tmbId: data.tmbId,
            datasetId: dataset._id,
            collectionId: collection._id,
            agentModelId: dataset.agentModelId,
            vectorModelId: dataset.vectorModelId,
            vlmModelId: dataset.vlmModelId,
            indexSize: collection.indexSize,
            mode: trainingMode,
            billId: data.billId,
            data: parsedDatas,
            session
          });

          // 7. Delete task
          try {
            await MongoDatasetTraining.deleteOne(
              {
                _id: data._id
              },
              {
                session
              }
            );
          } catch (deleteErr: any) {
            // Session may have been aborted by server (e.g. transaction timeout).
            // Only safe to retry without session when pushDataListToTrainingQueue used its own
            // independent transactions (large dataset path: parsedDatas.length > 10000).
            // For small datasets, pushDataListToTrainingQueue reuses the outer session, so a
            // session abort means training data was also rolled back — rethrow to let the outer
            // error handler retry the entire parse task and avoid silent data loss.
            const usedIndependentTransaction = parsedDatas.length > 10000;
            if (
              usedIndependentTransaction &&
              (deleteErr?.codeName === 'NoSuchTransaction' ||
                deleteErr?.message?.includes('has been aborted'))
            ) {
              addLog.warn(`[${queueName}] deleteOne session aborted, retrying without session`);
              await MongoDatasetTraining.deleteOne({ _id: data._id });
            } else {
              throw deleteErr;
            }
          }
        });

        // Write parse phase trace on each newly created Data record
        // (startTime + endTime in a single DB $push — 2 writes → 1 write).
        const parsedDataIds = parsedDatas.map((p) => p.id).filter(Boolean);
        if (parsedDataIds.length > 0) {
          await Promise.all(
            parsedDataIds.map((dataId) =>
              markDataTrainingPhaseTrace({
                dataId: String(dataId),
                mode: TrainingModeEnum.parse,
                startTime: parseStartTime
              })
            )
          );
        }

        // Throttled parse completion check: once all parse tasks for this collection
        // are done, markParseEnd sets parsingCompleteTime on the collection.
        await markParseEnd({
          collectionId: String(collection._id),
          teamId: String(data.teamId),
          datasetId: String(data.datasetId)
        });

        logger.debug(`[${queueName}] task finished`, {
          durationMs: Date.now() - startTime,
          trainingId: data._id,
          datasetId: data.datasetId,
          collectionId: data.collectionId
        });
      } catch (err) {
        if (err === TeamErrEnum.datasetSizeNotEnough) {
          logger.info(`[${queueName}] dataset limit exceeded, locking task`, {
            trainingId: data._id,
            datasetId: data.datasetId,
            collectionId: data.collectionId
          });
          await MongoDatasetTraining.updateOne(
            {
              _id: data._id
            },
            {
              errorMsg: i18nT('common:code_error.team_error.dataset_size_not_enough'),
              lockTime: new Date('2999/5/5')
            }
          );

          continue;
        }

        logger.error(`[${queueName}] task failed`, {
          error: err,
          trainingId: data._id,
          datasetId: data.datasetId,
          collectionId: data.collectionId
        });

        await MongoDatasetTraining.updateOne(
          {
            _id: data._id
          },
          {
            errorMsg: getErrText(err, 'unknown error'),
            lockTime: addMinutes(new Date(), -10)
          }
        );

        await delay(100);
      }
    }
  } catch (error) {
    logger.error(`[${queueName}] loop failed`, { error });
  }

  if (decrementQueue()) {
    logger.info(`[${queueName}] drained`);
  }

  logger.debug(`[${queueName}] loop exit`);
};

export const datasetParseQueue = async (): Promise<any> => {
  const max = global.systemEnv?.datasetParseMaxProcess || 10;
  return runParseQueue({
    queueName: 'Parse GPU Queue',
    isGpuFilter: true,
    getQueueLen: () => global.datasetParseQueueLen,
    incrementQueue: () => {
      global.datasetParseQueueLen++;
    },
    decrementQueue: reduceGpuQueue,
    max
  });
};

export const datasetParseNonGpuQueue = async (): Promise<any> => {
  const max = global.systemEnv?.datasetParseNonGpuMaxProcess || 20;
  return runParseQueue({
    queueName: 'Parse NonGPU Queue',
    isGpuFilter: { $ne: true },
    getQueueLen: () => global.datasetParseNonGpuQueueLen,
    incrementQueue: () => {
      global.datasetParseNonGpuQueueLen++;
    },
    decrementQueue: reduceNonGpuQueue,
    max
  });
};
