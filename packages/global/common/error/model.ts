import { ModelErrEnum } from './code/model';
import { UserError } from './utils';

/**
 * 判断模型未配置、下架、停用或类型不匹配等配置错误。
 * 只识别业务 UserError 的稳定机器码，不匹配展示文案，也不把普通请求异常作为配置错误。
 */
export const isModelConfigError = (error: unknown): error is UserError =>
  error instanceof UserError &&
  (error.message === ModelErrEnum.unExist || error.message === ModelErrEnum.unConfigured);
