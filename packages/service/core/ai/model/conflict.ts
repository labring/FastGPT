import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';

/** 将 MongoDB 唯一键错误映射为 provider-side model ID 或平台模型别名冲突。 */
export const getModelDuplicateError = (error: unknown): ModelErrEnum | undefined => {
  if (typeof error !== 'object' || error === null || !('code' in error) || error.code !== 11000) {
    return undefined;
  }
  const duplicateError = error as {
    keyPattern?: Record<string, unknown>;
    index?: string;
    message?: string;
  };
  const keyPattern = duplicateError.keyPattern ?? {};
  const indexName = typeof duplicateError.index === 'string' ? duplicateError.index : undefined;
  if ('model' in keyPattern || indexName?.includes('model')) {
    return ModelErrEnum.modelIdConflict;
  }
  if ('name' in keyPattern || indexName?.includes('name')) {
    return ModelErrEnum.modelNameConflict;
  }
  if (duplicateError.message?.includes('model')) return ModelErrEnum.modelIdConflict;
  if (duplicateError.message?.includes('name')) return ModelErrEnum.modelNameConflict;
  return ModelErrEnum.modelNameConflict;
};
