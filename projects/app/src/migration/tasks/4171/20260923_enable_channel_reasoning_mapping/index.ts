import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import { REASONING_FIELD_MAPPING_CHANNEL_TYPES } from '@fastgpt/global/core/ai/channel';
import { mergeAIProxyChannelConfigs } from './service';
import type { SystemMigrationContext } from '@/migration/registry';

const STAGE_KEY = 'channels';

/**
 * 为已有兼容渠道（OpenAI 1）开启 reasoning 字段兼容映射。
 * 渠道数量有界且 API 写入按 configs 合并、可安全重放；这是非启动依赖的外部配置回填，
 * 因此采用延迟、非阻塞的幂等全量重跑，并在返回前由共享服务重新读取验证。
 */
export const enableChannelReasoningMapping = async (context: SystemMigrationContext) => {
  await context.reportProgress({ key: STAGE_KEY, status: SystemMigrationStatusEnum.running });
  await context.assertActive();

  const result = await mergeAIProxyChannelConfigs({
    channelTypes: REASONING_FIELD_MAPPING_CHANNEL_TYPES,
    configPatch: { map_reasoning_to_reasoning_content: true },
    beforeUpdate: context.assertActive
  });

  await context.assertActive();
  await context.reportProgress({
    key: STAGE_KEY,
    status: SystemMigrationStatusEnum.succeeded,
    current: result.channelCount,
    total: result.channelCount
  });

  return result;
};
