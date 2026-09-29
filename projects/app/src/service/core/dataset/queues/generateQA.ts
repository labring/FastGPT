import { getModelHandle } from '@fastgpt/service/core/ai/model';
import { getDatasetModelReference } from '@fastgpt/service/core/dataset/model';

import { pushLLMTrainingUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/llm/type';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { replaceVariable } from '@fastgpt/service/common/string/replaceVariable';
import { Prompt_AgentQA } from '@fastgpt/global/core/ai/prompt/agent';
import type { PushDataChunkType } from '@fastgpt/global/openapi/core/dataset/data/api';

import { checkTeamAiPointsAndLock } from './utils';
import type { LLMSystemModelDataType } from '@fastgpt/global/core/ai/model/schema';
import {
  chunkAutoChunkSize,
  getLLMMaxChunkSize
} from '@fastgpt/global/core/dataset/training/utils';
import { delay } from '@fastgpt/global/common/system/utils';
import { text2Chunks } from '@fastgpt/service/worker/function';
import { preCreateDatasetDataAndPushToTrainingQueue } from '@fastgpt/service/core/dataset/training/controller';
import { createLLMResponse } from '@fastgpt/service/core/ai/llm/request';
import { UsageItemTypeEnum } from '@fastgpt/global/support/wallet/usage/constants';
import type { DatasetSchemaType } from '@fastgpt/global/core/dataset/type';
import {
  claimTrainingTask,
  TrainingLeaseLostError
} from '@fastgpt/service/core/dataset/training/service';

const logger = getLogger(LogCategories.MODULE.DATASET.QA);

const reduceQueue = () => {
  global.qaQueueLen = global.qaQueueLen > 0 ? global.qaQueueLen - 1 : 0;

  return global.qaQueueLen === 0;
};

type PopulateType = {
  dataset: Pick<
    DatasetSchemaType,
    'vectorModelId' | 'vectorModel' | 'agentModelId' | 'agentModel' | 'vlmModelId' | 'vlmModel'
  >;
  collection: { qaPrompt?: string };
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
      let claimed;
      try {
        claimed = await claimTrainingTask<PopulateType>({
          mode: TrainingModeEnum.qa,
          populate: [
            {
              path: 'dataset',
              select: 'agentModelId agentModel vectorModelId vectorModel vlmModelId vlmModel'
            },
            {
              path: 'collection',
              select: 'qaPrompt'
            }
          ]
        });
      } catch (error) {
        logger.error('QA queue fetch task failed', { error });
        await delay(500);
        continue;
      }

      if (!claimed) break;
      const { data, lease } = claimed;
      const text = data.q;
      if (!data.dataset || !data.collection) {
        logger.info('QA queue task skipped: dataset or collection missing', {
          datasetId: data.datasetId,
          collectionId: data.collectionId,
          trainingId: data._id
        });
        // Delete data
        // 关联对象缺失时仍使用同一租约删除，避免误删新任务。
        await lease.complete();
        continue;
      }
      // auth balance
      if (!(await checkTeamAiPointsAndLock(data.teamId, String(data._id)))) {
        await lease.stop();
        continue;
      }

      logger.info('QA queue task started', {
        trainingId: data._id,
        datasetId: data.datasetId,
        collectionId: data.collectionId,
        teamId: data.teamId,
        tmbId: data.tmbId
      });

      try {
        const modelHandle = await getModelHandle();
        const modelData = modelHandle.getLLMModelData(
          getDatasetModelReference(data.dataset, 'agent')
        );
        const embeddingModelData = modelHandle.getEmbeddingModelData(
          getDatasetModelReference(data.dataset, 'embedding')
        );
        const vlmModelData = modelHandle.getVlmModelData(
          getDatasetModelReference(data.dataset, 'vlm'),
          { optional: true }
        );
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
          teamId: data.teamId,
          saveLLMResponseRecord: false,
          body: {
            model: modelData,
            messages,
            stream: true
          }
        });

        const qaArr = await formatSplitText({ answer, rawText: text, llmModel: modelData }); // 格式化后的QA对

        // QA 成功后才创建最终数据。数据和后续 chunk 任务在同一事务中提交，
        // 避免 QA 处理中出现用户可见的临时数据。
        const result = await lease.complete(async (session) => {
          const result = await preCreateDatasetDataAndPushToTrainingQueue({
            teamId: data.teamId,
            tmbId: data.tmbId,
            datasetId: data.datasetId,
            collectionId: data.collectionId,
            mode: TrainingModeEnum.chunk,
            data: qaArr.map((item) => ({
              ...item,
              ...(data.dataMetadata && { metadata: data.dataMetadata }),
              chunkIndex: data.chunkIndex
            })),
            billId: data.billId,
            vectorModel: embeddingModelData,
            agentModel: modelData,
            vlmModel: vlmModelData,
            session
          });

          if (result.insertLen === 0) {
            throw new Error('QA 未生成有效结果');
          }

          return result;
        });

        // Push usage
        pushLLMTrainingUsage({
          teamId: data.teamId,
          inputTokens,
          outputTokens,
          usageId: data.billId,
          model: modelData,
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
        if (!(err instanceof TrainingLeaseLostError)) {
          await lease.fail(err);
        }

        await delay(100);
      } finally {
        await lease.stop();
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
  llmModel: LLMSystemModelDataType;
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
