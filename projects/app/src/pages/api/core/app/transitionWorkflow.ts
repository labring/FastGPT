import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { OwnerPermissionVal } from '@fastgpt/global/support/permission/constant';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { onCreateApp } from './create';
import { beforeUpdateAppFormat } from '@fastgpt/service/core/app/controller';
import { migrateWorkflowToCurrent } from '@fastgpt/global/core/workflow/migration';
import { getWorkflowMigrationOptions } from '@fastgpt/service/core/app/tool/utils/client';
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
  const workflow = await migrateWorkflowToCurrent(
    {
      nodes: app.modules,
      edges: app.edges,
      chatConfig: app.chatConfig
    },
    getWorkflowMigrationOptions()
  );

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
        modules: workflow.nodes,
        edges: workflow.edges,
        chatConfig: workflow.chatConfig,
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

  await beforeUpdateAppFormat({ nodes: workflow.nodes });
  await MongoApp.findByIdAndUpdate(appId, {
    type: AppTypeEnum.workflow,
    modules: workflow.nodes,
    edges: workflow.edges,
    chatConfig: workflow.chatConfig
  });

  return TransitionWorkflowResponseSchema.parse(undefined);
}

export default NextAPI(handler);
