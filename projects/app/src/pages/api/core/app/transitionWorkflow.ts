import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { OwnerPermissionVal } from '@fastgpt/global/support/permission/constant';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { onCreateApp, onUpdateAppWorkflow } from './create';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { copyAvatarImage } from '@fastgpt/service/common/file/image/controller';
import { getS3AvatarSource } from '@fastgpt/service/common/s3/sources/avatar';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  TransitionWorkflowBodySchema,
  TransitionWorkflowResponseSchema,
  type TransitionWorkflowBodyType,
  type TransitionWorkflowResponseType
} from '@fastgpt/global/openapi/core/app/common/api';
import { getAppDraftWorkflow } from '@fastgpt/service/core/app/version/controller';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';

async function handler(
  req: ApiRequestProps<TransitionWorkflowBodyType>
): Promise<TransitionWorkflowResponseType> {
  const { appId, createNew } = parseApiInput({
    req,
    bodySchema: TransitionWorkflowBodySchema
  }).body;

  const { app, teamId, tmbId } = await authApp({
    req,
    appId,
    authToken: true,
    per: OwnerPermissionVal
  });

  // 前端仅从 Simple App 表单转换流程调用此接口。不涉及其他类型，所以暂不考虑 SimpleApp 以外的应用类型转换。
  if (app.type !== AppTypeEnum.simple) throw AppErrEnum.invalidAppType;

  const draftWorkflow = await getAppDraftWorkflow(app._id, app);
  if (createNew) {
    const { appId } = await mongoSessionRun(async (session) => {
      // Copy avatar
      const avatar = await copyAvatarImage({
        teamId,
        imageUrl: app.avatar,
        temporary: true,
        session
      });

      const appId = await onCreateApp({
        parentId: app.parentId,
        name: app.name + ' Copy',
        avatar,
        type: AppTypeEnum.workflow,
        nodes: draftWorkflow.nodes,
        edges: draftWorkflow.edges,
        chatConfig: draftWorkflow.chatConfig,
        teamId: app.teamId,
        tmbId,
        session
      });
      await getS3AvatarSource().refreshAvatar(avatar, undefined, session);

      return {
        appId
      };
    });

    return TransitionWorkflowResponseSchema.parse({ id: appId });
  }

  await mongoSessionRun(async (session) => {
    await onUpdateAppWorkflow({
      appId,
      nodes: draftWorkflow.nodes,
      edges: draftWorkflow.edges,
      chatConfig: draftWorkflow.chatConfig,
      resources: draftWorkflow.resources,
      teamId,
      tmbId,
      session
    });
  });

  return TransitionWorkflowResponseSchema.parse(undefined);
}

export default NextAPI(handler);
