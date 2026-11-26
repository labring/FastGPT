import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { getSupportedReasoningEfforts } from '@fastgpt/global/core/ai/llm/utils';
import { AIModelDataSchema, type AIModelDataType } from '@fastgpt/global/core/ai/model/schema';
import { defaultProvider } from '@fastgpt/global/core/ai/model/provider';
import { getModelProvider } from './provider/controller';
import { formatDbModelToDocumentData } from './transform';

/**
 * 将 Mongo 模型文档转换为统一的运行时模型。
 * Provider 元数据可能尚未加载或已经失效；团队模型读取必须保留 fallback，
 * 系统目录则可以关闭 fallback，让安装目录问题继续暴露给启动流程。
 * 数据库旧价格由共享文档读取函数规范化，与管理员 JSON 导出的读取规则保持一致；
 * LLM 思考等级统一通过 `getSupportedReasoningEfforts` 在运行期加载边界补齐，不污染导出与持久化文档。
 */
export const formatDbModelToRuntimeModel = (
  dbModel: Record<string, unknown>,
  options: { language?: string; fallbackProvider?: boolean } = {}
): AIModelDataType => {
  const dbDocument = formatDbModelToDocumentData(dbModel);
  const provider = (() => {
    try {
      return getModelProvider(dbDocument.provider, options.language ?? 'en');
    } catch (error) {
      if (!options.fallbackProvider) throw error;
      return defaultProvider;
    }
  })();

  const runtimeConfig = (() => {
    if (dbDocument.type !== ModelTypeEnum.llm) return dbDocument.config;
    const supportedLevels = getSupportedReasoningEfforts(dbDocument);
    if (supportedLevels.length === 0) return dbDocument.config;
    return {
      ...dbDocument.config,
      reasoningEffort: true,
      reasoningEffortList: supportedLevels
    };
  })();

  const runtimeModel = AIModelDataSchema.parse({
    ...dbDocument,
    config: runtimeConfig,
    modelId: String(dbModel._id),
    provider: provider.id,
    avatar: provider.avatar
  });

  return runtimeModel;
};
