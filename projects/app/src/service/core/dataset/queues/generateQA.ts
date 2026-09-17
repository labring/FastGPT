import { getModelHandle } from '@fastgpt/service/core/ai/model';
import { getDatasetModelReference } from '@fastgpt/service/core/dataset/model';

import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { pushLLMTrainingUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/llm/type';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { replaceVariable } from '@fastgpt/service/common/string/replaceVariable';
import { Prompt_AgentQA } from '@fastgpt/global/core/ai/prompt/agent';
import type { PushDataChunkType } from '@fastgpt/global/openapi/core/dataset/data/api';

import { checkTeamAiPointsAndLock } from './utils';
import { addMinutes } from 'date-fns';
import type { LLMSystemModelDataType } from '@fastgpt/global/core/ai/model/schema';
import type { EmbeddingSystemModelDataType } from '@fastgpt/global/core/ai/model/schema';
import {
  chunkAutoChunkSize,
  getLLMMaxChunkSize
} from '@fastgpt/global/core/dataset/training/utils';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { delay } from '@fastgpt/global/common/system/utils';
import { text2Chunks } from '@fastgpt/service/worker/function';
import {
  markDatasetDataIndexing,
  pushDataListToTrainingQueue
} from '@fastgpt/service/core/dataset/training/controller';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { Types } from '@fastgpt/service/common/mongo';
import { DatasetDataIndexStatusEnum } from '@fastgpt/global/core/dataset/data/constants';
import { createLLMResponse } from '@fastgpt/service/core/ai/llm/request';
import { UsageItemTypeEnum } from '@fastgpt/global/support/wallet/usage/constants';
import type { DatasetSchemaType } from '@fastgpt/global/core/dataset/type';

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
                select: 'agentModelId agentModel vectorModelId vectorModel vlmModelId vlmModel'
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
        } catch {
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
      if (!(await checkTeamAiPointsAndLock(data.teamId, String(data._id)))) {
        continue;
      }

      // 提前落库的数据在领取时推进为 indexing；问答事务提交后源数据回到 parsed。
      if (data.dataId) {
        await markDatasetDataIndexing({ dataId: String(data.dataId) });
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

        if (data.dataId) {
          // 提前落库的问答分支：源数据复用为第一条叶子，其余叶子新建 parsed 数据与任务。
          await replacePreCreatedDataWithQALeaves({
            trainingData: data,
            qaArr,
            vectorModel: embeddingModelData,
            agentModel: modelData,
            vlmModel: vlmModelData
          });
        } else {
          // 旧任务：继续创建数据。
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
            vectorModel: embeddingModelData,
            agentModel: modelData,
            vlmModel: vlmModelData
          });

          // delete data from training
          await MongoDatasetTraining.findByIdAndDelete(data._id);
        }

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

/**
 * 问答一对多：把提前落库的源数据替换为第一条 QA 叶子，其余叶子创建新的 parsed 数据与 chunk 任务。
 *
 * 数据替换、任务改派和叶子创建在同一个 Mongo 事务内提交：事务前列表显示原始分块，事务后显示
 * 最终 QA 叶子，不出现中间数据状态。源数据保留自己的 metadata，叶子复制源 metadata。
 *
 * N=0 时业务上等同 QA 未产出：源数据回到 parsed，不删除也不新增数据行，任务按现有失败语义处理。
 */
const replacePreCreatedDataWithQALeaves = async ({
  trainingData,
  qaArr,
  vectorModel,
  agentModel,
  vlmModel
}: {
  trainingData: {
    _id: string;
    dataId?: string;
    teamId: string;
    tmbId: string;
    datasetId: string;
    collectionId: string;
    billId: string;
    chunkIndex?: number;
  };
  qaArr: PushDataChunkType[];
  vectorModel: EmbeddingSystemModelDataType;
  agentModel: LLMSystemModelDataType;
  vlmModel?: LLMSystemModelDataType;
}) => {
  if (qaArr.length === 0) {
    await MongoDatasetData.updateOne(
      { _id: trainingData.dataId },
      { $set: { indexStatus: DatasetDataIndexStatusEnum.parsed } }
    );
    return Promise.reject('QA 未生成任何结果');
  }

  return mongoSessionRun(async (session) => {
    const sourceData = await MongoDatasetData.findById(trainingData.dataId).session(session).lean();
    if (!sourceData) {
      return Promise.reject('Dataset data not found');
    }

    const chunkIndex = sourceData.chunkIndex ?? trainingData.chunkIndex ?? 0;
    const [firstLeaf, ...restLeaves] = qaArr;

    // 1. 源数据复用为第一条叶子，保留 metadata，状态回到 parsed。
    //    indexes 显式清空：状态从待索引回退时必须与清空向量引用在同一写入边界（DS-17）。
    await MongoDatasetData.updateOne(
      { _id: sourceData._id },
      {
        $set: {
          q: firstLeaf.q || '',
          a: firstLeaf.a,
          indexes: [],
          indexStatus: DatasetDataIndexStatusEnum.parsed,
          updateTime: new Date()
        }
      },
      { session }
    );

    // 2. 原任务改派为第一条叶子的 chunk 任务，保留 _id/dataId/billId，只改写叶子内容。
    await MongoDatasetTraining.updateOne(
      { _id: trainingData._id },
      {
        $set: {
          mode: TrainingModeEnum.chunk,
          q: firstLeaf.q || '',
          a: firstLeaf.a,
          chunkIndex,
          weight: vectorModel.config.weight,
          lockTime: new Date('2000/1/1'),
          retryCount: 5
        },
        $unset: { errorMsg: '' }
      },
      { session }
    );

    if (restLeaves.length === 0) return;

    // 3. 其余叶子复制源 metadata，分别创建 parsed 数据和带对应 dataId 的 chunk 任务。
    const leaves = restLeaves.map((item) => ({
      dataId: String(new Types.ObjectId()),
      q: item.q || '',
      a: item.a
    }));

    await MongoDatasetData.create(
      leaves.map((leaf) => ({
        _id: leaf.dataId,
        teamId: trainingData.teamId,
        tmbId: trainingData.tmbId,
        datasetId: trainingData.datasetId,
        collectionId: trainingData.collectionId,
        q: leaf.q,
        a: leaf.a,
        ...(sourceData.metadata && { metadata: sourceData.metadata }),
        chunkIndex,
        indexes: [],
        indexStatus: DatasetDataIndexStatusEnum.parsed,
        ...(sourceData.synonymVersion !== undefined && {
          synonymVersion: sourceData.synonymVersion
        })
      })),
      { session, ordered: true }
    );

    await pushDataListToTrainingQueue({
      teamId: trainingData.teamId,
      tmbId: trainingData.tmbId,
      datasetId: trainingData.datasetId,
      collectionId: trainingData.collectionId,
      mode: TrainingModeEnum.chunk,
      data: leaves.map((leaf) => ({
        dataId: leaf.dataId,
        q: leaf.q,
        a: leaf.a,
        chunkIndex
      })),
      billId: trainingData.billId,
      vectorModel,
      agentModel,
      vlmModel,
      session
    });
  });
};

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
