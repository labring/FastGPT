import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { OwnerPermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { onCreateApp } from './create';

export type transitionWorkflowQuery = {};

export type transitionWorkflowBody = {
  appId: string;
  createNew?: boolean;
};

export type transitionWorkflowResponse = {
  id?: string;
};

async function handler(
  req: ApiRequestProps<transitionWorkflowBody, transitionWorkflowQuery>,
  res: ApiResponseType<any>
): Promise<transitionWorkflowResponse> {
  const { appId, createNew } = req.body;

  const { app, tmbId } = await authApp({
    req,
    appId,
    authToken: true,
    per: OwnerPermissionVal
  });

  if (createNew) {
    const appId = await onCreateApp({
      parentId: app.parentId,
      name: app.name + ' Copy',
      avatar: app.avatar,
      type: AppTypeEnum.workflow,
      modules: app.modules,
      edges: app.edges,
      teamId: app.teamId,
      tmbId
    });

    return { id: appId };
  } else {
    await MongoApp.findByIdAndUpdate(appId, { type: AppTypeEnum.workflow });
  }

  return {};
}

export default NextAPI(handler);
