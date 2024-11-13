import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { pushQAUsage } from '@/service/support/wallet/usage/push';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { createChatCompletion } from '@fastgpt/service/core/ai/config';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type.d';
import { addLog } from '@fastgpt/service/common/system/log';
import { splitText2Chunks } from '@fastgpt/global/common/string/textSplitter';
import { replaceVariable } from '@fastgpt/global/common/string/tools';
import { Prompt_AgentQA } from '@fastgpt/global/core/ai/prompt/agent';
import type { PushDatasetDataChunkProps } from '@fastgpt/global/core/dataset/api.d';
import { getLLMModel } from '@fastgpt/service/core/ai/model';
import { checkTeamAiPointsAndLock } from './utils';
import { checkInvalidChunkAndLock } from '@fastgpt/service/core/dataset/training/utils';
import { addMinutes } from 'date-fns';
import { countGptMessagesTokens } from '@fastgpt/service/common/string/tiktoken/index';
import { pushDataListToTrainingQueueByCollectionId } from '@fastgpt/service/core/dataset/training/controller';
import { loadRequestMessages } from '@fastgpt/service/core/chat/utils';
import { llmCompletionsBodyFormat } from '@fastgpt/service/core/ai/utils';

const reduceQueue = () => {
  global.qaQueueLen = global.qaQueueLen > 0 ? global.qaQueueLen - 1 : 0;

  return global.qaQueueLen === 0;
};

export async function generateQA(): Promise<any> {
  const max = global.systemEnv?.qaMaxProcess || 10;
  if (global.qaQueueLen >= max) return;
  global.qaQueueLen++;

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
          lockTime: { $lte: addMinutes(new Date(), -6) },
          mode: TrainingModeEnum.qa
        },
        {
          lockTime: new Date()
        }
      )
        .select({
          _id: 1,
          teamId: 1,
          tmbId: 1,
          datasetId: 1,
          collectionId: 1,
          q: 1,
          model: 1,
          chunkIndex: 1,
          billId: 1,
          prompt: 1
        })
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
      addLog.error(`[QA Queue] Error`, error);
      return {
        error: true
      };
    }
  })();

  if (done || !data) {
    if (reduceQueue()) {
      addLog.info(`[QA Queue] Done`);
    }
    return;
  }
  if (error) {
    reduceQueue();
    return generateQA();
  }

  // auth balance
  if (!(await checkTeamAiPointsAndLock(data.teamId))) {
    reduceQueue();
    return generateQA();
  }
  addLog.info(`[QA Queue] Start`);

  try {
    const modelData = getLLMModel(data.model);
    const prompt = `${data.prompt || Prompt_AgentQA.description}
${replaceVariable(Prompt_AgentQA.fixedText, { text })}`;

    // request LLM to get QA
    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'user',
        content: prompt
      }
    ];

    const { response: chatResponse } = await createChatCompletion({
      body: llmCompletionsBodyFormat(
        {
          model: modelData.model,
          temperature: 0.3,
          messages: await loadRequestMessages({ messages, useVision: false }),
          stream: false
        },
        modelData
      )
    });
    const answer = chatResponse.choices?.[0].message?.content || '';

    const qaArr = formatSplitText(answer, text); // 格式化后的QA对

    addLog.info(`[QA Queue] Finish`, {
      time: Date.now() - startTime,
      splitLength: qaArr.length,
      usage: chatResponse.usage
    });

    // get vector and insert
    const { insertLen } = await pushDataListToTrainingQueueByCollectionId({
      teamId: data.teamId,
      tmbId: data.tmbId,
      collectionId: data.collectionId,
      trainingMode: TrainingModeEnum.chunk,
      data: qaArr.map((item) => ({
        ...item,
        chunkIndex: data.chunkIndex
      })),
      billId: data.billId
    });

    // delete data from training
    await MongoDatasetTraining.findByIdAndDelete(data._id);

    // add bill
    if (insertLen > 0) {
      pushQAUsage({
        teamId: data.teamId,
        tmbId: data.tmbId,
        tokens: await countGptMessagesTokens(messages),
        billId: data.billId,
        model: modelData.model
      });
    } else {
      addLog.info(`QA result 0:`, { answer });
    }

    reduceQueue();
    generateQA();
  } catch (err: any) {
    addLog.error(`[QA Queue] Error`);
    reduceQueue();

    if (await checkInvalidChunkAndLock({ err, data, errText: 'QA模型调用失败' })) {
      return generateQA();
    }

    setTimeout(() => {
      generateQA();
    }, 1000);
  }
}

/**
 * 检查文本是否按格式返回
 */
function formatSplitText(text: string, rawText: string) {
  text = text.replace(/\\n/g, '\n'); // 将换行符替换为空格
  const regex = /Q\d+:(\s*)(.*)(\s*)A\d+:(\s*)([\s\S]*?)(?=Q\d|$)/g; // 匹配Q和A的正则表达式
  const matches = text.matchAll(regex); // 获取所有匹配到的结果

  const result: PushDatasetDataChunkProps[] = []; // 存储最终的结果
  for (const match of matches) {
    const q = match[2] || '';
    const a = match[5] || '';
    if (q) {
      result.push({
        q,
        a,
        indexes: [
          {
            defaultIndex: true,
            text: `${q}\n${a.trim().replace(/\n\s*/g, '\n')}`
          }
        ]
      });
    }
  }

  // empty result. direct split chunk
  if (result.length === 0) {
    const { chunks } = splitText2Chunks({ text: rawText, chunkLen: 512 });
    chunks.forEach((chunk) => {
      result.push({
        q: chunk,
        a: '',
        indexes: [
          {
            defaultIndex: true,
            text: chunk
          }
        ]
      });
    });
  }

  return result;
}
