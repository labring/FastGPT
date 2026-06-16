import { i18nT } from '../../i18n/utils';
import type { ErrType } from '../errorCode';

/* sandbox: 510000 */
const startCode = 510000;

export enum SandboxErrEnum {
  agentSandboxPermissionDenied = 'agentSandboxPermissionDenied'
}

const sandboxErr = [
  {
    statusText: SandboxErrEnum.agentSandboxPermissionDenied,
    message: i18nT('common:code_error.sandbox_error.agent_sandbox_permission_denied')
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
      httpStatus: 403
    }
  };
}, {} as ErrType<`${SandboxErrEnum}`>);
