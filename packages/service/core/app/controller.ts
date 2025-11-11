import { type AppSchema } from '@fastgpt/global/core/app/type';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { AppFolderTypeList } from '@fastgpt/global/core/app/constants';
import { MongoApp } from './schema';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { encryptSecretValue, storeSecretValue } from '../../common/secret/utils';
import { SystemToolSecretInputTypeEnum } from '@fastgpt/global/core/app/tool/systemTool/constants';
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
import { MongoChatFavouriteApp } from '../chat/favouriteApp/schema';
import { MongoChatSetting } from '../chat/setting/schema';
import { MongoResourcePermission } from '../../support/permission/schema';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { removeImageByPath } from '../../common/file/image/controller';
import { mongoSessionRun } from '../../common/mongo/sessionRun';
import { MongoAppLogKeys } from './logs/logkeysSchema';
import { MongoChatItemResponse } from '../chat/chatItemResponseSchema';
import { getS3ChatSource } from '../../common/s3/sources/chat';

export const beforeUpdateAppFormat = ({ nodes }: { nodes?: StoreNodeItemType[] }) => {
  if (!nodes) return;

  nodes.forEach((node) => {
    // Format header secret
    node.inputs.forEach((input) => {
      if (input.key === NodeInputKeyEnum.headerSecret && typeof input.value === 'object') {
        input.value = storeSecretValue(input.value);
      }
      if (input.renderTypeList.includes(FlowNodeInputTypeEnum.password)) {
        input.value = encryptSecretValue(input.value);
      }
      if (input.key === NodeInputKeyEnum.systemInputConfig && typeof input.value === 'object') {
        input.inputList?.forEach((inputItem) => {
          if (
            inputItem.inputType === 'secret' &&
            input.value?.type === SystemToolSecretInputTypeEnum.manual &&
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

  const deletedAppIds = apps
    .filter((app) => !AppFolderTypeList.includes(app.type))
    .map((app) => String(app._id));

  // Remove eval job
  const evalJobs = await MongoEvaluation.find(
    {
      appId: { $in: apps.map((app) => app._id) }
    },
    '_id'
  ).lean();
  await Promise.all(evalJobs.map((evalJob) => removeEvaluationJob(evalJob._id)));

  const del = async (app: AppSchema, session: ClientSession) => {
    const appId = String(app._id);

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

    // 删除精选应用记录
    await MongoChatFavouriteApp.deleteMany({
      teamId,
      appId
    }).session(session);

    // 从快捷应用中移除对应应用
    await MongoChatSetting.updateMany(
      { teamId },
      { $pull: { quickAppIds: { id: String(appId) } } }
    ).session(session);

    // Del permission
    await MongoResourcePermission.deleteMany({
      resourceType: PerResourceTypeEnum.app,
      teamId,
      resourceId: appId
    }).session(session);

    await MongoAppLogKeys.deleteMany({
      appId
    }).session(session);

    // delete app
    await MongoApp.deleteOne(
      {
        _id: appId
      },
      { session }
    );

    // Delete avatar
    await removeImageByPath(app.avatar, session);
  };

  // Delete chats
  for await (const app of apps) {
    const appId = String(app._id);
    await deleteChatFiles({ appId });
    await MongoChatItemResponse.deleteMany({
      appId
    });
    await MongoChatItem.deleteMany({
      appId
    });
    await MongoChat.deleteMany({
      appId
    });
    await getS3ChatSource().deleteChatFilesByPrefix({ appId });
  }

  for await (const app of apps) {
    if (session) {
      await del(app, session);
    }

    await mongoSessionRun((session) => del(app, session));
  }

  return deletedAppIds;
};
