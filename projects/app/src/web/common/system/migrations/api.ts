import type {
  GetSystemMigrationFailedRecordsQuery,
  RetrySystemMigrationBody,
  SystemMigrationFailedRecordsResponse,
  SystemMigrationListResponse
} from '@fastgpt/global/migration/schema';
import { GET, POST } from '@/web/common/api/request';

const systemMigrationPath = '/admin/migrations';

/** 获取用于轮询的轻量任务列表，不包含 failedRecords 正文。 */
export const getSystemMigrationList = () =>
  GET<SystemMigrationListResponse>(`${systemMigrationPath}/list`);

/** 仅请求把非阻塞 failed 重置为 pending，任务仍由 runner 获取 lease 后执行。 */
export const retrySystemMigration = (body: RetrySystemMigrationBody) =>
  POST(`${systemMigrationPath}/retry`, body);

/** 用户打开错误弹窗时按需读取最近一次失败明细。 */
export const getSystemMigrationFailedRecords = ({
  migrationId,
  stageKey
}: GetSystemMigrationFailedRecordsQuery) =>
  GET<SystemMigrationFailedRecordsResponse>(`${systemMigrationPath}/failedRecords`, {
    migrationId,
    stageKey
  });
