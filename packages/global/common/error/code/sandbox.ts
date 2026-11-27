import { i18nT } from '../../i18n/utils';
import type { ErrorHttpStatus, ErrType } from '../errorCode';

/* sandbox: 510000 */
export enum SandboxErrEnum {
  agentSandboxPermissionDenied = 'agentSandboxPermissionDenied',
  agentSandboxInitializing = 'agentSandboxInitializing',
  agentSandboxMigrationInProgress = 'agentSandboxMigrationInProgress',
  agentSandboxLimitReached = 'agentSandboxLimitReached',
  agentSandboxTeamLimitReached = 'agentSandboxTeamLimitReached',
  agentSandboxDiskQuotaExceeded = 'agentSandboxDiskQuotaExceeded'
}

const sandboxErr: Array<{
  code: number;
  statusText: SandboxErrEnum;
  message: string;
  httpStatus: ErrorHttpStatus;
}> = [
  {
    code: 510000,
    statusText: SandboxErrEnum.agentSandboxPermissionDenied,
    message: i18nT('common:code_error.sandbox_error.agent_sandbox_permission_denied'),
    httpStatus: 403
  },
  {
    code: 510001,
    statusText: SandboxErrEnum.agentSandboxInitializing,
    message: i18nT('common:code_error.sandbox_error.agent_sandbox_initializing'),
    httpStatus: 409
  },
  {
    // Keep 510002/510003 retired (previously runtimeUpgradeFailed/InProgress) so
    // published limit-reached codes remain pinned at 510004 and 510005.
    code: 510004,
    statusText: SandboxErrEnum.agentSandboxLimitReached,
    message: i18nT('common:code_error.sandbox_error.agent_sandbox_limit_reached'),
    httpStatus: 409
  },
  {
    code: 510005,
    statusText: SandboxErrEnum.agentSandboxTeamLimitReached,
    message: i18nT('common:code_error.sandbox_error.agent_sandbox_team_limit_reached'),
    httpStatus: 409
  },
  {
    code: 510006,
    statusText: SandboxErrEnum.agentSandboxMigrationInProgress,
    message: i18nT('common:code_error.sandbox_error.agent_sandbox_migration_in_progress'),
    httpStatus: 409
  },
  {
    code: 510007,
    statusText: SandboxErrEnum.agentSandboxDiskQuotaExceeded,
    message: i18nT('common:code_error.sandbox_error.agent_sandbox_disk_quota_exceeded'),
    httpStatus: 403
  }
];

export default sandboxErr.reduce((acc, cur) => {
  return {
    ...acc,
    [cur.statusText]: {
      code: cur.code,
      statusText: cur.statusText,
      message: cur.message,
      data: null,
      httpStatus: cur.httpStatus
    }
  };
}, {} as ErrType<`${SandboxErrEnum}`>);
