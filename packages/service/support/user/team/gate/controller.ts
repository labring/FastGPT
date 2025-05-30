import { MongoTeamGate } from './schema';
import { Types } from '../../../../common/mongo';
import type { ClientSession } from '../../../../common/mongo';
import { mongoSessionRun } from '../../../../common/mongo/sessionRun';
import {
  GateFeaturedAppPermission,
  GateQuickAppPermission
} from '@fastgpt/global/support/permission/app/constant';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { DefaultGroupName } from '@fastgpt/global/support/user/team/group/constant';
import { MongoMemberGroupModel } from '../../../permission/memberGroup/memberGroupSchema';
import { MongoResourcePermission } from '../../../permission/schema';

export const addGatePermission = async ({
  teamId,
  appId,
  per,
  session
}: {
  teamId: string;
  appId: string;
  per: number;
  session?: ClientSession;
}) => {
  // 1. 先找全员组
  const teamGroup = await MongoMemberGroupModel.findOne({
    teamId,
    name: DefaultGroupName
  });
  if (!teamGroup) {
    return Promise.reject('找不到全员组');
  }

  // 2. 加权限
  await MongoResourcePermission.updateOne(
    {
      teamId,
      groupId: teamGroup?._id,
      resourceType: PerResourceTypeEnum.app,
      resourceId: appId
    },
    {
      permission: per
    },
    {
      session,
      upsert: true
    }
  );
};
export const removeGatePermission = async ({
  teamId,
  appId,
  per,
  session
}: {
  teamId: string;
  appId: string;
  per: number;
  session?: ClientSession;
}) => {
  // 1. 先找全员组
  const teamGroup = await MongoMemberGroupModel.findOne({
    teamId,
    name: DefaultGroupName
  });
  if (!teamGroup) {
    return Promise.reject('找不到全员组');
  }

  await MongoResourcePermission.deleteOne(
    {
      teamId,
      groupId: teamGroup?._id,
      resourceType: PerResourceTypeEnum.app,
      resourceId: appId,
      permission: per
    },
    {
      session
    }
  );
};

/**
 * 创建团队门户配置
 */
export const createGateConfig = async ({ teamId }: { teamId: string }) => {
  const gate = await MongoTeamGate.create({
    teamId
  });

  return gate.toObject();
};

/**
 * 获取团队门户配置
 */
export const getGateConfig = async (teamId: string) => {
  const gate = await MongoTeamGate.findOne({ teamId }).lean();
  return gate;
};

/**
 * 更新团队门户配置
 */
export const updateGateConfig = async ({
  teamId,
  status,
  name,
  banner,
  logo,
  tools,
  placeholderText
}: {
  teamId: string;
  status?: boolean;
  name?: string;
  banner?: string;
  logo?: string;
  tools?: string[];
  placeholderText?: string;
}) => {
  const updateData: Record<string, any> = {};
  if (status !== undefined) updateData.status = status;
  if (name !== undefined) updateData.name = name;
  if (banner !== undefined) updateData.banner = banner;
  if (logo !== undefined) updateData.logo = logo;
  if (tools !== undefined) updateData.tools = tools;
  if (placeholderText !== undefined) updateData.placeholderText = placeholderText;

  // 使用 upsert 选项，如果不存在则创建
  await MongoTeamGate.updateOne({ teamId }, { $set: updateData }, { upsert: true });

  return MongoTeamGate.findOne({ teamId }).lean();
};

/**
 * 删除团队门户配置
 */
export const deleteGateConfig = async (teamId: string) => {
  await MongoTeamGate.deleteOne({ teamId });
  return true;
};

/**
 * 启用或禁用团队门户
 */
export const toggleGateStatus = async ({ teamId, status }: { teamId: string; status: boolean }) => {
  await MongoTeamGate.updateOne({ teamId }, { $set: { status } }, { upsert: true });

  return MongoTeamGate.findOne({ teamId }).lean();
};

/**
 * 更新门户工具配置
 */
export const updateGateTools = async ({ teamId, tools }: { teamId: string; tools: string[] }) => {
  await MongoTeamGate.updateOne({ teamId }, { $set: { tools } }, { upsert: true });

  return MongoTeamGate.findOne({ teamId }).lean();
};

/**
 * 添加门户工具
 */
export const addGateTool = async ({ teamId, tool }: { teamId: string; tool: string }) => {
  await MongoTeamGate.updateOne({ teamId }, { $addToSet: { tools: tool } }, { upsert: true });

  return MongoTeamGate.findOne({ teamId }).lean();
};

/**
 * 移除门户工具
 */
export const removeGateTool = async ({ teamId, tool }: { teamId: string; tool: string }) => {
  await MongoTeamGate.updateOne({ teamId }, { $pull: { tools: tool } });

  return MongoTeamGate.findOne({ teamId }).lean();
};

