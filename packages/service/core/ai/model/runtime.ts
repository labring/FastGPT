import { ModelTypeEnum, REASONING_EFFORT_LEVELS } from '@fastgpt/global/core/ai/constants';
import { AIModelDataSchema, type AIModelDataType } from '@fastgpt/global/core/ai/model/schema';
import { defaultProvider } from '@fastgpt/global/core/ai/model/provider';
import { getModelProvider } from './provider/controller';
import { formatDbModelToDocumentData } from './transform';

/**
 * 将 Mongo 模型文档转换为统一的运行时模型。
 * Provider 元数据可能尚未加载或已经失效；团队模型读取必须保留 fallback，
 * 系统目录则可以关闭 fallback，让安装目录问题继续暴露给启动流程。
 * 数据库旧价格由共享文档读取函数规范化，与管理员 JSON 导出的读取规则保持一致；
 * LLM 开启思考配置但可用等级缺失或为空时，仅在运行时加载边界兜底为全部思考等级，不污染导出与持久化文档。
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

  const runtimeConfig =
    dbDocument.type === ModelTypeEnum.llm &&
    dbDocument.config.reasoning &&
    dbDocument.config.reasoningEffort &&
    (!dbDocument.config.reasoningEffortList || dbDocument.config.reasoningEffortList.length === 0)
      ? {
          ...dbDocument.config,
          reasoningEffortList: [...REASONING_EFFORT_LEVELS]
        }
      : dbDocument.config;

  const runtimeModel = AIModelDataSchema.parse({
    ...dbDocument,
    config: runtimeConfig,
    modelId: String(dbModel._id),
    provider: provider.id,
    avatar: provider.avatar
  });

  return runtimeModel;
};
