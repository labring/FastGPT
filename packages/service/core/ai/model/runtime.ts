import {
  AIModelDataSchema,
  AIModelDocumentDataSchema,
  type AIModelDataType
} from '@fastgpt/global/core/ai/model/schema';
import { defaultProvider } from '@fastgpt/global/core/ai/model/provider';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { getModelProvider } from './provider/controller';

/**
 * 将 Mongo 模型文档转换为统一的运行时模型。
 * Provider 元数据可能尚未加载或已经失效；团队模型读取必须保留 fallback，
 * 系统目录则可以关闭 fallback，让安装目录问题继续暴露给启动流程。
 * 滚动升级时旧节点可能在迁移成功后写回无类型的 STT 价格；仅在数据库读取边界
 * 将其解释为每 60 秒，不回写数据库，也不放宽新 API/JSON 配置的类型校验。
 */
export const formatDbModelToRuntimeModel = (
  dbModel: Record<string, unknown>,
  options: { language?: string; fallbackProvider?: boolean } = {}
): AIModelDataType => {
  const pricing = (() => {
    const { pricing } = dbModel;
    if (
      dbModel.type === ModelTypeEnum.stt &&
      typeof pricing === 'object' &&
      pricing !== null &&
      !Array.isArray(pricing) &&
      !('type' in pricing)
    ) {
      return { ...pricing, type: 'duration' };
    }
    return pricing;
  })();
  const dbDocument = AIModelDocumentDataSchema.parse({ ...dbModel, pricing });
  const provider = (() => {
    try {
      return getModelProvider(dbDocument.provider, options.language ?? 'en');
    } catch (error) {
      if (!options.fallbackProvider) throw error;
      return defaultProvider;
    }
  })();

  const runtimeModel = AIModelDataSchema.parse({
    ...dbDocument,
    modelId: String(dbModel._id),
    provider: provider.id,
    avatar: provider.avatar
  });

  return runtimeModel;
};
