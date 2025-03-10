import type { NextApiRequest, NextApiResponse } from 'next';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { checkNode } from '@/service/core/app/utils';
import { listByAppIdAndDatasetIds } from './util/listByAppIdAndDatasetIds';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
/* 获取应用详情 */
async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  const { appId } = req.query as { appId: string };

  if (!appId) {
    Promise.reject(CommonErrEnum.missingParams);
  }
  // 凭证校验
  const { app } = await authApp({ req, authToken: true, appId, per: ReadPermissionVal });

  const nodes = app.modules;
  await Promise.all(
    nodes.map(async (node) => {
      if (node.flowNodeType === FlowNodeTypeEnum.datasetSearchNode) {
        const datasetIds = node.inputs.find(
          (item) => item.key === NodeInputKeyEnum.datasetSelectList
        )?.value?.datasetId;
        if (datasetIds) {
          const datasetList = await listByAppIdAndDatasetIds({
            appId: appId,
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

  if (!app.permission.hasWritePer) {
    return {
      ...app,
      modules: [],
      edges: []
    };
  }

  return {
    ...app,
    modules: await Promise.all(
      app.modules.map((node) => checkNode({ node, ownerTmbId: app.tmbId }))
    )
  };
}

export default NextAPI(handler);
