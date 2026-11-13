import { i18nT } from '../../i18n/utils';
import type { ErrType } from '../errorCode';

/* sandbox: 510000 */
export enum SandboxErrEnum {
  agentSandboxPermissionDenied = 'agentSandboxPermissionDenied',
  agentSandboxInitializing = 'agentSandboxInitializing',
  runtimeUpgradeFailed = 'runtimeUpgradeFailed',
  agentSandboxLimitReached = 'agentSandboxLimitReached',
  agentSandboxTeamLimitReached = 'agentSandboxTeamLimitReached',
  agentSandboxMigrationInProgress = 'agentSandboxMigrationInProgress'
}

const sandboxErr = [
  {
    code: 510000,
    statusText: SandboxErrEnum.agentSandboxPermissionDenied,
    message: i18nT('common:code_error.sandbox_error.agent_sandbox_permission_denied')
  },
  {
    code: 510001,
    statusText: SandboxErrEnum.agentSandboxInitializing,
    message: i18nT('common:code_error.sandbox_error.agent_sandbox_initializing'),
    httpStatus: 409
  },
  {
    code: 510002,
    statusText: SandboxErrEnum.runtimeUpgradeFailed,
    message: i18nT('common:code_error.sandbox_error.runtime_upgrade_failed')
  },
  {
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
      httpStatus: cur.httpStatus ?? 403
    }
  };
}, {} as ErrType<`${SandboxErrEnum}`>);
