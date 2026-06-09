import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { pushLLMTrainingUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/llm/type';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { replaceVariable } from '@fastgpt/global/common/string/tools';
import { Prompt_AgentQA } from '@fastgpt/global/core/ai/prompt/agent';
import type { PushDataChunkType } from '@fastgpt/global/openapi/core/dataset/data/api';
import { getLLMModelById } from '@fastgpt/service/core/ai/model';
import { checkTeamAiPointsAndLock } from './utils';
import {
  markIndexingStart,
  markDataTrainingPhaseTrace
} from '@fastgpt/service/core/dataset/training/utils';
import { addMinutes } from 'date-fns';
import type { LLMModelItemType } from '@fastgpt/global/core/ai/model.schema';
import {
  chunkAutoChunkSize,
  getLLMMaxChunkSize
} from '@fastgpt/global/core/dataset/training/utils';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { text2Chunks } from '@fastgpt/service/worker/function';
import { pushDataListToTrainingQueue } from '@fastgpt/service/core/dataset/training/controller';
import { createDataDrafts } from '@fastgpt/service/core/dataset/data/controller';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { delay } from '@fastgpt/service/common/bullmq';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetDataText } from '@fastgpt/service/core/dataset/data/dataTextSchema';
import { createLLMResponse } from '@fastgpt/service/core/ai/llm/request';
import { UsageItemTypeEnum } from '@fastgpt/global/support/wallet/usage/constants';

const logger = getLogger(LogCategories.MODULE.DATASET.QA);

const reduceQueue = () => {
  global.qaQueueLen = global.qaQueueLen > 0 ? global.qaQueueLen - 1 : 0;

  return global.qaQueueLen === 0;
};

type PopulateType = {
  dataset: { vectorModelId: string; agentModelId: string; vlmModelId?: string };
  collection: { qaPrompt?: string; indexingStartTime?: Date };
};

