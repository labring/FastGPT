import { type AppSchemaType } from '@fastgpt/global/core/app/type';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { MongoApp } from './schema';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { encryptSecretValue, storeSecretValue } from '../../common/secret/utils';
import { SystemToolSecretInputTypeEnum } from '@fastgpt/global/core/app/tool/systemTool/constants';
import { MongoEvaluation } from './evaluation/evalSchema';
import { removeEvaluationJob } from './evaluation/mq';
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
import { getLogger, LogCategories } from '../../common/logger';
import { deleteSandboxesByAppId, deleteSandboxesByChatIds } from '../ai/sandbox/service/resource';
import { MongoSystemTool } from '../plugin/tool/systemToolSchema';
import {
  SelectedAgentSkillItemTypeSchema,
  type AppFormEditFormType
} from '@fastgpt/global/core/app/formEdit/type';
import z from 'zod';
import { nodeInputIsReference } from '@fastgpt/global/core/workflow/utils';

const logger = getLogger(LogCategories.MODULE.APP.FOLDER);

/**
 * 在更新应用前，对工作流节点数据进行格式化和安全处理。
 * 主要职责：
 * 1. 知识库：统一数据结构为 { datasetId: string }[]。
 * 2. Skill: 统一数据结构为 { skillId: string }[]。
 * 2. 敏感信息（如 Header Secret、密码类型输入、系统工具手动配置的密钥）进行加密存储。
 */
export const beforeUpdateAppFormat = ({ nodes }: { nodes?: StoreNodeItemType[] }) => {
  if (!nodes) return;

  const StoredSelectedDatasetSchema = z.object({
    datasetId: z.string()
  });

  /**
   * 格式化数据集选择值，保存阶段只保留 datasetId，移除编辑态快照字段。
   * 引用模式由调用处判断并跳过，避免把 [nodeId, key] 误压缩成空数组。
   * 兼容历史单选格式 { datasetId }，避免旧应用再次保存时丢失知识库配置。
   */
  const formatDatasetSelectValue = (value: unknown) => {
    const datasets = z
      .union([StoredSelectedDatasetSchema, z.array(StoredSelectedDatasetSchema)])
      .parse(value);

    const datasetList = Array.isArray(datasets) ? datasets : [datasets];
    return datasetList.map(({ datasetId }) => ({ datasetId }));
  };

  nodes.forEach((node) => {
    const isDatasetNode =
      node.flowNodeType === FlowNodeTypeEnum.datasetSearchNode ||
      node.flowNodeType === FlowNodeTypeEnum.agent;

    // Format header secret
    node.inputs.forEach((input) => {
      if (nodeInputIsReference(input)) return;

      // 敏感信息
      if (input.key === NodeInputKeyEnum.headerSecret && typeof input.value === 'object') {
        input.value = storeSecretValue(input.value);
      }
      if (input.renderTypeList?.includes(FlowNodeInputTypeEnum.password)) {
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

      // 知识库
      if (isDatasetNode) {
        // Agent
        if (input.key === NodeInputKeyEnum.datasetSelectList) {
          input.value = formatDatasetSelectValue(input.value);
        }
        // workflow
        if (input.key === NodeInputKeyEnum.datasetParams) {
          const datasetParams = input.value as AppFormEditFormType['dataset'] | undefined;
          if (datasetParams?.datasets) {
            input.value = {
              ...datasetParams,
              datasets: formatDatasetSelectValue(datasetParams.datasets)
            };
          }
        }
      }

      // Skills
      if (input.key === NodeInputKeyEnum.skills) {
        const skills = z.array(SelectedAgentSkillItemTypeSchema).parse(input.value);
        input.value = skills.map(({ isDeleted, description, avatar, ...skill }) => skill);
      }
    });
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
}): Promise<AppSchemaType[]> {
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

const cleanupWorkflowToolSystemToolAssociation = async (appIds: string[]) => {
  if (appIds.length === 0) return;

  await MongoSystemTool.updateMany(
    { 'customConfig.associatedPluginId': { $in: appIds } },
    { $unset: { 'customConfig.associatedPluginId': '' } }
  );
};

export const deleteAppDataProcessor = async ({
  app,
  teamId
}: {
  app: AppSchemaType;
  teamId: string;
}) => {
  const appId = String(app._id);

  if (app.type === AppTypeEnum.workflowTool) {
    await cleanupWorkflowToolSystemToolAssociation([appId]);
  }

  // 1. 删除应用头像
  await removeImageByPath(app.avatar);

  // 2. 删除聊天记录和S3文件
  // 删除沙盒实例
  {
    // 对话生成的
    await deleteSandboxesByAppId(appId);
    // 编辑 skill 生成的
    const appChatIds = (await MongoChat.find({ appId }, { _id: 1 }).lean()).map((c) =>
      String(c._id)
    );
    await deleteSandboxesByChatIds({ appId, chatIds: appChatIds });
  }

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
  const workflowToolApps = await MongoApp.find(
    {
      teamId,
      _id: { $in: appIds },
      type: AppTypeEnum.workflowTool
    },
    '_id'
  ).lean();

  await cleanupWorkflowToolSystemToolAssociation(workflowToolApps.map((app) => String(app._id)));

  // Remove eval job
  const evalJobs = await MongoEvaluation.find(
    {
      teamId,
      appId: { $in: appIds }
    },
    '_id'
  ).lean();
  await Promise.all(evalJobs.map((evalJob) => removeEvaluationJob(evalJob._id)));

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
    logger.error('Failed to update parent folder updateTime', { error: err });
  });
};
