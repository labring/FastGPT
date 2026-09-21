import { MongoAIModel } from '@fastgpt/service/core/ai/config/schema';
import { createSystemChannel, listAllSystemChannels } from '@fastgpt/service/core/ai/channel';
import { ModelScopeEnum } from '@fastgpt/global/core/ai/constants';

export type MigrateLegacyChannelConfigsResult = {
  scannedCount: number;
  migratedCount: number;
  skippedCount: number;
};

/**
 * 扫描带有旧 requestUrl 或 requestAuth 的模型，
 * 去重后在 AI Proxy 幂等创建为系统渠道（Migrated: <model>）。
 */
export const migrateLegacyChannelConfigsService = async ({
  assertActive
}: {
  assertActive?: () => Promise<void>;
} = {}): Promise<MigrateLegacyChannelConfigsResult> => {
  // 查找带有旧网络配置或鉴权的系统模型
  const modelsWithLegacyConfig = await MongoAIModel.find(
    {
      scope: ModelScopeEnum.system,
      $or: [{ requestUrl: { $exists: true, $ne: '' } }, { requestAuth: { $exists: true, $ne: '' } }]
    },
    'model requestUrl requestAuth'
  ).lean();

  const scannedCount = modelsWithLegacyConfig.length;
  if (scannedCount === 0) {
    return {
      scannedCount: 0,
      migratedCount: 0,
      skippedCount: 0
    };
  }

  // 获取已有系统渠道进行幂等判定
  const existingChannels = await listAllSystemChannels().catch(() => []);
  const existingNames = new Set(existingChannels.map((c: any) => c.name.trim()));

  // 内存按 (model, requestUrl, requestAuth) 去重
  type Candidate = {
    model: string;
    requestUrl?: string;
    requestAuth?: string;
  };
  const candidatesByModel = new Map<string, Candidate>();
  for (const item of modelsWithLegacyConfig) {
    if (!item.model) continue;
    if (!candidatesByModel.has(item.model)) {
      candidatesByModel.set(item.model, {
        model: item.model,
        requestUrl: item.requestUrl?.trim() || undefined,
        requestAuth: item.requestAuth?.trim() || undefined
      });
    }
  }

  let migratedCount = 0;
  let skippedCount = 0;

  for (const candidate of candidatesByModel.values()) {
    if (assertActive) {
      await assertActive();
    }

    const channelName = `Migrated: ${candidate.model}`;
    if (existingNames.has(channelName)) {
      skippedCount++;
      continue;
    }

    // 默认类型使用 OpenAI 协议（type = 1）
    await createSystemChannel({
      name: channelName,
      type: 1,
      key: candidate.requestAuth || '',
      base_url: candidate.requestUrl,
      models: [candidate.model],
      priority: 1,
      status: 1
    });

    existingNames.add(channelName);
    migratedCount++;
  }

  return {
    scannedCount,
    migratedCount,
    skippedCount
  };
};
