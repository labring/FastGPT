import { getErrText } from '@fastgpt/global/common/error/utils';
import { systemMigrationLimits } from '@fastgpt/global/migration/constants';
import {
  SystemMigrationFailureInputSchema,
  type SystemMigrationFailureInput
} from '@fastgpt/global/migration/schema';

/** 将未知异常裁剪成可安全写入状态文档的单条错误。 */
export const normalizeMigrationFailure = (error: unknown): SystemMigrationFailureInput => {
  const message = getErrText(error, 'Unknown system migration error').slice(
    0,
    systemMigrationLimits.maxErrorMessageLength
  );
  return SystemMigrationFailureInputSchema.parse({
    message: message || 'Unknown system migration error'
  });
};

/** 校验 checkpoint 可序列化且大小受控，避免一个任务撑大 MongoDB 文档。 */
export const assertMigrationCheckpointSize = (checkpoint: Record<string, unknown>): void => {
  let serialized: string;
  try {
    serialized = JSON.stringify(checkpoint);
  } catch {
    throw new Error('System migration checkpoint must be JSON serializable');
  }

  if (Buffer.byteLength(serialized, 'utf8') > systemMigrationLimits.maxCheckpointBytes) {
    throw new Error(
      `System migration checkpoint exceeds ${systemMigrationLimits.maxCheckpointBytes} bytes`
    );
  }
};
