/*
    Get one dataset collection detail
*/
import type { NextApiRequest } from 'next';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { getCollectionSourceData } from '@fastgpt/global/core/dataset/collection/utils';
import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { type DatasetCollectionItemType } from '@fastgpt/global/core/dataset/type';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { collectionTagsToTagLabel } from '@fastgpt/service/core/dataset/collection/utils';
import { getVectorCount } from '@fastgpt/service/common/vectorDB/controller';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { readFromSecondary } from '@fastgpt/service/common/mongo/utils';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { addLog } from '@fastgpt/service/common/system/log';
import { getS3DatasetSource } from '@fastgpt/service/common/s3/sources/dataset';
import { isS3ObjectKey } from '@fastgpt/service/common/s3/utils';

async function handler(req: NextApiRequest): Promise<DatasetCollectionItemType> {
  const { id } = req.query as { id: string };

  if (!id) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  // 凭证校验
  const { collection, permission } = await authDatasetCollection({
    req,
    authToken: true,
    authApiKey: true,
    collectionId: id,
    per: ReadPermissionVal
  });
  let default_prompt;
  if (global.feConfigs.isPlus && global.promptLoader) {
    default_prompt = {
      hypeIndexPrompt: global.promptLoader.loadTemplate(
        'hypeIndexes',
        getLocale(req),
        'generate_question_from_faq_prompt'
      ),
      autoIndexesPrompt: global.promptLoader.loadTemplate(
        'autoIndexes',
        getLocale(req),
        'auto_training_prompt'
      ),
      imageIndexPrompt: global.promptLoader.loadTemplate(
        'imageIndex',
        getLocale(req),
        'image_index_prompt'
      )
    };
    addLog.debug(
      `[DatasetCollectionDetail] load default prompt success,${JSON.stringify(default_prompt)}`
    );
  }
  const fileId = collection?.fileId;
  if (fileId && !isS3ObjectKey(fileId, 'dataset')) {
    return Promise.reject('Invalid dataset file key');
  }

  const [file, indexAmount, errorCount] = await Promise.all([
    fileId ? getS3DatasetSource().getFileMetadata(fileId) : undefined,
    getVectorCount({
      teamId: collection.teamId,
      datasetId: collection.datasetId,
      collectionId: collection._id
    }),
    MongoDatasetTraining.countDocuments(
      {
        teamId: collection.teamId,
        datasetId: collection.datasetId,
        collectionId: id,
        errorMsg: { $exists: true },
        retryCount: { $lte: 0 }
      },
      readFromSecondary
    )
  ]);

  return {
    ...default_prompt,
    ...collection,
    indexAmount: indexAmount ?? 0,
    ...getCollectionSourceData(collection),
    tags: await collectionTagsToTagLabel({
      datasetId: collection.datasetId,
      tags: collection.tags
    }),
    permission,
    file,
    errorCount
  };
}

export default NextAPI(handler);
