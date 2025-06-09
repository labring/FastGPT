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
import { addLog } from '@fastgpt/service/common/system/log';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { addMinutes } from 'date-fns';
import { checkTeamAiPointsAndLock } from './utils';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { delay } from '@fastgpt/service/common/bullmq';
import { rawText2Chunks, readDatasetSourceRawText } from '@fastgpt/service/core/dataset/read';
import { getLLMModel } from '@fastgpt/service/core/ai/model';
import { getLLMMaxChunkSize } from '@fastgpt/global/core/dataset/training/utils';
import { checkDatasetLimit } from '@fastgpt/service/support/permission/teamLimit';
import { predictDataLimitLength } from '@fastgpt/global/core/dataset/utils';
import { getTrainingModeByCollection } from '@fastgpt/service/core/dataset/collection/utils';
import { pushDataListToTrainingQueue } from '@fastgpt/service/core/dataset/training/controller';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { POST } from '@fastgpt/service/common/api/plusRequest';
import { pushLLMTrainingUsage } from '@fastgpt/service/support/wallet/usage/controller';

const requestLLMPargraph = async ({
  rawText,
  model,
  billId,
  paragraphChunkAIMode
}: {
  rawText: string;
  model: string;
  billId: string;
  paragraphChunkAIMode: ParagraphChunkAIModeEnum;
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

  // Check is markdown text(Include 1 group of title)
  if (paragraphChunkAIMode === ParagraphChunkAIModeEnum.auto) {
    const isMarkdown = /^(#+)\s/.test(rawText);
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
  }>('/core/dataset/training/llmPargraph', {
    rawText,
    model,
    billId
  });

  return data;
};

export const datasetParseQueue = async (): Promise<any> => {
  const startTime = Date.now();

  // 1. Get task and lock 20 minutes ago
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
          lockTime: { $lte: addMinutes(new Date(), -20) }
        },
        {
          lockTime: new Date(),
          $inc: { retryCount: -1 }
        }
      )
        .select({
          _id: 1,
          teamId: 1,
          tmbId: 1,
          datasetId: 1,
          collectionId: 1,
          billId: 1,
          q: 1
        })
        .populate<{
          dataset: DatasetSchemaType;
          collection: DatasetCollectionSchemaType;
        }>([
          {
            path: 'collection'
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
      addLog.error(`[Parse Queue] Error`, error);
      return {
        error: true
      };
    }
  })();

  if (done || !data) {
    return;
  }
  if (error) {
    await delay(500);
    return datasetParseQueue();
  }

  // Check team points and lock(No mistakes will be thrown here)
  if (!(await checkTeamAiPointsAndLock(data.teamId))) {
    return;
  }

  const dataset = data.dataset;
  const collection = data.collection;

  if (!dataset || !collection) {
    addLog.warn(`[Parse Queue] data not found`, data);
    await MongoDatasetTraining.deleteOne({ _id: data._id });
    return;
  }

  addLog.info(`[Parse Queue] Start`);

  try {
    const trainingMode = getTrainingModeByCollection({
      trainingType: collection.trainingType,
      autoIndexes: collection.autoIndexes,
      imageIndex: collection.imageIndex
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
      addLog.warn(`[Parse Queue] Source read type is null, delete task`);
      await MongoDatasetTraining.deleteOne({
        _id: data._id
      });
      return;
    }

    // 2. Read source
    const { title, rawText } = await readDatasetSourceRawText({
      teamId: data.teamId,
      tmbId: data.tmbId,
      customPdfParse: collection.customPdfParse,
      ...sourceReadType
    });

    // 3. LLM Pargraph
    const { resultText, totalInputTokens, totalOutputTokens } = await requestLLMPargraph({
      rawText,
      model: dataset.agentModel,
      billId: data.billId,
      paragraphChunkAIMode: collection.paragraphChunkAIMode
    });
    // Push usage
    pushLLMTrainingUsage({
      teamId: data.teamId,
      tmbId: data.tmbId,
      model: dataset.agentModel,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      billId: data.billId,
      mode: 'paragraph'
    });

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
      backupParse: collection.trainingType === DatasetCollectionDataProcessModeEnum.backup
    });

    // Check dataset limit
    try {
      await checkDatasetLimit({
        teamId: data.teamId,
        insertLen: predictDataLimitLength(trainingMode, chunks)
      });
    } catch (error) {
      addLog.warn(`[Parse Queue] Check dataset limit failed, lock the task`);
      await MongoDatasetTraining.updateOne(
        {
          _id: data._id
        },
        {
          errorMsg: getErrText(error, 'unknown error'),
          lockTime: new Date('2999/5/5')
        }
      );
      return;
    }

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
        agentModel: dataset.agentModel,
        vectorModel: dataset.vectorModel,
        vlmModel: dataset.vlmModel,
        indexSize: collection.indexSize,
        mode: trainingMode,
        prompt: collection.qaPrompt,
        billId: data.billId,
        data: chunks.map((item, index) => ({
          ...item,
          indexes: item.indexes?.map((text) => ({
            type: DatasetDataIndexTypeEnum.custom,
            text
          })),
          chunkIndex: index
        })),
        session
      });

      // 7. Delete task
      await MongoDatasetTraining.deleteOne(
        {
          _id: data._id
        },
        {
          session
        }
      );
    });

    addLog.debug(`[Parse Queue] Finish`, {
      time: Date.now() - startTime
    });
  } catch (err) {
    addLog.error(`[Parse Queue] Error`, err);

    await MongoDatasetTraining.updateOne(
      {
        _id: data._id
      },
      {
        errorMsg: getErrText(err, 'unknown error'),
        lockTime: addMinutes(new Date(), -1)
      }
    );

    return datasetParseQueue();
  }
};
