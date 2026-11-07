import { UserError } from '@fastgpt/global/common/error/utils';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import { SystemMigrationDependencyErrorResponseSchema } from '@fastgpt/global/migration/schema';
import type { NodeApiResponse } from '@fastgpt/service/types/http';

/** 依赖校验失败仅携带注册表名称 key，不在服务端选择语言或写入迁移状态。 */
export class SystemMigrationDependencyError extends UserError {
  constructor(readonly prerequisiteNameKey: string) {
    super(i18nT('system_migration:prerequisite_not_succeeded'));
  }
}

/** 仅序列化可预期的依赖错误；其他错误继续交给统一 API 中间件处理。 */
export const respondSystemMigrationDependencyError = (res: NodeApiResponse, error: unknown) => {
  if (!(error instanceof SystemMigrationDependencyError)) throw error;

  const response = SystemMigrationDependencyErrorResponseSchema.parse({
    code: 409,
    message: error.message,
    data: { prerequisiteNameKey: error.prerequisiteNameKey }
  });
  res.status(response.code).json(response);
};
