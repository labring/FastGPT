import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { pushLLMTrainingUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type.d';
import { addLog } from '@fastgpt/service/common/system/log';
import { replaceVariable } from '@fastgpt/global/common/string/tools';
import { Prompt_AgentQA } from '@fastgpt/global/core/ai/prompt/agent';
import type { PushDatasetDataChunkProps } from '@fastgpt/global/core/dataset/api.d';
import { getLLMModel } from '@fastgpt/service/core/ai/model';
import { checkTeamAiPointsAndLock } from './utils';
import { addMinutes } from 'date-fns';
import type { LLMModelItemType } from '@fastgpt/global/core/ai/model.d';
import {
  chunkAutoChunkSize,
  getLLMMaxChunkSize
} from '@fastgpt/global/core/dataset/training/utils';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { text2Chunks } from '@fastgpt/service/worker/function';
import { pushDataListToTrainingQueue } from '@fastgpt/service/core/dataset/training/controller';
import { delay } from '@fastgpt/service/common/bullmq';
import { createLLMResponse } from '@fastgpt/service/core/ai/llm/request';
import { UsageItemTypeEnum } from '@fastgpt/global/support/wallet/usage/constants';

const reduceQueue = () => {
  global.qaQueueLen = global.qaQueueLen > 0 ? global.qaQueueLen - 1 : 0;

  return global.qaQueueLen === 0;
};

type PopulateType = {
  dataset: { vectorModel: string; agentModel: string; vlmModel: string };
  collection: { qaPrompt?: string };
};

export async function generateQA(): Promise<any> {
  const max = global.systemEnv?.qaMaxProcess || 10;
  addLog.debug(`[QA Queue] Queue size: ${global.qaQueueLen}`);

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
                select: 'agentModel vectorModel vlmModel'
              },
              {
                path: 'collection',
                select: 'qaPrompt'
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
        addLog.error(`[QA Queue] Error`, error);
        await delay(500);
        continue;
      }

      if (!data.dataset || !data.collection) {
        addLog.info(`[QA Queue] Dataset or collection not found`, data);
        // Delete data
        await MongoDatasetTraining.deleteOne({ _id: data._id });
        continue;
      }
      // auth balance
      if (!(await checkTeamAiPointsAndLock(data.teamId))) {
        continue;
      }

      addLog.info(`[QA Queue] Start`);

      try {
        const modelData = getLLMModel(data.dataset.agentModel);
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
            model: modelData.model,
            temperature: 0.3,
            messages,
            stream: true
          }
        });

        const qaArr = await formatSplitText({ answer, rawText: text, llmModel: modelData }); // 格式化后的QA对

        // get vector and insert
        await pushDataListToTrainingQueue({
          teamId: data.teamId,
          tmbId: data.tmbId,
          datasetId: data.datasetId,
          collectionId: data.collectionId,
          mode: TrainingModeEnum.chunk,
          data: qaArr.map((item) => ({
            ...item,
            chunkIndex: data.chunkIndex
          })),
          billId: data.billId,
          vectorModel: data.dataset.vectorModel,
          agentModel: data.dataset.agentModel,
          vlmModel: data.dataset.vlmModel
        });

        // delete data from training
        await MongoDatasetTraining.findByIdAndDelete(data._id);

        // Push usage
        pushLLMTrainingUsage({
          teamId: data.teamId,
          inputTokens,
          outputTokens,
          usageId: data.billId,
          model: modelData.model,
          type: UsageItemTypeEnum.training_qa
        });

        addLog.info(`[QA Queue] Finish`, {
          time: Date.now() - startTime,
          splitLength: qaArr.length,
          usage: { inputTokens, outputTokens }
        });
      } catch (err: any) {
        addLog.error(`[QA Queue] Error`, err);
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
    addLog.error(`[QA Queue] Error`, error);
  }

  if (reduceQueue()) {
    addLog.info(`[QA Queue] Done`);
  }
  addLog.debug(`[QA Queue] break loop, current queue size: ${global.qaQueueLen}`);
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

  const result: PushDatasetDataChunkProps[] = []; // 存储最终的结果
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
