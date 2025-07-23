import { type AppSchema } from '@fastgpt/global/core/app/type';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { MongoApp } from './schema';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { encryptSecretValue, storeSecretValue } from '../../common/secret/utils';
import { SystemToolInputTypeEnum } from '@fastgpt/global/core/app/systemTool/constants';
import { type ClientSession } from '../../common/mongo';
import { MongoEvaluation } from './evaluation/evalSchema';
import { removeEvaluationJob } from './evaluation/mq';
import { deleteChatFiles } from '../chat/controller';
import { MongoChatItem } from '../chat/chatItemSchema';
import { MongoChat } from '../chat/chatSchema';
import { MongoOutLink } from '../../support/outLink/schema';
import { MongoOpenApi } from '../../support/openapi/schema';
import { MongoAppVersion } from './version/schema';
import { MongoChatInputGuide } from '../chat/inputGuide/schema';
import { MongoResourcePermission } from '../../support/permission/schema';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { removeImageByPath } from '../../common/file/image/controller';
import { mongoSessionRun } from '../../common/mongo/sessionRun';

export const beforeUpdateAppFormat = ({ nodes }: { nodes?: StoreNodeItemType[] }) => {
  if (!nodes) return;

  nodes.forEach((node) => {
    // Format header secret
    node.inputs.forEach((input) => {
      if (input.key === NodeInputKeyEnum.headerSecret && typeof input.value === 'object') {
        input.value = storeSecretValue(input.value);
      }
      if (input.key === NodeInputKeyEnum.systemInputConfig && typeof input.value === 'object') {
        input.inputList?.forEach((inputItem) => {
          if (
            inputItem.inputType === 'secret' &&
            input.value?.type === SystemToolInputTypeEnum.manual &&
            input.value?.value
          ) {
            input.value.value[inputItem.key] = encryptSecretValue(input.value.value[inputItem.key]);
          }
        });
      }
    });

    // Format dataset search
    if (node.flowNodeType === FlowNodeTypeEnum.datasetSearchNode) {
      node.inputs.forEach((input) => {
        if (input.key === NodeInputKeyEnum.datasetSelectList) {
          const val = input.value as undefined | { datasetId: string }[] | { datasetId: string };
          if (!val) {
            input.value = [];
          } else if (Array.isArray(val)) {
            // Not rewrite reference value
            if (val.length === 2 && val.every((item) => typeof item === 'string')) {
              return;
            }
            input.value = val
              .map((dataset: { datasetId: string }) => ({
                datasetId: dataset.datasetId
              }))
              .filter((item) => !!item.datasetId);
          } else if (typeof val === 'object' && val !== null) {
            input.value = [
              {
                datasetId: val.datasetId
              }
            ];
          }
        }
      });
    }
  });
};

/* Get apps */
export async function findAppAndAllChildren({
  teamId,
  appId,
  fields
}: {
  teamId: string;
  appId: string;
  fields?: string;
}): Promise<AppSchema[]> {
  const find = async (id: string) => {
    const children = await MongoApp.find(
      {
        teamId,
        parentId: id
      },
      fields
    ).lean();

    let apps = children;

    for (const child of children) {
      const grandChildrenIds = await find(child._id);
      apps = apps.concat(grandChildrenIds);
    }

    return apps;
  };
  const [app, childDatasets] = await Promise.all([MongoApp.findById(appId, fields), find(appId)]);

  if (!app) {
    return Promise.reject('Dataset not found');
  }

  return [app, ...childDatasets];
}

export const getAppBasicInfoByIds = async ({ teamId, ids }: { teamId: string; ids: string[] }) => {
  const apps = await MongoApp.find(
    {
      teamId,
      _id: { $in: ids }
    },
    '_id name avatar'
  ).lean();

  return apps.map((item) => ({
    id: item._id,
    name: item.name,
    avatar: item.avatar
  }));
};

export const onDelOneApp = async ({
  teamId,
  appId,
  session
}: {
  teamId: string;
  appId: string;
  session?: ClientSession;
}) => {
  const apps = await findAppAndAllChildren({
    teamId,
    appId,
    fields: '_id avatar'
  });

  // Remove eval job
  const evalJobs = await MongoEvaluation.find(
    {
      appId: { $in: apps.map((app) => app._id) }
    },
    '_id'
  ).lean();
  await Promise.all(evalJobs.map((evalJob) => removeEvaluationJob(evalJob._id)));

  const del = async (session: ClientSession) => {
    for await (const app of apps) {
      const appId = app._id;
      // Chats
      await deleteChatFiles({ appId });
      await MongoChatItem.deleteMany(
        {
          appId
        },
        { session }
      );
      await MongoChat.deleteMany(
        {
          appId
        },
        { session }
      );

      // 删除分享链接
      await MongoOutLink.deleteMany({
        appId
      }).session(session);
      // Openapi
      await MongoOpenApi.deleteMany({
        appId
      }).session(session);

      // delete version
      await MongoAppVersion.deleteMany({
        appId
      }).session(session);

      await MongoChatInputGuide.deleteMany({
        appId
      }).session(session);

      await MongoResourcePermission.deleteMany({
        resourceType: PerResourceTypeEnum.app,
        teamId,
        resourceId: appId
      }).session(session);

      // delete app
      await MongoApp.deleteOne(
        {
          _id: appId
        },
        { session }
      );

      await removeImageByPath(app.avatar, session);
    }
  };

  if (session) {
    return del(session);
  }

  return mongoSessionRun(del);
};
