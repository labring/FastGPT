import { MongoOpenApi } from './schema';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { OpenApiErrEnum } from '@fastgpt/global/common/error/code/openapi';

// API Key 生成常量
const API_KEY_MIN_LENGTH = 52;
const API_KEY_RANDOM_RANGE = 14;

/**
 * 为 Skill 导出创建专用 API Key
 * 使用 UUID 作为 Key 名称，完全避免并发冲突
 *
 * @param params.teamId - 团队 ID
 * @param params.tmbId - 成员 ID
 * @param params.appId - 应用 ID
 * @returns { apiKey: string, keyName: string, expiredTime: undefined }
 */
export async function createSkillApiKey(params: {
  teamId: string;
  tmbId: string;
  appId: string;
}): Promise<{ apiKey: string; keyName: string; expiredTime: undefined }> {
  const { teamId, tmbId, appId } = params;

  // 使用 nanoid 生成唯一的 Key 名称，格式：invoke-skill-{8位随机字符}
  const uniqueId = getNanoid(8);
  const keyName = `invoke-skill-${uniqueId}`;

  // 生成 API Key (长度在 52-65 之间)
  const nanoid = getNanoid(Math.floor(Math.random() * API_KEY_RANDOM_RANGE) + API_KEY_MIN_LENGTH);
  const apiKey = `${global.systemEnv?.openapiPrefix || 'fastgpt'}-${nanoid}`;

  try {
    // 创建 API Key (不设置 expiredTime，表示永不过期)
    await MongoOpenApi.create({
      teamId,
      tmbId,
      apiKey,
      appId,
      name: keyName,
      limit: {
        maxUsagePoints: -1 // 无限制
        // 不设置 expiredTime，前端会显示为 "-" (永不过期)
      }
    });

    return { apiKey, keyName, expiredTime: undefined };
  } catch (error: any) {
    // 如果是唯一索引冲突（极小概率），重试一次
    if (error.code === 11000) {
      // 递归重试（nanoid 冲突概率极低，一般不会进入这里）
      return createSkillApiKey(params);
    }
    throw error;
  }
}

export function updateApiKeyUsedTime(id: string) {
  MongoOpenApi.findByIdAndUpdate(id, {
    lastUsedTime: new Date()
  }).catch((err) => {
    console.log('update apiKey used time error', err);
  });
}

export function updateApiKeyUsage({
  apikey,
  totalPoints
}: {
  apikey: string;
  totalPoints: number;
}) {
  MongoOpenApi.findOneAndUpdate(
    { apiKey: apikey },
    {
      $inc: {
        usagePoints: totalPoints
      }
    }
  ).catch((err) => {
    console.log('update apiKey totalPoints error', err);
  });
}
