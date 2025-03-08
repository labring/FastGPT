import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { getAppLatestVersion } from '@fastgpt/service/core/app/version/controller';
import { AppChatConfigType } from '@fastgpt/global/core/app/type';
import { StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { listByAppIdAndDatasetIds } from '../util/listByAppIdAndDatasetIds';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

export type getLatestVersionQuery = {
  appId: string;
};

export type getLatestVersionBody = {};

export type getLatestVersionResponse = {
  nodes: StoreNodeItemType[];
  edges: StoreEdgeItemType[];
  chatConfig: AppChatConfigType;
};

async function handler(
  req: ApiRequestProps<getLatestVersionBody, getLatestVersionQuery>,
  res: ApiResponseType<any>
): Promise<getLatestVersionResponse> {
  const { app } = await authApp({
    req,
    authToken: true,
    appId: req.query.appId,
    per: WritePermissionVal
  });

  const nodes = app.modules;
  await Promise.all(
    nodes.map(async (node) => {
      if (node.flowNodeType === FlowNodeTypeEnum.datasetSearchNode) {
        const datasetIds = node.inputs.find(
          (item) => item.key === NodeInputKeyEnum.datasetSelectList
        )?.value?.datasetId;
        if (datasetIds) {
          const datasetList = await listByAppIdAndDatasetIds({
            appId: req.query.appId,
            datasetIdList: datasetIds
          });
          const input = node.inputs.find((item) => item.key === NodeInputKeyEnum.datasetSelectList);
          if (input) {
            input.value = datasetList;
          }
        }
      }
    })
  );

  return getAppLatestVersion(req.query.appId, app);
}

export default NextAPI(handler);
