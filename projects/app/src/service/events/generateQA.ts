import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { pushQABill } from '@/service/common/bill/push';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constant';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { sendInform } from '@/pages/api/user/inform/send';
import { authBalanceByUid } from '@fastgpt/service/support/user/auth';
import { getAIApi } from '@fastgpt/service/core/ai/config';
import type { ChatCompletionRequestMessage } from '@fastgpt/global/core/ai/type.d';
import { addLog } from '../utils/tools';
import { splitText2Chunks } from '@/global/common/string/tools';
import { replaceVariable } from '@/global/common/string/tools';
import { Prompt_AgentQA } from '@/global/core/prompt/agent';
import { pushDataToDatasetCollection } from '@/pages/api/core/dataset/data/pushData';

const reduceQueue = () => {
  global.qaQueueLen = global.qaQueueLen > 0 ? global.qaQueueLen - 1 : 0;
};

export async function generateQA(): Promise<any> {
  if (global.qaQueueLen >= global.systemEnv.qaMaxProcess) return;
  global.qaQueueLen++;

  let trainingId = '';
  let userId = '';

  try {
    const data = await MongoDatasetTraining.findOneAndUpdate(
      {
        mode: TrainingModeEnum.qa,
        lockTime: { $lte: new Date(Date.now() - 10 * 60 * 1000) }
      },
      {
        lockTime: new Date()
      }
    ).select({
      _id: 1,
      userId: 1,
      datasetCollectionId: 1,
      q: 1,
      model: 1,
      prompt: 1,
      billId: 1
    });

    // task preemption
    if (!data) {
      reduceQueue();
      global.qaQueueLen <= 0 && console.log(`【QA】任务完成`);
      return;
    }

    trainingId = data._id;
    userId = String(data.userId);

    await authBalanceByUid(userId);

    const startTime = Date.now();

    // request LLM to get QA
    const text = data.q;
    const messages: ChatCompletionRequestMessage[] = [
      {
        role: 'user',
        content: data.prompt
          ? replaceVariable(data.prompt, { text })
          : replaceVariable(Prompt_AgentQA.prompt, {
              theme: Prompt_AgentQA.defaultTheme,
              text
            })
      }
    ];
    const ai = getAIApi(undefined, 480000);
    const chatResponse = await ai.chat.completions.create({
      model: global.qaModels[0].model,
      temperature: 0.01,
      messages,
      stream: false
    });
    const answer = chatResponse.choices?.[0].message?.content;
    const totalTokens = chatResponse.usage?.total_tokens || 0;

    const qaArr = formatSplitText(answer || ''); // 格式化后的QA对

    // get vector and insert
    await pushDataToDatasetCollection({
      userId,
      collectionId: data.datasetCollectionId,
      data: qaArr,
      mode: TrainingModeEnum.index,
      billId: data.billId
    });

    // delete data from training
    await MongoDatasetTraining.findByIdAndDelete(data._id);

    console.log(`split result length: `, qaArr.length);
    console.log('生成QA成功，time:', `${(Date.now() - startTime) / 1000}s`);

    // 计费
    if (qaArr.length > 0) {
      pushQABill({
        userId: data.userId,
        totalTokens,
        billId: data.billId
      });
    } else {
      addLog.info(`QA result 0:`, { answer });
    }

    reduceQueue();
    generateQA();
  } catch (err: any) {
    reduceQueue();
    // log
    if (err?.response) {
      console.log('openai error: 生成QA错误');
      console.log(err.response?.status, err.response?.statusText, err.response?.data);
    } else {
      addLog.error('生成 QA 错误', err);
    }

    // message error or openai account error
    if (err?.message === 'invalid message format') {
      await MongoDatasetTraining.findByIdAndRemove(trainingId);
    }

    // 账号余额不足，删除任务
    if (userId && err === ERROR_ENUM.insufficientQuota) {
      sendInform({
        type: 'system',
        title: 'QA 任务中止',
        content:
          '由于账号余额不足，索引生成任务中止，重新充值后将会继续。暂停的任务将在 7 天后被删除。',
        userId
      });
      console.log('余额不足，暂停向量生成任务');
      await MongoDatasetTraining.updateMany(
        {
          userId
        },
        {
          lockTime: new Date('2999/5/5')
        }
      );
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
function formatSplitText(text: string) {
  text = text.replace(/\\n/g, '\n'); // 将换行符替换为空格
  const regex = /Q\d+:(\s*)(.*)(\s*)A\d+:(\s*)([\s\S]*?)(?=Q|$)/g; // 匹配Q和A的正则表达式
  const matches = text.matchAll(regex); // 获取所有匹配到的结果

  const result = []; // 存储最终的结果
  for (const match of matches) {
    const q = match[2];
    const a = match[5];
    if (q && a) {
      // 如果Q和A都存在，就将其添加到结果中
      result.push({
        q: `${q}\n${a.trim().replace(/\n\s*/g, '\n')}`,
        a: ''
      });
    }
  }

  // empty result. direct split chunk
  if (result.length === 0) {
    const splitRes = splitText2Chunks({ text: text, maxLen: 500 });
    splitRes.chunks.forEach((item) => {
      result.push({
        q: item,
        a: ''
      });
    });
  }

  return result;
}
