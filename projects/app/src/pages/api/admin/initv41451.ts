import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoSystemTool } from '@fastgpt/service/core/plugin/tool/systemToolSchema';
import type { AnyBulkWriteOperation } from '@fastgpt/service/common/mongo';
import type { SystemPluginToolCollectionType } from '@fastgpt/global/core/plugin/tool/type';

export type ResponseType = {
  message: string;
};

/**
 * 4.14.5.1 版本数据初始化脚本
 * 1. 迁移 system tool 数据：如果工具集配置了系统密钥，则需要给其子工具都写入 InputListVal 字段
 */

const migrateSystemSecret = async () => {
  // 1. find all system tools
  const tools = await MongoSystemTool.find(
    {
      pluginId: {
        $regex: /systemTool-/
      }
    },
    {
      pluginId: 1,
      inputListVal: 1
    }
  ).lean();

  // 2. 构建工具集和子工具的映射关系
  const toolSetMap = new Map<string, (typeof tools)[0]>(); // 工具集 ID -> 工具集对象
  const childToolsMap = new Map<string, typeof tools>(); // 工具集 ID -> 子工具列表

  for (const tool of tools) {
    if (tool.pluginId.includes('/')) {
      // 这是一个子工具
      const toolSetId = tool.pluginId.split('/')[0];
      if (!childToolsMap.has(toolSetId)) {
        childToolsMap.set(toolSetId, []);
      }
      childToolsMap.get(toolSetId)!.push(tool);
    } else {
      // 这是一个工具集
      toolSetMap.set(tool.pluginId, tool);
    }
  }

  // 3. 构建批量更新操作
  const ops: AnyBulkWriteOperation<SystemPluginToolCollectionType>[] = [];

  for (const [toolSetId, toolSet] of toolSetMap.entries()) {
    // 只处理配置了系统密钥的工具集
    if (toolSet.inputListVal) {
      const childTools = childToolsMap.get(toolSetId) || [];

      // 为每个子工具添加更新操作
      for (const childTool of childTools) {
        ops.push({
          updateOne: {
            filter: {
              _id: childTool._id
            },
            update: {
              $set: {
                inputListVal: toolSet.inputListVal
              }
            }
          }
        });
      }
    }
  }

  // 4. 执行批量更新
  if (ops.length > 0) {
    await MongoSystemTool.bulkWrite(ops);
    console.log(`Updated ${ops.length} child tools with system secrets`);
  }

  return ops.length;
};

/**
 * 主处理函数
 */
async function handler(
  req: ApiRequestProps,
  _res: ApiResponseType<ResponseType>
): Promise<ResponseType> {
  await authCert({ req, authRoot: true });

  // 执行系统工具密钥迁移
  const updatedCount = await migrateSystemSecret();

  return {
    message: `Completed v4.14.6 initialization: Updated ${updatedCount} child tools with system secrets`
  };
}

export default NextAPI(handler);
