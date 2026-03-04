import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import type { DatasetCollectionDataProcessModeEnum } from '@fastgpt/global/core/dataset/constants';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { addLog } from '@fastgpt/service/common/system/log';
import { checkTeamAiPointsAndLock } from '../queues/utils';
import { addMinutes } from 'date-fns';
import type { DatasetDataIndexItemType } from '@fastgpt/global/core/dataset/type';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { delay } from '@fastgpt/global/common/system/utils';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { getTrainingModeByCollection } from '@fastgpt/service/core/dataset/collection/utils';
import { getLLMModel } from '@fastgpt/service/core/ai/model';
import { pushLLMTrainingUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { UsageItemTypeEnum } from '@fastgpt/global/support/wallet/usage/constants';

// Diting API response type
type DitingResponse = {
  requestId: string;
  status: string;
  data?: {
    questions: string[];
  };
  usages?: Array<{
    modelType: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  }>;
  error?: string | null;
};

const reduceQueue = () => {
  global.synthesisQueueLen = global.synthesisQueueLen > 0 ? global.synthesisQueueLen - 1 : 0;
  return global.synthesisQueueLen === 0;
};

type PopulateType = {
  dataset: { vectorModel: string; agentModel: string; vlmModel: string };
  collection: {
    name: string;
    trainingType: DatasetCollectionDataProcessModeEnum;
    autoIndexes?: boolean;
    imageIndex?: boolean;
    small2bigIndexes?: boolean;
    syntheticIndex?: boolean;
  };
};

export async function generateSynthesis(): Promise<any> {
  addLog.debug(`[Synthesis Queue] Size: ${global.synthesisQueueLen}`);

  const max = global.systemEnv?.qaMaxProcess || 10;
  if (global.synthesisQueueLen >= max) return;
  global.synthesisQueueLen++;

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
            mode: TrainingModeEnum.synthesis,
            retryCount: { $gte: 0 },
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
              select: 'vectorModel agentModel vlmModel'
            },
            {
              path: 'collection',
              select: 'name trainingType autoIndexes imageIndex small2bigIndexes syntheticIndex'
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
      addLog.error(`[Synthesis Queue] Error`, error);
      await delay(500);
      continue;
    }

    if (!data.dataset) {
      addLog.info(`[Synthesis Queue] Dataset not found`, data);
      // Delete data
      await MongoDatasetTraining.deleteOne({ _id: data._id });
      continue;
    }
    // auth balance
    if (!(await checkTeamAiPointsAndLock(data.teamId))) {
      continue;
    }

    addLog.info(`[Synthesis Queue] Start`);

    try {
      // Call Diting API directly (simplified)
      const ditingUrl = process.env.DITING_BASE_URL || 'http://diting:3000';
      const controller = new AbortController();
      const timeout = 600000; // 10 minutes
      const timeoutId = setTimeout(() => controller.abort(), timeout + 2000);
      const agentModel = getLLMModel(data.dataset.agentModel);

      try {
        const response = await fetch(`${ditingUrl}/api/v1/dataset-synthesis/runs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            synthesizerConfig: {
              synthesizerName: 'question_list_synthesizer'
            },
            inputData: {
              context: [text]
            },
            llmConfig: {
              name: agentModel.model,
              base_url: agentModel.requestUrl,
              api_key: agentModel.requestAuth,
              timeout
            }
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          throw new Error(`Diting API HTTP ${response.status}: ${errorText}`);
        }

        const result: DitingResponse = await response.json();

        if (result.status !== 'success' || !result.data?.questions) {
          throw new Error(result.error || 'Missing questions data');
        }

        const questions = result.data.questions;

        // Extract usage information
        const usage = result.usages?.[0];
        const inputTokens = usage?.promptTokens || 0;
        const outputTokens = usage?.completionTokens || 0;

        // Format to synthesis indexes
        const synthesisIndexes = formatQuestionsToSynthesisIndexes({ questions });
        const allIndexes = [...(data.indexes ?? []), ...synthesisIndexes];

        // Update current training record to next stage
        await mongoSessionRun(async (session) => {
          // Determine next mode (synthesis is done, so set syntheticIndex to false)
          const nextMode = getTrainingModeByCollection({
            trainingType: data.collection.trainingType,
            autoIndexes: data.collection?.autoIndexes,
            imageIndex: false,
            small2bigIndexes: false,
            syntheticIndex: false // synthesis is done
          });

          // Update current training record to next stage
          await MongoDatasetTraining.updateOne(
            { _id: data._id },
            {
              $set: {
                mode: nextMode,
                retryCount: 5,
                indexes: allIndexes,
                lockTime: new Date('2000/1/1')
              }
            },
            { session }
          );

          addLog.debug(
            `[Synthesis Queue] Successfully processed chunk ${data.chunkIndex} with ${synthesisIndexes.length} synthesis indexes, next mode: ${nextMode}`,
            {
              'time(ms)': Date.now() - startTime,
              questionsCount: questions.length,
              synthesisIndexesCount: synthesisIndexes.length
            }
          );
        });

        // Push usage after successful processing
        pushLLMTrainingUsage({
          teamId: data.teamId,
          inputTokens,
          outputTokens,
          usageId: data.billId,
          model: agentModel.model,
          type: UsageItemTypeEnum.training_qa
        });
      } catch (fetchError: any) {
        clearTimeout(timeoutId);

        // 区分超时错误
        if (fetchError.name === 'AbortError') {
          throw new Error(`Diting API timeout after ${timeout} s`);
        }

        throw fetchError;
      }
    } catch (err: any) {
      addLog.error(`[Synthesis Queue] Error`, {
        error: err,
        'time(ms)': Date.now() - startTime
      });

      await MongoDatasetTraining.updateOne(
        {
          _id: data._id
        },
        {
          lockTime: addMinutes(new Date(), -9),
          errorMsg: getErrText(err, 'unknown error')
        }
      );

      await delay(100);
    }
  }

  if (reduceQueue()) {
    addLog.info(`[Synthesis Queue] Done`);
  }
  addLog.debug(`[Synthesis Queue] break loop, current queue size: ${global.synthesisQueueLen}`);
}

/**
 * Format 10 questions from Diting into synthesis indexes with synId
 * Questions are paired: (q0,q1) -> synId:0, (q2,q3) -> synId:1, etc.
 */
export const formatQuestionsToSynthesisIndexes = ({
  questions
}: {
  questions: string[];
}): Omit<DatasetDataIndexItemType, 'dataId'>[] => {
  return questions.map((text, i) => ({
    type: DatasetDataIndexTypeEnum.synthesis,
    text,
    synId: Math.floor(i / 2)
  }));
};
