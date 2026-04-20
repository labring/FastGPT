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
import { getLLMModel } from '@fastgpt/service/core/ai/model';
import { getLLMMaxChunkSize } from '@fastgpt/global/core/dataset/training/utils';
import { checkDatasetIndexLimit } from '@fastgpt/service/support/permission/teamLimit';
import { predictDataLimitLength } from '@fastgpt/global/core/dataset/utils';
import { getTrainingModeByCollection } from '@fastgpt/service/core/dataset/collection/utils';
import { pushDataListToTrainingQueue } from '@fastgpt/service/core/dataset/training/controller';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { hashStr } from '@fastgpt/global/common/string/tools';
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
  model,
  billId,
  paragraphChunkAIMode
}: {
  rawText: string;
  model: string;
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
      model,
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
        logger.error('Parse queue fetch task failed', { error });
        await delay(500);
        continue;
      }
      // Check team points and lock(No mistakes will be thrown here)
      if (!(await checkTeamAiPointsAndLock(data.teamId))) {
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
        await MongoDatasetTraining.deleteOne({ _id: data._id });
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
            logger.warn('Parse queue task skipped: source read type resolved to null', {
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
              model: dataset.agentModel,
              billId: data.billId,
              paragraphChunkAIMode: collection.paragraphChunkAIMode
            });

        // 释放 rawText 内存，resultText 已包含处理后的内容
        rawText = null as any;

        // Push usage（backup/template 模式不消耗 LLM tokens）
        if (!isBackupMode) {
          pushLLMTrainingUsage({
            teamId: data.teamId,
            model: dataset.agentModel,
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
          maxSize: getLLMMaxChunkSize(getLLMModel(dataset.agentModel)),
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

        const trainingData = chunks.map((item, index) => ({
          ...item,
          indexes: item.indexes?.map((text) => ({
            type: DatasetDataIndexTypeEnum.custom,
            text
          })),
          chunkIndex: index
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

          // 6. Push to chunk queue
          await pushDataListToTrainingQueue({
            teamId: data.teamId,
            tmbId: data.tmbId,
            datasetId: dataset._id,
            collectionId: collection._id,
            agentModel: dataset.agentModel,
            vectorModel: dataset.vectorModel,
            vlmModel: dataset.vlmModel,
            indexSize: collection.indexSize,
            mode: trainingMode,
            billId: data.billId,
            data: trainingData,
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
            // independent transactions (large dataset path: trainingData.length > 10000).
            // For small datasets, pushDataListToTrainingQueue reuses the outer session, so a
            // session abort means training data was also rolled back — rethrow to let the outer
            // error handler retry the entire parse task and avoid silent data loss.
            const usedIndependentTransaction = trainingData.length > 10000;
            if (
              usedIndependentTransaction &&
              (deleteErr?.codeName === 'NoSuchTransaction' ||
                deleteErr?.message?.includes('has been aborted'))
            ) {
              addLog.warn('[Parse Queue] deleteOne session aborted, retrying without session');
              await MongoDatasetTraining.deleteOne({ _id: data._id });
            } else {
              throw deleteErr;
            }
          }
        });

        logger.debug('Parse queue task finished', {
          durationMs: Date.now() - startTime,
          trainingId: data._id,
          datasetId: data.datasetId,
          collectionId: data.collectionId
        });
      } catch (err) {
        if (err === TeamErrEnum.datasetSizeNotEnough) {
          logger.info('Parse queue dataset limit exceeded, locking task', {
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

        logger.error('Parse queue task failed', {
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
    logger.error('Parse queue loop failed', { error });
  }

  if (reduceQueue()) {
    logger.info('Parse queue drained', { queueSize: global.datasetParseQueueLen });
  }

  logger.debug('Parse queue loop exit', { queueSize: global.datasetParseQueueLen });
};
