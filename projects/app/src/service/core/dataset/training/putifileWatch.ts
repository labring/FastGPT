import {
  DatasetCollectionTypeEnum,
  TrainingModeEnum,
  TrainingStatusEnum
} from '@fastgpt/global/core/dataset/constants';
import {
  DatasetCollectionSchemaType,
  DatasetTrainingSchemaType
} from '@fastgpt/global/core/dataset/type';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { GET } from '@fastgpt/service/common/api/httpRequest';
import { rawText2Chunks, readFileRawTextByUrl } from '@fastgpt/service/core/dataset/read';
import { createTrainingUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { getLLMModel, getVectorModel } from '@fastgpt/service/core/ai/model';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { pushDataListToTrainingQueue } from '@fastgpt/service/core/dataset/training/controller';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { hashStr } from '@fastgpt/global/common/string/tools';

// putifile配置
const PUTI_URL = process.env.PUTI_URL || '';
const PUTI_KEY = process.env.PUTI_KEY || '';
const PUTI_TENANT = process.env.PUTI_TENANT || 0;

type PutifileResp<T> = {
  code: number;
  msg: string;
  data: T;
};

/**
 * 监听数据集集合的变化
 * 主要处理同步过来的putifile文件，生成QA或者嵌入向量
 */
export const createDatasetCollectionMongoWatch = () => {
  const changeStream = MongoDatasetCollection.watch();

  changeStream.on('change', async (change) => {
    try {
      if (change.operationType === 'insert') {
        const fullDocument = change.fullDocument as DatasetCollectionSchemaType;
        console.log('putifile文件:开始解析嵌入......', fullDocument);
        const {
          _id,
          teamId,
          tmbId,
          datasetId,
          type,
          trainingType,
          trainingStatus,
          name,
          qaPrompt,
          externalFileId,
          externalFileUrl,
          chunkSize,
          chunkSplitter
        } = fullDocument;
        if (
          (type === DatasetCollectionTypeEnum.externalFile ||
            type === DatasetCollectionTypeEnum.putiFile) &&
          trainingStatus === TrainingStatusEnum.pending
        ) {
          console.log('putifile文件:开始解析嵌入......', _id, name);
          try {
            // 0.获取数据集
            const dataset = await MongoDataset.findById(datasetId);
            // 1.获取文件
            let fileUrl: string = '';
            if (type === DatasetCollectionTypeEnum.externalFile && externalFileUrl) {
              fileUrl = externalFileUrl;
            } else {
              const fileResp = await GET<PutifileResp<string>>(
                `${PUTI_URL}/klg/file/${externalFileId}/temp-access-url`,
                {},
                { headers: { 'x-api-key': PUTI_KEY } }
              );
              console.log('putifile文件:获取文件地址成功.', _id, name, fileResp);
              fileUrl = fileResp.data;
            }
            console.log(
              'putifile文件:获取文件地址成功:',
              _id,
              name,
              name.split('.').pop()?.toLowerCase(),
              fileUrl
            );
            // 2.解析文件(读取文件为文本)
            const rawText = await readFileRawTextByUrl({
              teamId,
              url: fileUrl,
              extension: name.split('.').pop()?.toLowerCase()
            });
            console.log('putifile文件:获取文件内容成功:', _id, name, rawText);
            // 3.创建数据分片
            const chunks = rawText2Chunks({
              rawText,
              chunkLen: chunkSize,
              overlapRatio: 0.2,
              customReg: chunkSplitter ? [chunkSplitter] : []
            });
            // 4.放入嵌入向量处理队列
            await mongoSessionRun(async (session) => {
              const { billId } = await createTrainingUsage({
                teamId,
                tmbId,
                appName: name,
                billSource: UsageSourceEnum.training,
                vectorModel: getVectorModel(dataset?.vectorModel)?.name,
                agentModel: getLLMModel(dataset?.agentModel)?.name,
                session
              });
              await pushDataListToTrainingQueue({
                teamId,
                tmbId,
                datasetId: datasetId,
                collectionId: _id,
                agentModel: dataset?.agentModel || '',
                vectorModel: dataset?.vectorModel || '',
                trainingMode: trainingType,
                prompt: qaPrompt,
                billId,
                data: chunks.map((item, index) => ({
                  ...item,
                  chunkIndex: index
                })),
                session
              });
            });
            // 更新文档状态为完成
            await MongoDatasetCollection.updateOne(
              { _id },
              {
                $set: {
                  hashRawText: hashStr(rawText),
                  rawTextLength: rawText.length,
                  trainingStatus: TrainingStatusEnum.success,
                  updateTime: new Date()
                }
              }
            );
          } catch (error) {
            console.error('putifile文件:{}.{}解析嵌入失败.详情:{}.', _id, name, error);
            // 更新文档状态为失败
            await MongoDatasetCollection.updateOne(
              { _id },
              {
                $set: {
                  trainingStatus: TrainingStatusEnum.failed,
                  updateTime: new Date()
                }
              }
            );
          }
        }
      }
    } catch (error) {}
  });
};
