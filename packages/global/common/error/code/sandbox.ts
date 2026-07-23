import { i18nT } from '../../i18n/utils';
import type { ErrType } from '../errorCode';

/* sandbox: 510000 */
const startCode = 510000;

export enum SandboxErrEnum {
  agentSandboxPermissionDenied = 'agentSandboxPermissionDenied',
  agentSandboxInitializing = 'agentSandboxInitializing',
  runtimeUpgradeFailed = 'runtimeUpgradeFailed',
  runtimeUpgradeInProgress = 'runtimeUpgradeInProgress'
}

const sandboxErr = [
  {
    statusText: SandboxErrEnum.agentSandboxPermissionDenied,
    message: i18nT('common:code_error.sandbox_error.agent_sandbox_permission_denied')
  },
  {
    statusText: SandboxErrEnum.agentSandboxInitializing,
    message: i18nT('common:code_error.sandbox_error.agent_sandbox_initializing'),
    httpStatus: 409
  },
  {
    statusText: SandboxErrEnum.runtimeUpgradeFailed,
    message: i18nT('common:code_error.sandbox_error.runtime_upgrade_failed')
  },
  {
    statusText: SandboxErrEnum.runtimeUpgradeInProgress,
    message: i18nT('skill:sandbox_runtime_upgrade_in_progress'),
    httpStatus: 409
  }
];

export default sandboxErr.reduce((acc, cur, index) => {
  return {
    ...acc,
    [cur.statusText]: {
      code: startCode + index,
      statusText: cur.statusText,
      message: cur.message,
      data: null,
      httpStatus: cur.httpStatus ?? 403
    }
  };
}, {} as ErrType<`${SandboxErrEnum}`>);
