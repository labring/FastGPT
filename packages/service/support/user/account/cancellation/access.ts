import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import type { AccountCancellationAccessPreset } from '@fastgpt/global/support/user/account/cancellation/type';
import type { AssertAccountUsableProps } from './guard';

type AccessRequest = {
  method?: string;
  url?: string;
};

type AccessPreset = {
  apis: string[];
  options: Required<
    Pick<
      AssertAccountUsableProps,
      | 'allowUserAccountCancellationPending'
      | 'allowCurrentUserOwnedTeamAccountCancellationPending'
      | 'allowCurrentSessionTeamAccountCancellationPending'
    >
  >;
};

export const accountCancellationAccessPresets: Record<
  AccountCancellationAccessPreset,
  AccessPreset
> = {
  normal: {
    apis: [],
    options: {
      allowUserAccountCancellationPending: false,
      allowCurrentUserOwnedTeamAccountCancellationPending: false,
      allowCurrentSessionTeamAccountCancellationPending: false
    }
  },
  selfCancellation: {
    apis: [
      'GET /proApi/support/user/account/cancellation/status',
      'POST /proApi/support/user/account/cancellation/verification/create',
      'POST /proApi/support/user/account/cancellation/submit',
      'DELETE /proApi/support/user/account/cancellation/cancel'
    ],
    options: {
      allowUserAccountCancellationPending: true,
      allowCurrentUserOwnedTeamAccountCancellationPending: true,
      allowCurrentSessionTeamAccountCancellationPending: true
    }
  },
  teamEscape: {
    apis: [
      'GET /proApi/support/user/team/list',
      'POST /proApi/support/user/team/switch',
      'PUT /proApi/support/user/team/switch'
    ],
    options: {
      allowUserAccountCancellationPending: false,
      allowCurrentUserOwnedTeamAccountCancellationPending: false,
      allowCurrentSessionTeamAccountCancellationPending: true
    }
  },
  tokenLogin: {
    apis: [
      'GET /api/support/user/account/tokenLogin',
      'GET /proApi/support/user/account/tokenLogin',
      'GET /api/support/user/team/plan/getTeamPlanStatus'
    ],
    options: {
      allowUserAccountCancellationPending: true,
      allowCurrentUserOwnedTeamAccountCancellationPending: true,
      allowCurrentSessionTeamAccountCancellationPending: true
    }
  }
};

const requestKeys = ({ method, url }: AccessRequest) => {
  const normalizedMethod = method?.toUpperCase();
  if (!normalizedMethod || !url) return [];
  let pathname = url;
  try {
    pathname = new URL(url, 'http://fastgpt.local').pathname;
  } catch {
    pathname = url.split('?')[0] ?? '';
  }

  const paths = new Set([pathname]);
  if (pathname.startsWith('/api/proApi/')) paths.add(pathname.replace('/api/proApi', '/proApi'));
  if (pathname.startsWith('/api/') && !pathname.startsWith('/api/proApi/')) {
    paths.add(pathname.replace('/api', '/proApi'));
  }
  return Array.from(paths, (path) => `${normalizedMethod} ${path}`);
};

/** 将访问 preset 收窄为 guard flags，并强制校验当前请求路径。 */
export const resolveAccountCancellationAccess = ({
  req,
  accountCancellationAccess = 'normal'
}: {
  req?: AccessRequest;
  accountCancellationAccess?: AccountCancellationAccessPreset;
}) => {
  const preset = accountCancellationAccessPresets[accountCancellationAccess];
  const keys = requestKeys(req ?? {});
  if (accountCancellationAccess !== 'normal') {
    const allowed = keys.some((key) => preset.apis.includes(key));
    if (!allowed) throw new Error(ERROR_ENUM.unAuthorization);
  }
  if (
    accountCancellationAccess === 'selfCancellation' &&
    keys.some((key) =>
      [
        'POST /proApi/support/user/account/cancellation/verification/create',
        'POST /proApi/support/user/account/cancellation/submit'
      ].includes(key)
    )
  ) {
    // 状态查询和取消注销必须可恢复；仅阻止成员借 pending 团队发起新的注销申请。
    return {
      ...preset.options,
      allowCurrentSessionTeamAccountCancellationPending: false
    };
  }
  return preset.options;
};
