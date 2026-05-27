import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import { getLogger } from '@fastgpt/service/common/logger';

const logger = getLogger(['rmDupSkillNameCheck']);

export type ResponseType = {
  message: string;
  indexDropped: boolean;
  error?: string;
};

/**
 * 取消 Skill/Folder 同名限制的数据迁移脚本
 *
 * 目标：清理并删除 agent_skills 集合上的重名唯一索引
 */
async function handler(
  req: ApiRequestProps,
  _res: ApiResponseType<ResponseType>
): Promise<ResponseType> {
  // 安全起见，非 POST 请求一律拒绝以避免 GET 被爬虫或误触触发
  if (req.method !== 'POST') {
    throw new Error('Method not allowed. Please use POST method to run database migration.');
  }

  // 必须管理员权限认证
  await authCert({ req, authRoot: true });

  const indexName = 'teamId_1_parentId_1_name_1_deleteTime_1';
  let indexDropped = false;
  let errorMsg = '';

  try {
    logger.info(
      `[rmDupSkillNameCheck] Listing indexes on agent_skills collection to match key spec...`
    );
    // 获取当前集合的所有物理索引定义
    const indexes = await MongoAgentSkills.collection.listIndexes().toArray();

    // 动态搜索具有 { teamId: 1, parentId: 1, name: 1, deleteTime: 1 } 特征的索引
    const targetIndex = indexes.find((idx: any) => {
      const keys = idx.key;
      return (
        keys &&
        keys.teamId === 1 &&
        keys.parentId === 1 &&
        keys.name === 1 &&
        keys.deleteTime === 1 &&
        Object.keys(keys).length === 4
      );
    });

    if (targetIndex) {
      const foundName = targetIndex.name;
      logger.info(
        `[rmDupSkillNameCheck] Found matching unique index: "${foundName}". Dropping index...`
      );
      await MongoAgentSkills.collection.dropIndex(foundName);
      indexDropped = true;
      logger.info(`[rmDupSkillNameCheck] Successfully dropped index: "${foundName}".`);
    } else {
      logger.info(`[rmDupSkillNameCheck] Attempting to drop index by key definition object...`);
      try {
        await MongoAgentSkills.collection.dropIndex({
          teamId: 1,
          parentId: 1,
          name: 1,
          deleteTime: 1
        } as any);
        indexDropped = true;
        logger.info(`[rmDupSkillNameCheck] Successfully dropped index by key definition object`);
      } catch (error: any) {
        // 兜底策略：如果通过键值对象无法匹配（如特殊局部过滤器原因），尝试通过默认索引名称删除
        try {
          logger.info(
            `[rmDupSkillNameCheck] Key definition drop failed, retrying with default index name: ${indexName}`
          );
          await MongoAgentSkills.collection.dropIndex(indexName);
          indexDropped = true;
          logger.info(`[rmDupSkillNameCheck] Successfully dropped index by default name`);
        } catch (innerError: any) {
          if (
            innerError?.codeName === 'IndexNotFound' ||
            innerError?.message?.includes('index not found')
          ) {
            logger.info(`[rmDupSkillNameCheck] Index already dropped or does not exist`);
            indexDropped = true;
          } else {
            logger.error(`[rmDupSkillNameCheck] Failed to drop index: ${indexName}`, {
              innerError
            });
            errorMsg = innerError?.message || String(innerError);
          }
        }
      }
    }
  } catch (error: any) {
    logger.error(`[rmDupSkillNameCheck] Failed to list or drop index`, { error });
    errorMsg = error?.message || String(error);
  }

  return {
    message: errorMsg
      ? `Failed to drop agent_skills unique index: ${errorMsg}`
      : `Completed rmDupSkillNameCheck: unique index has been successfully dropped/ensured cleared.`,
    indexDropped,
    ...(errorMsg && { error: errorMsg })
  };
}

export default NextAPI(handler);