/**
 * 更新特色应用列表
 */
export const updateFeaturedApps = async ({
  teamId,
  featuredApps
}: {
  teamId: string;
  featuredApps: string[];
}) => {
  // 将字符串数组转换为 ObjectId 数组
  const objectIdArray = featuredApps.map((id) => new Types.ObjectId(id));
  await MongoTeamGate.updateOne(
    { teamId },
    { $set: { featuredApps: objectIdArray } },
    { upsert: true }
  );
  return MongoTeamGate.findOne({ teamId }).lean();
};

/**
 * 添加特色应用
 */
export const addFeaturedApp = async ({ teamId, appId }: { teamId: string; appId: string }) => {
  await MongoTeamGate.updateOne(
    { teamId },
    { $addToSet: { featuredApps: new Types.ObjectId(appId) } },
    { upsert: true }
  );
  return MongoTeamGate.findOne({ teamId }).lean();
};

/**
 * 删除特色应用
 */
export const removeFeaturedApp = async ({
  teamId,
  appId,
  session
}: {
  teamId: string;
  appId: string;
  session?: ClientSession;
}) => {
  await MongoTeamGate.updateOne(
    { teamId },
    { $pull: { featuredApps: new Types.ObjectId(appId) } },
    { session }
  );
  return MongoTeamGate.findOne({ teamId }).lean();
};

/**
 * 移动特色应用位置（原子操作）
 * @param teamId 团队ID
 * @param appId 要移动的应用ID
 * @param toIndex 目标位置索引
 */
export const moveFeatureAppToPosition = async ({
  teamId,
  appId,
  toIndex
}: {
  teamId: string;
  appId: string;
  toIndex: number;
}) => {
  const objectId = new Types.ObjectId(appId);

  // 获取当前配置
  const config = await MongoTeamGate.findOne({ teamId }).lean();
  if (!config || !config.featuredApps) {
    throw new Error('团队配置不存在');
  }

  const apps = [...config.featuredApps];
  const currentIndex = apps.findIndex((id) => id.toString() === appId);

  if (currentIndex === -1) {
    throw new Error('应用不在特色应用列表中');
  }

  // 移动数组元素
  const [movedApp] = apps.splice(currentIndex, 1);
  apps.splice(toIndex, 0, movedApp);

  // 一次性更新
  await MongoTeamGate.updateOne({ teamId }, { $set: { featuredApps: apps } });

  return MongoTeamGate.findOne({ teamId }).lean();
};

/**
 * 更新工具排序
 * @param teamId 团队ID
 * @param orderedTools 按新顺序排列的工具数组
 */
export const reorderTools = async ({
  teamId,
  orderedTools
}: {
  teamId: string;
  orderedTools: string[];
}) => {
  await MongoTeamGate.updateOne({ teamId }, { $set: { tools: orderedTools } });
  return MongoTeamGate.findOne({ teamId }).lean();
};

/**
 * 批量更新门户配置
 */
export const batchUpdateGateConfigs = async (
  configs: {
    teamId: string;
    status?: boolean;
    banner?: string;
    logo?: string;
    tools?: string[];
    placeholderText?: string;
  }[]
) => {
  const operations = configs.map((config) => {
    const { teamId, ...updateData } = config;
    return {
      updateOne: {
        filter: { teamId },
        update: { $set: updateData },
        upsert: true
      }
    };
  });

  if (operations.length === 0) {
    return true;
  }

  await MongoTeamGate.bulkWrite(operations);
  return true;
};

/**
 * 批量更新特色应用
 */
export const batchUpdateFeaturedApps = async (
  updates: {
    teamId: string;
    featuredApps: string[];
  }[]
) => {
  const operations = updates.map((update) => {
    const { teamId, featuredApps } = update;
    // 将字符串数组转换为 ObjectId 数组
    const objectIdArray = featuredApps.map((id) => new Types.ObjectId(id));
    return {
      updateOne: {
        filter: { teamId },
        update: { $set: { featuredApps: objectIdArray } },
        upsert: true
      }
    };
  });

  if (operations.length === 0) {
    return true;
  }

  const teamId = updates[0]?.teamId;

  const gateConfig = await MongoTeamGate.findOne({ teamId });
  if (!gateConfig) return Promise.reject('无 gate 配置');

  const updatedAppId = updates[0].featuredApps;
  const deleteAppId = gateConfig.featuredApps.filter((id) => !updatedAppId.includes(id));

  await mongoSessionRun(async (session) => {
    await MongoTeamGate.bulkWrite(operations, { session });

    for (const id of deleteAppId) {
      await removeGatePermission({
        teamId,
        appId: id,
        per: GateFeaturedAppPermission,
        session
      });
    }
    for (const id of updatedAppId) {
      await addGatePermission({
        teamId,
        appId: id,
        per: GateFeaturedAppPermission,
        session
      });
    }
  });
  return true;
};