export async function generateQA(): Promise<any> {
  const max = global.systemEnv?.qaMaxProcess || 10;
  logger.debug('QA queue size check', { queueSize: global.qaQueueLen, max });

  if (global.qaQueueLen >= max) return;
  global.qaQueueLen++;

  try {
    while (true) {
      const startTime = Date.now();
      // get training data
      const {
        data,
        text,
        done = false,
        error = false
      } = await (async () => {
        try {
          const data = await MongoDatasetTraining.findOneAndUpdate(
            {
              mode: TrainingModeEnum.qa,
              retryCount: { $gt: 0 },
              lockTime: { $lte: addMinutes(new Date(), -10) }
            },
            {
              lockTime: new Date(),
              $inc: { retryCount: -1 }
            }
          )
            .populate<PopulateType>([
              {
                path: 'dataset',
                select: 'agentModelId vectorModelId vlmModelId'
              },
              {
                path: 'collection',
                select: 'qaPrompt indexingStartTime'
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
            data,
            text: data.q
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
        logger.error('QA queue fetch task failed', { error });
        await delay(500);
        continue;
      }

      if (!data.dataset || !data.collection) {
        logger.info('QA queue task skipped: dataset or collection missing', {
          datasetId: data.datasetId,
          collectionId: data.collectionId,
          trainingId: data._id
        });
        // Delete data
        await MongoDatasetTraining.deleteOne({ _id: data._id });
        continue;
      }
      // auth balance
      // NOTE: findOneAndUpdate has already locked this record. If balance check
      // fails we MUST delete it immediately, otherwise it stays locked for 3 min.
      if (!(await checkTeamAiPointsAndLock(data.teamId))) {
        await MongoDatasetTraining.deleteOne({ _id: data._id });
        continue;
      }

      logger.info('QA queue task started', {
        trainingId: data._id,
        datasetId: data.datasetId,
        collectionId: data.collectionId,
        teamId: data.teamId,
        tmbId: data.tmbId
      });

      // Mark indexing start on collection (idempotent).
      // Phase timing is deferred until new QA Data records are created inside the session —
      // the original pre-created Data will be deleted and replaced by QA pair Data records.
      const phaseStartTime = data.collection?.indexingStartTime || new Date();
      await markIndexingStart({
        collectionId: String(data.collectionId),
        startTime: phaseStartTime
      });

      try {
        const modelData = getLLMModelById(data.dataset.agentModelId);
        const prompt = `${data.collection.qaPrompt || Prompt_AgentQA.description}
  ${replaceVariable(Prompt_AgentQA.fixedText, { text })}`;

        // request LLM to get QA
        const messages: ChatCompletionMessageParam[] = [
          {
            role: 'user',
            content: prompt
          }
        ];

        const {
          answerText: answer,
          usage: { inputTokens, outputTokens }
        } = await createLLMResponse({
          body: {
            modelId: modelData.id,
            temperature: 0.3,
            messages,
            stream: true
          }
        });

        const qaArr = await formatSplitText({ answer, rawText: text, llmModel: modelData }); // 格式化后的QA对

        // Create Data drafts for each QA pair (replaces the original pre-created Data)
        const qaItems = qaArr.map((item) => ({
          ...item,
          chunkIndex: data.chunkIndex
        }));

        // Wrap Data creation, training queue push, and cleanup in a single transaction.
        // If any step fails, MongoDB rolls back everything — no orphaned Data drafts.
        await mongoSessionRun(async (session) => {
          const draftResults = await createDataDrafts({
            items: qaItems.map((item) => ({
              q: item.q || '',
              a: item.a || '',
              chunkIndex: item.chunkIndex
            })),
            teamId: data.teamId,
            tmbId: data.tmbId,
            datasetId: data.datasetId,
            collectionId: data.collectionId,
            session
          });
          draftResults.forEach((result, i) => {
            qaItems[i].id = String(result._id);
          });

          // push to vector queue
          await pushDataListToTrainingQueue({
            teamId: data.teamId,
            tmbId: data.tmbId,
            datasetId: data.datasetId,
            collectionId: data.collectionId,
            mode: TrainingModeEnum.chunk,
            data: qaItems,
            billId: data.billId,
            vectorModelId: data.dataset.vectorModelId,
            agentModelId: data.dataset.agentModelId,
            vlmModelId: data.dataset.vlmModelId,
            session
          });

          // Clean up the original pre-created Data (replaced by QA pair Data records)
          if (data.dataId) {
            await Promise.all([
              MongoDatasetData.deleteOne({ _id: data.dataId }, { session }),
              MongoDatasetDataText.deleteMany({ dataId: data.dataId }, { session })
            ]);
          }

          // delete data from training
          await MongoDatasetTraining.findByIdAndDelete(data._id, { session });
        });

        // Write QA phase trace on each new Data record
        // (startTime + endTime in a single $push — 2 writes → 1 write).
        const qaDataIds = qaItems.map((item) => item.id).filter((id): id is string => !!id);
        if (qaDataIds.length > 0) {
          await Promise.all(
            qaDataIds.map((dataId) =>
              markDataTrainingPhaseTrace({
                dataId,
                mode: TrainingModeEnum.qa,
                startTime: phaseStartTime
              })
            )
          );
        }

        // Push usage (outside transaction — fire-and-forget, non-critical)
        pushLLMTrainingUsage({
          teamId: data.teamId,
          inputTokens,
          outputTokens,
          usageId: data.billId,
          modelId: modelData.id,
          type: UsageItemTypeEnum.training_qa
        });

        logger.info('QA queue task finished', {
          durationMs: Date.now() - startTime,
          qaCount: qaArr.length,
          usage: { inputTokens, outputTokens },
          trainingId: data._id,
          datasetId: data.datasetId,
          collectionId: data.collectionId
        });
      } catch (err: any) {
        logger.error('QA queue task failed', {
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
            errorMsg: getErrText(err, 'unknown error')
          }
        );

        await delay(100);
      }
    }
  } catch (error) {
    logger.error('QA queue loop failed', { error });
  }

  if (reduceQueue()) {
    logger.info('QA queue drained', { queueSize: global.qaQueueLen });
  }
  logger.debug('QA queue loop exit', { queueSize: global.qaQueueLen });
}

// Format qa answer
async function formatSplitText({
  answer,
  rawText,
  llmModel
}: {
  answer: string;
  rawText: string;
  llmModel: LLMModelItemType;
}) {
  answer = answer.replace(/\\n/g, '\n'); // 将换行符替换为空格
  const regex = /Q\d+:(\s*)(.*)(\s*)A\d+:(\s*)([\s\S]*?)(?=Q\d|$)/g; // 匹配Q和A的正则表达式
  const matches = answer.matchAll(regex); // 获取所有匹配到的结果

  const result: PushDataChunkType[] = []; // 存储最终的结果
  for (const match of matches) {
    const q = match[2] || '';
    const a = match[5] || '';
    if (q) {
      result.push({
        q,
        a
      });
    }
  }

  // empty result. direct split chunk
  if (result.length === 0) {
    const { chunks } = await text2Chunks({
      text: rawText,
      chunkSize: chunkAutoChunkSize,
      maxSize: getLLMMaxChunkSize(llmModel)
    });
    chunks.forEach((chunk) => {
      result.push({
        q: chunk,
        a: ''
      });
    });
  }

  return result;
}
