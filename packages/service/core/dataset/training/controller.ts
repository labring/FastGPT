import { MongoDatasetTraining } from './schema';
import type {
  PushDatasetDataChunkProps,
  PushDatasetDataResponse
} from '@fastgpt/global/core/dataset/api.d';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { simpleText } from '@fastgpt/global/common/string/tools';
import { type ClientSession } from '../../../common/mongo';
import { getLLMModel, getEmbeddingModel, getVlmModel } from '../../ai/model';
import { addLog } from '../../../common/system/log';
import { getCollectionWithDataset } from '../controller';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { type PushDataToTrainingQueueProps } from '@fastgpt/global/core/dataset/training/type';
import { i18nT } from '../../../../web/i18n/utils';
import {
  getLLMDefaultChunkSize,
  getLLMMaxChunkSize
} from '../../../../global/core/dataset/training/utils';
import { connectionMongo } from '../../../common/mongo';

export const lockTrainingDataByTeamId = async (teamId: string): Promise<any> => {
  try {
    await MongoDatasetTraining.updateMany(
      {
        teamId
      },
      {
        lockTime: new Date('2999/5/5')
      }
    );
  } catch (error) {}
};

export const pushDataListToTrainingQueueByCollectionId = async ({
  collectionId,
  ...props
}: Omit<PushDataToTrainingQueueProps, 'datasetId' | 'agentModel' | 'vectorModel' | 'vlmModel'>) => {
  const {
    dataset: { _id: datasetId, agentModel, vectorModel, vlmModel }
  } = await getCollectionWithDataset(collectionId);
  return pushDataListToTrainingQueue({
    ...props,
    datasetId,
    collectionId,
    vectorModel,
    agentModel,
    vlmModel
  });
};

