import { TrainingData } from '@/service/mongo';
import { getApiKey } from '../utils/auth';
import { OpenAiChatEnum } from '@/constants/model';
import { pushSplitDataBill } from '@/service/events/pushBill';
import { openaiAccountError } from '../errorCode';
import { modelServiceToolMap } from '../utils/chat';
import { ChatRoleEnum } from '@/constants/chat';
import { BillTypeEnum } from '@/constants/user';
import { pushDataToKb } from '@/pages/api/openapi/kb/pushData';
import { TrainingModeEnum } from '@/constants/plugin';
import { ERROR_ENUM } from '../errorCode';

const reduceQueue = () => {
  global.qaQueueLen = global.qaQueueLen > 0 ? global.qaQueueLen - 1 : 0;
};

export async function generateQA(): Promise<any> {
  const maxProcess = Number(process.env.QA_MAX_PROCESS || 10);

  if (global.qaQueueLen >= maxProcess) return;
  global.qaQueueLen++;

  let trainingId = '';
  let userId = '';

  try {
    const match = {
      mode: TrainingModeEnum.qa,
      lockTime: { $lte: new Date(Date.now() - 4 * 60 * 1000) }
    };
    // random get task
    const agree = await TrainingData.aggregate([
      {
        $match: match
      },
      { $sample: { size: 1 } },
      {
        $project: {
          _id: 1
        }
      }
    ]);

    // no task
    if (agree.length === 0) {
      reduceQueue();
      global.qaQueueLen <= 0 && console.log(`没有需要【QA】的数据, ${global.qaQueueLen}`);
      return;
    }

    const data = await TrainingData.findOneAndUpdate(
      {
        _id: agree[0]._id,
        ...match
      },
      {
        lockTime: new Date()
      }
    ).select({
      _id: 1,
      userId: 1,
      kbId: 1,
      prompt: 1,
      q: 1,
      source: 1
    });

    // task preemption
    if (!data) {
      reduceQueue();
      return generateQA();
    }

    trainingId = data._id;
    userId = String(data.userId);
    const kbId = String(data.kbId);

    // 余额校验并获取 openapi Key
    const { systemAuthKey } = await getApiKey({
      model: OpenAiChatEnum.GPT35,
      userId,
      type: 'training',
      mustPay: true
    });

    const startTime = Date.now();

    // 请求 chatgpt 获取回答
    const response = await Promise.all(
      [data.q].map((text) =>
        modelServiceToolMap[OpenAiChatEnum.GPT35]
          .chatCompletion({
            apiKey: systemAuthKey,
            temperature: 0.8,
            messages: [
              {
                obj: ChatRoleEnum.System,
                value: `你是出题人
${data.prompt || '下面是"一段长文本"'}
从中选出5至20个题目和答案.答案详细.按格式返回: Q1:
A1:
Q2:
A2:
...`
              },
              {
                obj: 'Human',
                value: text
              }
            ],
            stream: false
          })
          .then(({ totalTokens, responseText, responseMessages }) => {
            const result = formatSplitText(responseText); // 格式化后的QA对
            console.log(`split result length: `, result.length);
            // 计费
            pushSplitDataBill({
              isPay: result.length > 0,
              userId: data.userId,
              type: BillTypeEnum.QA,
              textLen: responseMessages.map((item) => item.value).join('').length,
              totalTokens
            });
            return {
              rawContent: responseText,
              result
            };
          })
          .catch((err) => {
            console.log('QA拆分错误');
            console.log(err.response?.status, err.response?.statusText, err.response?.data);
            return Promise.reject(err);
          })
      )
    );

    const responseList = response.map((item) => item.result).flat();

    // 创建 向量生成 队列
    await pushDataToKb({
      kbId,
      data: responseList.map((item) => ({
        ...item,
        source: data.source
      })),
      userId,
      mode: TrainingModeEnum.index
    });

    // delete data from training
    await TrainingData.findByIdAndDelete(data._id);

    console.log('生成QA成功，time:', `${(Date.now() - startTime) / 1000}s`);

    reduceQueue();
    generateQA();
  } catch (err: any) {
    reduceQueue();
    // log
    if (err?.response) {
      console.log('openai error: 生成QA错误');
      console.log(err.response?.status, err.response?.statusText, err.response?.data);
    } else {
      console.log('生成QA错误:', err);
    }

    // message error or openai account error
    if (
      err?.message === 'invalid message format' ||
      err.response?.statusText === 'Unauthorized' ||
      openaiAccountError[err?.response?.data?.error?.code || err?.response?.data?.error?.type]
    ) {
      await TrainingData.findByIdAndRemove(trainingId);
    }

    // 账号余额不足，删除任务
    if (err === ERROR_ENUM.insufficientQuota) {
      console.log('余额不足，删除向量生成任务');
      await TrainingData.deleteMany({
        userId
      });
      return generateQA();
    }

    // unlock
    await TrainingData.findByIdAndUpdate(trainingId, {
      lockTime: new Date('2000/1/1')
    });

    setTimeout(() => {
      generateQA();
    }, 1000);
  }
}

/**
 * 检查文本是否按格式返回
 */
function formatSplitText(text: string) {
  const regex = /Q\d+:(\s*)(.*)(\s*)A\d+:(\s*)([\s\S]*?)(?=Q|$)/g; // 匹配Q和A的正则表达式
  const matches = text.matchAll(regex); // 获取所有匹配到的结果

  const result = []; // 存储最终的结果
  for (const match of matches) {
    const q = match[2];
    const a = match[5];
    if (q && a) {
      // 如果Q和A都存在，就将其添加到结果中
      result.push({
        q,
        a: a.trim().replace(/\n\s*/g, '\n')
      });
    }
  }

  return result;
}
