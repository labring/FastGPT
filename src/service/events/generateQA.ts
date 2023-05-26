import { TrainingData } from '@/service/mongo';
import { getApiKey } from '../utils/auth';
import { OpenAiChatEnum } from '@/constants/model';
import { pushSplitDataBill } from '@/service/events/pushBill';
import { openaiError2 } from '../errorCode';
import { modelServiceToolMap } from '../utils/chat';
import { ChatRoleEnum } from '@/constants/chat';
import { BillTypeEnum } from '@/constants/user';
import { pushDataToKb } from '@/pages/api/openapi/kb/pushData';
import { ERROR_ENUM } from '../errorCode';

// 每次最多选 1 组
const listLen = 1;

export async function generateQA(trainingId: string): Promise<any> {
  try {
    // 找出一个需要生成的 dataItem (4分钟锁)
    const data = await TrainingData.findOneAndUpdate(
      {
        _id: trainingId,
        lockTime: { $lte: Date.now() - 4 * 60 * 1000 }
      },
      {
        lockTime: new Date()
      }
    );

    if (!data || data.qaList.length === 0) {
      await TrainingData.findOneAndDelete({
        _id: trainingId,
        qaList: [],
        vectorList: []
      });
      return;
    }

    const qaList: string[] = data.qaList.slice(-listLen);

    // 余额校验并获取 openapi Key
    const { userOpenAiKey, systemAuthKey } = await getApiKey({
      model: OpenAiChatEnum.GPT35,
      userId: data.userId,
      type: 'training'
    });

    console.log(`正在生成一组QA, 包含 ${qaList.length} 组文本。ID: ${data._id}`);

    const startTime = Date.now();

    // 请求 chatgpt 获取回答
    const response = await Promise.all(
      qaList.map((text) =>
        modelServiceToolMap[OpenAiChatEnum.GPT35]
          .chatCompletion({
            apiKey: userOpenAiKey || systemAuthKey,
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
              isPay: !userOpenAiKey && result.length > 0,
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
    pushDataToKb({
      kbId: data.kbId,
      data: responseList,
      userId: data.userId
    });

    // 删除 QA 队列。如果小于 n 条，整个数据删掉。 如果大于 n 条，仅删数组后 n 个
    if (data.vectorList.length <= listLen) {
      await TrainingData.findByIdAndDelete(data._id);
    } else {
      await TrainingData.findByIdAndUpdate(data._id, {
        qaList: data.qaList.slice(0, -listLen),
        lockTime: new Date('2000/1/1')
      });
    }

    console.log('生成QA成功，time:', `${(Date.now() - startTime) / 1000}s`);

    generateQA(trainingId);
  } catch (err: any) {
    // log
    if (err?.response) {
      console.log('openai error: 生成QA错误');
      console.log(err.response?.status, err.response?.statusText, err.response?.data);
    } else {
      console.log('生成QA错误:', err);
    }

    // openai 账号异常或者账号余额不足，删除任务
    if (openaiError2[err?.response?.data?.error?.type] || err === ERROR_ENUM.insufficientQuota) {
      console.log('余额不足，删除向量生成任务');
      await TrainingData.findByIdAndDelete(trainingId);
      return;
    }

    // unlock
    await TrainingData.findByIdAndUpdate(trainingId, {
      lockTime: new Date('2000/1/1')
    });

    // 频率限制
    if (err?.response?.statusText === 'Too Many Requests') {
      console.log('生成向量次数限制，30s后尝试');
      return setTimeout(() => {
        generateQA(trainingId);
      }, 30000);
    }

    setTimeout(() => {
      generateQA(trainingId);
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
