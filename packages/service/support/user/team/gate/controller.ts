import { MongoTeamGate, gateCollectionName } from './schema';
import { Types } from '../../../../common/mongo';

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
