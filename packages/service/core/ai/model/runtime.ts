import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import {
  AIModelDataSchema,
  AIModelDocumentDataSchema,
  type AIModelDataType
} from '@fastgpt/global/core/ai/model/schema';
import { defaultProvider } from '@fastgpt/global/core/ai/model/provider';
import { getRuntimeResolvedPriceTiers } from '@fastgpt/global/core/ai/model/pricing';
import { getModelProvider } from './provider/controller';

/**
 * 将 Mongo 模型文档转换为统一的运行时模型。
 * Provider 元数据可能尚未加载或已经失效；团队模型读取必须保留 fallback，
 * 系统目录则可以关闭 fallback，让安装目录问题继续暴露给启动流程。
 */
export const formatDbModelToRuntimeModel = (
  dbModel: Record<string, unknown>,
  options: { language?: string; fallbackProvider?: boolean } = {}
): AIModelDataType => {
  const dbDocument = AIModelDocumentDataSchema.parse(dbModel);
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

  if (runtimeModel.type === ModelTypeEnum.llm) {
    runtimeModel.priceTiers = getRuntimeResolvedPriceTiers(runtimeModel);
  }
  return runtimeModel;
};
