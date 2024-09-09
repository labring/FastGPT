import { getLLMModel, getVectorModel } from '@fastgpt/service/core/ai/model';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { NextAPI } from '@/service/middleware/entry';
import { ApiRequestProps } from '@fastgpt/service/type/next';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';

/**
 * 重建嵌入向量请求参数
 */
type PutifileRebuildEmbedReqProps = {
  datasetId: string;
  rebuildId: string;
  rebuildType: 'collectionId' | 'fileId' | 'datasetId';
};

/**
 * 重建指定数据集的嵌入向量
 */
async function handler(req: ApiRequestProps<PutifileRebuildEmbedReqProps>): Promise<void> {
  const { datasetId, rebuildId, rebuildType } = req.query as {
    datasetId: string;
    rebuildId: string;
    rebuildType: 'collectionId' | 'fileId' | 'datasetId';
  };

  if (!datasetId || !rebuildId || !rebuildType) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  // 凭证校验
  const { dataset, permission } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId,
    per: ReadPermissionVal
  });

  // 根据不同类型的重建请求，进行不同的处理
  if (rebuildType === 'collectionId') {
    // 重建指定集合的嵌入向量
  } else if (rebuildType === 'fileId') {
    // 重建指定文件的嵌入向量
  } else if (rebuildType === 'datasetId') {
    // 重建指定数据集的嵌入向量
  }
}

export default NextAPI(handler);
