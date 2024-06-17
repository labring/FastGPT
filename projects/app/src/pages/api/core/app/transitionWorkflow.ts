import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { OwnerPermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';

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
    const { _id } = await MongoApp.create({
      parentId: app.parentId,
      avatar: app.avatar,
      name: app.name + ' Copy',
      teamId: app.teamId,
      tmbId,
      modules: app.modules,
      edges: app.edges,
      type: AppTypeEnum.workflow,
      version: 'v2'
    });

    return { id: _id };
  } else {
    await MongoApp.findByIdAndUpdate(appId, { type: AppTypeEnum.workflow });
  }

  return {};
}

export default NextAPI(handler);
