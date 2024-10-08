import type { NextApiRequest, NextApiResponse } from 'next';
import { uploadFile } from '@fastgpt/service/common/file/gridfs/controller';
import { getUploadModel } from '@fastgpt/service/common/file/multer';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { FileCreateDatasetCollectionParams } from '@fastgpt/global/core/dataset/api';
import { removeFilesByPaths } from '@fastgpt/service/common/file/utils';
import { createOneCollection } from '@fastgpt/service/core/dataset/collection/controller';
import {
  DatasetCollectionTypeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { getNanoid, hashStr } from '@fastgpt/global/common/string/tools';
import { splitText2Chunks } from '@fastgpt/global/common/string/textSplitter';
import { checkDatasetLimit } from '@fastgpt/service/support/permission/teamLimit';
import { predictDataLimitLength } from '@fastgpt/global/core/dataset/utils';
import { pushDataListToTrainingQueue } from '@fastgpt/service/core/dataset/training/controller';
import { createTrainingUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { getDatasetModel, getVectorModel } from '@fastgpt/service/core/ai/model';
import { BucketNameEnum } from '@fastgpt/global/common/file/constants';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoImage } from '@fastgpt/service/common/file/image/schema';
import { readRawTextByLocalFile } from '@fastgpt/service/common/file/read/utils';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { CreateCollectionResponse } from '@/global/core/dataset/api';

async function handler(req: NextApiRequest, res: NextApiResponse<any>): CreateCollectionResponse {
  let filePaths: string[] = [];

  try {
    // Create multer uploader
    const upload = getUploadModel({
      maxSize: global.feConfigs?.uploadFileMaxSize
    });
    const { file, data, bucketName } = await upload.doUpload<FileCreateDatasetCollectionParams>(
      req,
      res,
      BucketNameEnum.dataset
    );
    filePaths = [file.path];

    if (!file || !bucketName) {
      throw new Error('file is empty');
    }

    const { teamId, tmbId, dataset } = await authDataset({
      req,
      authToken: true,
      authApiKey: true,
      per: WritePermissionVal,
      datasetId: data.datasetId
    });

    const {
      trainingType = TrainingModeEnum.chunk,
      chunkSize = 512,
      chunkSplitter,
      qaPrompt
    } = data;
    const { fileMetadata, collectionMetadata, ...collectionData } = data;
    const collectionName = file.originalname;

    const relatedImgId = getNanoid();

    // 1. read file
    const { rawText } = await readRawTextByLocalFile({
      teamId,
      path: file.path,
      metadata: {
        ...fileMetadata,
        relatedId: relatedImgId
      }
    });

    // 2. upload file
    const fileId = await uploadFile({
      teamId,
      tmbId,
      bucketName,
      path: file.path,
      filename: file.originalname,
      contentType: file.mimetype,
      metadata: fileMetadata
    });

    // 3. delete tmp file
    removeFilesByPaths(filePaths);

    // 4. split raw text to chunks
    const { chunks } = splitText2Chunks({
      text: rawText,
      chunkLen: chunkSize,
      overlapRatio: trainingType === TrainingModeEnum.chunk ? 0.2 : 0,
      customReg: chunkSplitter ? [chunkSplitter] : []
    });

    // 5. check dataset limit
    await checkDatasetLimit({
      teamId,
      insertLen: predictDataLimitLength(trainingType, chunks)
    });

    // 6. create collection and training bill
    const { collectionId, insertResults } = await mongoSessionRun(async (session) => {
      const { _id: collectionId } = await createOneCollection({
        ...collectionData,
        name: collectionName,
        teamId,
        tmbId,
        type: DatasetCollectionTypeEnum.file,
        fileId,
        rawTextLength: rawText.length,
        hashRawText: hashStr(rawText),
        metadata: {
          ...collectionMetadata,
          relatedImgId
        },
        session
      });
      const { billId } = await createTrainingUsage({
        teamId,
        tmbId,
        appName: collectionName,
        billSource: UsageSourceEnum.training,
        vectorModel: getVectorModel(dataset.vectorModel)?.name,
        agentModel: getDatasetModel(dataset.agentModel)?.name
      });

      // 7. push chunks to training queue
      const insertResults = await pushDataListToTrainingQueue({
        teamId,
        tmbId,
        datasetId: dataset._id,
        collectionId,
        agentModel: dataset.agentModel,
        vectorModel: dataset.vectorModel,
        trainingMode: trainingType,
        prompt: qaPrompt,
        billId,
        data: chunks.map((text, index) => ({
          q: text,
          chunkIndex: index
        }))
      });

      // 8. remove image expired time
      await MongoImage.updateMany(
        {
          teamId,
          'metadata.relatedId': relatedImgId
        },
        {
          // Remove expiredTime to avoid ttl expiration
          $unset: {
            expiredTime: 1
          }
        },
        {
          session
        }
      );

      return {
        collectionId,
        insertResults
      };
    });

    return { collectionId, results: insertResults };
  } catch (error) {
    removeFilesByPaths(filePaths);

    return Promise.reject(error);
  }
}

export const config = {
  api: {
    bodyParser: false
  }
};

export default NextAPI(handler);
