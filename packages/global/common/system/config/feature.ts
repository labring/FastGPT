import type z from 'zod';
import { FeatureConfigSchema } from './schemas/feature';

/**
 * 解析部署版本对应的生效功能开关，不修改数据库中的商业版配置。
 * 社区版使用固定默认值，仅保留核心页的引擎与多模态设置；三方发布只提供个人微信。
 */
export const resolveFeatureConfigForEdition = ({
  config,
  commercialService
}: {
  config: z.infer<typeof FeatureConfigSchema>;
  commercialService: boolean;
}): z.infer<typeof FeatureConfigSchema> => {
  if (commercialService) return config;

  return {
    ...FeatureConfigSchema.parse({}),
    agentEngine: config.agentEngine,
    multipleDataToBase64: config.multipleDataToBase64,
    showPublishFeishu: false,
    showPublishDingtalk: false,
    showPublishWecom: false,
    showPublishOffiaccount: false
  };
};
