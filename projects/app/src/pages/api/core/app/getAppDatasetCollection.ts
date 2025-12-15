import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import type { GetAppDatasetCollectionParams } from '@/global/core/api/appReq.d';
import type { GetAppDatasetCollectionResponse } from '@/global/core/api/appRes.d';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';

async function handler(
  req: NextApiRequest,
  _res: NextApiResponse
): Promise<GetAppDatasetCollectionResponse> {
  const { appId } = req.body as GetAppDatasetCollectionParams;

  if (!appId) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  const { teamId } = await authApp({
    req,
    authToken: true,
    appId,
    per: ReadPermissionVal
  });

  const app = await MongoApp.findById(appId, 'modules').lean();
  if (!app) {
    return Promise.reject(AppErrEnum.unExist);
  }

  const datasetIds = new Set<string>();
  app.modules?.forEach((node: any) => {
    if (node.flowNodeType === FlowNodeTypeEnum.datasetSearchNode) {
      const input = node.inputs?.find(
        (item: any) => item.key === NodeInputKeyEnum.datasetSelectList
      );
      if (!input?.value) return;

      const rawValue = input.value;
      const ids = Array.isArray(rawValue)
        ? rawValue.map((v) => v?.datasetId).filter(Boolean)
        : rawValue?.datasetId
          ? [String(rawValue.datasetId)]
          : [];

      ids.forEach((id) => datasetIds.add(String(id)));
    }
  });

  if (datasetIds.size === 0) {
    return { datasets: [] };
  }

  const datasets = await MongoDataset.find(
    {
      _id: { $in: Array.from(datasetIds) },
      teamId
    },
    '_id name avatar'
  ).lean();

  const collections = await MongoDatasetCollection.find(
    {
      teamId,
      datasetId: { $in: Array.from(datasetIds) }
    },
    '_id datasetId name type parentId'
  )
    .sort({ updateTime: -1 })
    .lean();

  const datasetMap = new Map(
    datasets.map((ds) => [
      String(ds._id),
      {
        datasetId: String(ds._id),
        datasetName: ds.name,
        avatar: ds.avatar,
        collections: [] as any[]
      }
    ])
  );

  collections.forEach((col) => {
    const datasetId = String(col.datasetId);
    const dataset = datasetMap.get(datasetId);

    if (dataset) {
      dataset.collections.push({
        collectionId: String(col._id),
        collectionName: col.name,
        type: col.type,
        parentId: col.parentId ? String(col.parentId) : undefined
      });
    }
  });

  return {
    datasets: Array.from(datasetMap.values())
  };
}

export default NextAPI(handler);
