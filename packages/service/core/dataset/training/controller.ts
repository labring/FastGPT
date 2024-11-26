import { MongoDatasetTraining } from './schema';
import type {
  PushDatasetDataChunkProps,
  PushDatasetDataProps,
  PushDatasetDataResponse
} from '@fastgpt/global/core/dataset/api.d';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { simpleText } from '@fastgpt/global/common/string/tools';
import { ClientSession } from '../../../common/mongo';
import { getLLMModel, getVectorModel } from '../../ai/model';
import { addLog } from '../../../common/system/log';
import { getCollectionWithDataset } from '../controller';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';

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
}: {
  teamId: string;
  tmbId: string;
  session?: ClientSession;
} & PushDatasetDataProps) => {
  const {
    datasetId: { _id: datasetId, agentModel, vectorModel }
  } = await getCollectionWithDataset(collectionId);
  return pushDataListToTrainingQueue({
    ...props,
    datasetId,
    collectionId,
    agentModel,
    vectorModel
  });
};

export async function pushDataListToTrainingQueue({
  teamId,
  tmbId,
  datasetId,
  collectionId,
  agentModel,
  vectorModel,
  data,
  prompt,
  billId,
  trainingMode = TrainingModeEnum.chunk,
  session
}: {
  teamId: string;
  tmbId: string;
  datasetId: string;
  agentModel: string;
  vectorModel: string;
  session?: ClientSession;
} & PushDatasetDataProps): Promise<PushDatasetDataResponse> {
  const { model, maxToken, weight } = await (async () => {
    const agentModelData = getLLMModel(agentModel);
    if (!agentModelData) {
      return Promise.reject(`File model ${agentModel} is inValid`);
    }
    const vectorModelData = getVectorModel(vectorModel);
    if (!vectorModelData) {
      return Promise.reject(`Vector model ${vectorModel} is inValid`);
    }

    if (trainingMode === TrainingModeEnum.chunk) {
      return {
        maxToken: vectorModelData.maxToken * 1.5,
        model: vectorModelData.model,
        weight: vectorModelData.weight
      };
    }

    if (trainingMode === TrainingModeEnum.qa || trainingMode === TrainingModeEnum.auto) {
      return {
        maxToken: agentModelData.maxContext * 0.8,
        model: agentModelData.model,
        weight: 0
      };
    }

    return Promise.reject(`Training mode "${trainingMode}" is inValid`);
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

    if (text.length > maxToken) {
      filterResult.overToken.push(item);
      return;
    }

    if (set.has(text)) {
      console.log('repeat', item);
      filterResult.repeat.push(item);
    } else {
      filterResult.success.push(item);
      set.add(text);
    }
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
          datasetId,
          collectionId,
          billId,
          mode: trainingMode,
          prompt,
          model,
          q: item.q,
          a: item.a,
          chunkIndex: item.chunkIndex ?? 0,
          weight: weight ?? 0,
          indexes: item.indexes
        })),
        {
          session,
          ordered: true
        }
      );
    } catch (error: any) {
      addLog.error(`Insert error`, error);
      // 如果有错误，将失败的文档添加到失败列表中
      error.writeErrors?.forEach((writeError: any) => {
        failedDocuments.push(data[writeError.index]);
      });
      console.log('failed', failedDocuments);
    }

    // 对于失败的文档，尝试单独插入
    await MongoDatasetTraining.create(failedDocuments, { session });

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

  return {
    insertLen,
    ...filterResult
  };
}
