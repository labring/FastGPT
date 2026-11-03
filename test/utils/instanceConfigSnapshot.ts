import { resolveSystemInstanceConfig } from '@fastgpt/global/common/system/config/schema';

/** 测试使用完整 Schema 默认快照；不再依赖缺叶子快照触发已移除的 ENV 兜底。 */
export const createDefaultInstanceConfig = () => resolveSystemInstanceConfig({});

/** 获取可修改的测试快照；测试通过配置字段驱动业务，旧环境变量不参与运行期读写。 */
export const getTestInstanceConfig = () => {
  global.systemInstanceConfig ??= createDefaultInstanceConfig();
  return global.systemInstanceConfig;
};