/**
 * 批量更新工具排序
 */
export const batchUpdateToolsOrder = async (
  updates: {
    teamId: string;
    tools: string[];
  }[]
) => {
  const operations = updates.map((update) => {
    const { teamId, tools } = update;
    return {
      updateOne: {
        filter: { teamId },
        update: { $set: { tools } },
        upsert: true
      }
    };
  });

  if (operations.length === 0) {
    return true;
  }

  await MongoTeamGate.bulkWrite(operations);
  return true;
};

/**
 * 批量删除特色应用
 * @param teamId 团队ID
 * @param appIds 要删除的应用ID数组
 */
export const batchDeleteFeaturedApps = async ({
  teamId,
  appIds,
  session
}: {
  teamId: string;
  appIds: string[];
  session?: ClientSession;
}) => {
  if (!appIds || appIds.length === 0) {
    return false;
  }

  await MongoTeamGate.updateOne(
    { teamId },
    { $pull: { featuredApps: { $in: appIds.map((id) => new Types.ObjectId(id)) } } },
    {
      session
    }
  );
  return true;
};

/**
 * 更新快速应用列表
 */
export const updateQuickApps = async ({
  teamId,
  quickApps
}: {
  teamId: string;
  quickApps: string[];
}) => {
  await MongoTeamGate.updateOne({ teamId }, { $set: { quickApps } }, { upsert: true });
  return MongoTeamGate.findOne({ teamId }).lean();
};

/**
 * 添加快速应用
 */
export const addQuickApp = async ({ teamId, appId }: { teamId: string; appId: string }) => {
  await MongoTeamGate.updateOne(
    { teamId },
    { $addToSet: { quickApps: new Types.ObjectId(appId) } },
    { upsert: true }
  );
  return MongoTeamGate.findOne({ teamId }).lean();
};

/**
 * 删除快速应用
 */
export const removeQuickApp = async ({ teamId, appId }: { teamId: string; appId: string }) => {
  await MongoTeamGate.updateOne({ teamId }, { $pull: { quickApps: new Types.ObjectId(appId) } });
  return MongoTeamGate.findOne({ teamId }).lean();
};

/**
 * 移动快速应用位置（原子操作）
 * @param teamId 团队ID
 * @param appId 要移动的应用ID
 * @param toIndex 目标位置索引
 */
export const moveQuickAppToPosition = async ({
  teamId,
  appId,
  toIndex
}: {
  teamId: string;
  appId: string;
  toIndex: number;
}) => {
  const objectId = new Types.ObjectId(appId);

  // 获取当前配置
  const config = await MongoTeamGate.findOne({ teamId }).lean();
  if (!config || !config.quickApps) {
    throw new Error('团队配置不存在');
  }

  const apps = [...config.quickApps];
  const currentIndex = apps.findIndex((id) => id.toString() === appId);

  if (currentIndex === -1) {
    throw new Error('应用不在快速应用列表中');
  }

  // 移动数组元素
  const [movedApp] = apps.splice(currentIndex, 1);
  apps.splice(toIndex, 0, movedApp);

  // 一次性更新
  await MongoTeamGate.updateOne({ teamId }, { $set: { quickApps: apps } });

  return MongoTeamGate.findOne({ teamId }).lean();
};

/**
 * 批量更新快速应用
 */
export const batchUpdateQuickApps = async (teamId: string, quickApps: string[]) => {
  const gateConfig = await MongoTeamGate.findOne({ teamId });
  if (!gateConfig) {
    return false;
  }

  // 计算删除的appId
  const deleteAppIds = gateConfig.quickApps.filter((id) => !quickApps.includes(id.toString()));

  return mongoSessionRun(async (session) => {
    // 1. 删除权限
    for (const id of deleteAppIds) {
      await removeGatePermission({
        teamId,
        appId: id,
        per: GateQuickAppPermission,
        session
      });
    }
    // 加权限
    for (const id of quickApps) {
      await addGatePermission({
        teamId,
        appId: id,
        per: GateQuickAppPermission,
        session
      });
    }

    gateConfig.quickApps = quickApps;
    await gateConfig.save({ session });
    return true;
  });
};

/**
 * 批量删除快速应用
 * @param teamId 团队ID
 * @param appIds 要删除的应用ID数组
 */
export const batchDeleteQuickApps = async ({
  teamId,
  appIds
}: {
  teamId: string;
  appIds: string[];
}) => {
  if (!appIds || appIds.length === 0) {
    return false;
  }

  await MongoTeamGate.updateOne(
    { teamId },
    { $pull: { quickApps: { $in: appIds.map((id) => new Types.ObjectId(id)) } } }
  );
  return true;
};
