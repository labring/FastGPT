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
import { getLLMMaxChunkSize } from '../../../../global/core/dataset/training/utils';

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
  const formatTrainingMode = (data: PushDatasetDataChunkProps, mode: TrainingModeEnum) => {
    if (mode !== TrainingModeEnum.image) return mode;
    // 检查内容中，是否包含 ![](xxx) 的图片格式
    const text = (data.q || '') + (data.a || '');
    const regex = /!\[\]\((.*?)\)/g;
    const match = text.match(regex);
    if (match) {
      return TrainingModeEnum.image;
    }
    return mode;
  };

  const vectorModelData = getEmbeddingModel(vectorModel);
  if (!vectorModelData) {
    return Promise.reject(i18nT('common:error_embedding_not_config'));
  }
  const agentModelData = getLLMModel(agentModel);
  if (!agentModelData) {
    return Promise.reject(i18nT('common:error_llm_not_config'));
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
    if (mode === TrainingModeEnum.image || mode === TrainingModeEnum.imageParse) {
      const vllmModelData = getVlmModel(vlmModel);
      if (!vllmModelData) {
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

  // format q and a, remove empty char
  data = data.filter((item) => {
    const q = item.q || '';
    const a = item.a || '';

    // filter repeat content
    if (!item.imageId && !q) {
      return;
    }

    const text = q + a;

    // Oversize llm tokens
    if (text.length > maxToken) {
      return;
    }

    return true;
  });

  // insert data to db
  const insertLen = data.length;

  // 使用 insertMany 批量插入
  const batchSize = 500;
  const insertData = async (startIndex: number, session: ClientSession) => {
    const list = data.slice(startIndex, startIndex + batchSize);

    if (list.length === 0) return;

    try {
      const result = await MongoDatasetTraining.insertMany(
        list.map((item) => ({
          teamId,
          tmbId,
          datasetId: datasetId,
          collectionId: collectionId,
          billId,
          mode: formatTrainingMode(item, mode),
          prompt,
          model,
          ...(item.q && { q: item.q }),
          ...(item.a && { a: item.a }),
          ...(item.imageId && { imageId: item.imageId }),
          chunkIndex: item.chunkIndex ?? 0,
          indexSize,
          weight: weight ?? 0,
          indexes: item.indexes,
          retryCount: 5
        })),
        {
          session,
          ordered: false,
          rawResult: true,
          includeResultMetadata: false // 进一步减少返回数据
        }
      );

      if (result.insertedCount !== list.length) {
        return Promise.reject(`Insert data error, ${JSON.stringify(result)}`);
      }
    } catch (error: any) {
      addLog.error(`Insert error`, error);
      return Promise.reject(error);
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

  return {
    insertLen
  };
}

export const pushDatasetToParseQueue = async ({
  teamId,
  tmbId,
  datasetId,
  collectionId,
  billId,
  session
}: {
  teamId: string;
  tmbId: string;
  datasetId: string;
  collectionId: string;
  billId: string;
  session: ClientSession;
}) => {
  await MongoDatasetTraining.create(
    [
      {
        teamId,
        tmbId,
        datasetId,
        collectionId,
        billId,
        mode: TrainingModeEnum.parse
      }
    ],
    { session, ordered: true }
  );
};
