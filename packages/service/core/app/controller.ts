import { type AppSchema } from '@fastgpt/global/core/app/type';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import type { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { MongoApp } from './schema';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { encryptSecretValue, storeSecretValue } from '../../common/secret/utils';
import { SystemToolSecretInputTypeEnum } from '@fastgpt/global/core/app/tool/systemTool/constants';
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
import { MongoAppLogKeys } from './logs/logkeysSchema';
import { MongoChatItemResponse } from '../chat/chatItemResponseSchema';
import { getS3ChatSource } from '../../common/s3/sources/chat';
import { MongoAppChatLog } from './logs/chatLogsSchema';
import { MongoAppRegistration } from '../../support/appRegistration/schema';
import { MongoMcpKey } from '../../support/mcp/schema';
import { MongoAppRecord } from './record/schema';
import { mongoSessionRun } from '../../common/mongo/sessionRun';
import { MongoRerankTrainTask } from '../train/rerank/task/schema';
import { MongoRerankTrainsetData } from '../train/rerank/data/schema';
import { MongoRerankTrainset } from '../train/rerank/trainset/schema';
import { rerankTrainTaskQueue } from '../train/rerank/task/mq';
import { RerankTrainTaskStatusEnum } from '@fastgpt/global/core/train/rerank/constants';
import { addLog } from '../../common/system/log';
import { deleteRerankTrainTask } from '../train/rerank/task/controller';

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
              .map((dataset: any & { datasetType?: DatasetTypeEnum }) => ({
                ...dataset,
                datasetId: dataset.datasetId
              }))
              .filter((item) => !!item.datasetId);
          } else if (typeof val === 'object' && val !== null) {
            input.value = [
              {
                ...(val as any & { datasetType?: DatasetTypeEnum }),
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

/**
 * Clean up training module data when deleting a single application
 *
 * Cleanup operations (executed in order):
 * 1. Cancel and remove running training task queue jobs
 * 2. Cascade delete all training tasks (including associated evaluation datasets, evaluation data, and temp files)
 * 3. Delete application training data
 * 4. Delete application training sets
 *
 * @param appId Application ID to be deleted
 */
export async function cleanupTrainModuleOnAppDelete(appId: string): Promise<void> {
  if (!appId) return;

  addLog.info('Cleanup train module on app delete', { appId });

  // 1. Cancel running training tasks and remove queue jobs
  const runningTasks = await MongoRerankTrainTask.find(
    {
      appId,
      status: {
        $in: [RerankTrainTaskStatusEnum.pending, RerankTrainTaskStatusEnum.running]
      }
    },
    null
  ).lean();

  for (const task of runningTasks) {
    if (task.jobId) {
      try {
        const job = await rerankTrainTaskQueue.getJob(task.jobId);
        if (job) {
          await job.remove();
          addLog.info('Removed train task job', {
            taskId: String(task._id),
            jobId: task.jobId
          });
        }
      } catch (error) {
        addLog.error('Failed to remove train task job', error);
      }
    }
  }

  // 2. Cascade delete all training tasks (including evaluation datasets, evaluation data, and temp files)
  // Query all tasks
  const allTasks = await MongoRerankTrainTask.find({ appId }, { _id: 1 }).lean();

  // Execute cascade delete for each task
  for (const task of allTasks) {
    try {
      await deleteRerankTrainTask(String(task._id));
    } catch (error) {
      // Deletion failure should not block the process, just log the error
      addLog.warn('Failed to delete train task', {
        taskId: String(task._id),
        error: (error as Error).message
      });
    }
  }

  // 3. Delete application training data
  await MongoRerankTrainsetData.deleteMany({ appId });

  // 4. Delete application training sets
  await MongoRerankTrainset.deleteMany({ appId });

  addLog.info('Cleanup train module completed', { appId });
}

export const deleteAppDataProcessor = async ({
  app,
  teamId
}: {
  app: AppSchema;
  teamId: string;
}) => {
  const appId = String(app._id);

  // 1. 删除应用头像
  await removeImageByPath(app.avatar);
  // 2. 删除聊天记录和S3文件
  await getS3ChatSource().deleteChatFilesByPrefix({ appId });
  await MongoAppChatLog.deleteMany({ teamId, appId });
  await MongoChatItemResponse.deleteMany({ appId });
  await MongoChatItem.deleteMany({ appId });
  await MongoChat.deleteMany({ appId });

  // 3. 删除应用相关数据（使用事务）
  {
    // 删除分享链接
    await MongoOutLink.deleteMany({ appId });
    // 删除 OpenAPI 配置
    await MongoOpenApi.deleteMany({ appId });
    // 删除应用版本
    await MongoAppVersion.deleteMany({ appId });
    // 删除聊天输入引导
    await MongoChatInputGuide.deleteMany({ appId });
    // 删除精选应用记录
    await MongoChatFavouriteApp.deleteMany({ teamId, appId });
    // 从快捷应用中移除对应应用
    await MongoChatSetting.updateMany({ teamId }, { $pull: { quickAppIds: { $in: [appId] } } });
    // 删除权限记录
    await MongoResourcePermission.deleteMany({
      resourceType: PerResourceTypeEnum.app,
      teamId,
      resourceId: appId
    });
    // 删除日志密钥
    await MongoAppLogKeys.deleteMany({ appId });

    // 删除应用注册记录
    await MongoAppRegistration.deleteMany({ appId });
    // 删除应用从MCP key apps数组中移除
    await MongoMcpKey.updateMany({ teamId, 'apps.appId': appId }, { $pull: { apps: { appId } } });

    // Clean up training module data
    await cleanupTrainModuleOnAppDelete(appId);

    // 删除应用本身
    await MongoApp.deleteOne({ _id: appId });
  }
};

export const deleteAppsImmediate = async ({
  teamId,
  appIds
}: {
  teamId: string;
  appIds: string[];
}) => {
  // sxf 删除应用和评估任务无关
  // Remove eval job
  // const evalJobs = await MongoEvaluation.find(
  //   {
  //     teamId,
  //     appId: { $in: appIds }
  //   },
  //   '_id'
  // ).lean();
  // await Promise.all(evalJobs.map((evalJob) => removeEvaluationJob(evalJob._id)));

  // Remove app record
  await MongoAppRecord.deleteMany({ teamId, appId: { $in: appIds } });
};

export const updateParentFoldersUpdateTime = ({ parentId }: { parentId?: string | null }) => {
  mongoSessionRun(async (session) => {
    const existsId = new Set<string>();
    while (true) {
      if (!parentId || existsId.has(parentId)) return;

      existsId.add(parentId);

      const parentApp = await MongoApp.findById(parentId, 'parentId updateTime');
      if (!parentApp) return;

      parentApp.updateTime = new Date();
      await parentApp.save({ session });

      // 递归更新上层
      parentId = parentApp.parentId;
    }
  }).catch((err) => {
    addLog.error('updateParentFoldersUpdateTime error', err);
  });
};