export async function pushDataListToTrainingQueue({
  teamId,
  tmbId,
  datasetId,
  collectionId,
  agentModel,
  vectorModel,
  vlmModel,
  data,
  prompt,
  billId,
  mode = TrainingModeEnum.chunk,
  indexSize,
  session
}: PushDataToTrainingQueueProps): Promise<PushDatasetDataResponse> {
  console.log('pushDataListToTrainingQueue参数:', {
    teamId,
    tmbId,
    datasetId,
    collectionId,
    agentModel,
    vectorModel,
    vlmModel,
    mode,
    indexSize,
    dataLen: data.length
  });

  const mongoose = connectionMongo;
  const ObjectId = mongoose.Types.ObjectId;

  const objectIdDatasetId = typeof datasetId === 'string' ? new ObjectId(datasetId) : datasetId;
  const objectIdCollectionId =
    collectionId && typeof collectionId === 'string' ? new ObjectId(collectionId) : collectionId;

  const getImageChunkMode = (data: PushDatasetDataChunkProps, mode: TrainingModeEnum) => {
    if (mode !== TrainingModeEnum.image) return mode;
    // 检查内容中，是否包含 ![](xxx) 的图片格式
    const text = data.q + data.a || '';
    const regex = /!\[\]\((.*?)\)/g;
    const match = text.match(regex);
    if (match) {
      return TrainingModeEnum.image;
    }
    return mode;
  };

  const vectorModelData = getEmbeddingModel(vectorModel);
  if (!vectorModelData) {
    console.log('未配置embedding模型');
    return Promise.reject(i18nT('common:error_embedding_not_config'));
  }
  const agentModelData = getLLMModel(agentModel);
  if (!agentModelData) {
    console.log('未配置LLM模型');
    return Promise.reject(i18nT('common:error_llm_not_config'));
  }
  if (mode === TrainingModeEnum.chunk || mode === TrainingModeEnum.auto) {
    prompt = undefined;
  }

  const { model, maxToken, weight } = await (async () => {
    if (mode === TrainingModeEnum.chunk) {
      return {
        maxToken: getLLMMaxChunkSize(agentModelData),
        model: vectorModelData.model,
        weight: vectorModelData.weight
      };
    }
    if (mode === TrainingModeEnum.qa || mode === TrainingModeEnum.auto) {
      return {
        maxToken: getLLMMaxChunkSize(agentModelData),
        model: agentModelData.model,
        weight: 0
      };
    }
    if (mode === TrainingModeEnum.image) {
      const vllmModelData = getVlmModel(vlmModel);
      if (!vllmModelData) {
        console.log('未配置VLM模型');
        return Promise.reject(i18nT('common:error_vlm_not_config'));
      }
      return {
        maxToken: getLLMMaxChunkSize(vllmModelData),
        model: vllmModelData.model,
        weight: 0
      };
    }
    if (mode === TrainingModeEnum.imageParse) {
      const vllmModelData = getVlmModel(vlmModel);
      if (!vllmModelData) {
        console.log('未配置VLM模型');
        return Promise.reject(i18nT('common:error_vlm_not_config'));
      }
      return {
        maxToken: getLLMMaxChunkSize(vllmModelData),
        model: vllmModelData.model,
        weight: 0
      };
    }

    return Promise.reject(`Training mode "${mode}" is inValid`);
  })();

  // filter repeat or equal content
  const set = new Set();
  const filterResult: Record<string, PushDatasetDataChunkProps[]> = {
    success: [],
    overToken: [],
    repeat: [],
    error: []
  };

  // format q and a, remove empty char
  data.forEach((item) => {
    item.q = simpleText(item.q);
    item.a = simpleText(item.a);

    item.indexes = item.indexes
      ?.map((index) => {
        return {
          ...index,
          text: simpleText(index.text)
        };
      })
      .filter(Boolean);

    // filter repeat content
    if (!item.q) {
      filterResult.error.push(item);
      return;
    }

    const text = item.q + item.a;

    // Oversize llm tokens
    if (text.length > maxToken) {
      filterResult.overToken.push(item);
      return;
    }

    if (set.has(text)) {
      filterResult.repeat.push(item);
    } else {
      filterResult.success.push(item);
      set.add(text);
    }
  });

  console.log('过滤后数据统计:', {
    success: filterResult.success.length,
    overToken: filterResult.overToken.length,
    repeat: filterResult.repeat.length,
    error: filterResult.error.length
  });

  // insert data to db
  const insertLen = filterResult.success.length;
  const failedDocuments: PushDatasetDataChunkProps[] = [];

  // 使用 insertMany 批量插入
  const batchSize = 200;
  const insertData = async (startIndex: number, session: ClientSession) => {
    const list = filterResult.success.slice(startIndex, startIndex + batchSize);

    if (list.length === 0) return;

    try {
      await MongoDatasetTraining.insertMany(
        list.map((item) => ({
          teamId,
          tmbId,
          datasetId: objectIdDatasetId,
          collectionId: objectIdCollectionId,
          billId,
          mode: getImageChunkMode(item, mode),
          prompt,
          model,
          q: item.q,
          a: item.a,
          chunkIndex: item.chunkIndex ?? 0,
          indexSize,
          weight: weight ?? 0,
          indexes: item.indexes,
          retryCount: 5
        })),
        {
          session,
          ordered: true
        }
      );
      console.log(`批量插入成功: ${list.length} 条`);
    } catch (error: any) {
      addLog.error(`Insert error`, error);
      // 如果有错误，将失败的文档添加到失败列表中
      error.writeErrors?.forEach((writeError: any) => {
        failedDocuments.push(data[writeError.index]);
      });
      console.log('批量插入失败，失败文档:', failedDocuments);
    }

    // 对于失败的文档，尝试单独插入
    if (failedDocuments.length > 0) {
      try {
        await MongoDatasetTraining.create(failedDocuments, { session });
        console.log('单独插入失败文档成功:', failedDocuments.length);
      } catch (e) {
        console.log('单独插入失败文档仍然失败:', e);
      }
    }

    return insertData(startIndex + batchSize, session);
  };

  if (session) {
    await insertData(0, session);
  } else {
    await mongoSessionRun(async (session) => {
      await insertData(0, session);
    });
  }

  delete filterResult.success;

  console.log('pushDataListToTrainingQueue完成:', {
    insertLen,
    overToken: filterResult.overToken.length,
    repeat: filterResult.repeat.length,
    error: filterResult.error.length
  });

  return {
    insertLen,
    ...filterResult
  };
}
