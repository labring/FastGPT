export type PostLoginAction =
  | 'invitation'
  | 'memberName'
  | 'resetExpiredPassword'
  | 'contact'
  | 'systemMessage'
  | 'importantInform'
  | 'activityAd'
  | 'enterpriseAuthNotice';

export type OneTimePostLoginAction = Exclude<PostLoginAction, 'importantInform'>;

export type PostLoginActionState = {
  key: string;
  completed: ReadonlySet<OneTimePostLoginAction>;
  currentAction?: PostLoginAction;
};

export const POST_LOGIN_ACTION_EXCLUDED_ROUTES = new Set([
  '/',
  '/login',
  '/login/provider',
  '/login/fastlogin',
  '/login/sso',
  '/appStore',
  '/account/cancel',
  '/chat',
  '/chat/share',
  '/tools/price',
  '/price',
  '/logout'
]);

/** 判断当前路径是否允许启动登录后的引导动作；注销页面必须保持流程专注。 */
export const isPostLoginActionRoute = (pathname: string) =>
  !POST_LOGIN_ACTION_EXCLUDED_ROUTES.has(pathname);

/**
 * 按设计文档规定的顺序选择下一个登录后动作。
 * 当前动作优先保持不变；重要通知不进入一次性完成集合，后续新通知可以再次触发。
 */
export const getNextPostLoginAction = ({
  canStart,
  currentAction,
  completed,
  inviteLinkId,
  hasPendingMemberName,
  shouldShowContact,
  contactHandled,
  isPlus,
  hasImportantInform
}: {
  canStart: boolean;
  currentAction?: PostLoginAction;
  completed: ReadonlySet<OneTimePostLoginAction>;
  inviteLinkId: string;
  hasPendingMemberName: boolean;
  shouldShowContact: boolean;
  contactHandled: boolean;
  isPlus: boolean;
  hasImportantInform: boolean;
}) => {
  if (!canStart) return undefined;
  if (currentAction) return currentAction;

  const candidates: Array<PostLoginAction | undefined> = [
    inviteLinkId ? 'invitation' : undefined,
    hasPendingMemberName ? 'memberName' : undefined,
    isPlus ? 'resetExpiredPassword' : undefined,
    shouldShowContact && !contactHandled ? 'contact' : undefined,
    isPlus ? 'systemMessage' : undefined,
    isPlus && hasImportantInform ? 'importantInform' : undefined,
    isPlus ? 'activityAd' : undefined,
    isPlus ? 'enterpriseAuthNotice' : undefined
  ];

  return candidates.find(
    (action) => action && (action === 'importantInform' || !completed.has(action))
  );
};

/** 锁定当前动作，防止通知轮询或其他派生状态变化抢占正在展示的弹窗。 */
export const startPostLoginAction = ({
  state,
  key,
  action
}: {
  state: PostLoginActionState;
  key: string;
  action: PostLoginAction;
}): PostLoginActionState => {
  if (state.key !== key) {
    return {
      key,
      completed: new Set<OneTimePostLoginAction>(),
      currentAction: action
    };
  }

  if (state.currentAction) return state;

  return {
    ...state,
    currentAction: action
  };
};

/**
 * 释放当前动作。一次性动作写入 completed；重要通知只释放当前锁，不记录永久完成状态。
 * key 和 currentAction 都必须匹配，避免旧弹窗的异步回调污染新用户或新团队状态。
 */
export const finishPostLoginAction = ({
  state,
  key,
  action
}: {
  state: PostLoginActionState;
  key: string;
  action: PostLoginAction;
}): PostLoginActionState => {
  if (state.key !== key || state.currentAction !== action) return state;

  if (action === 'importantInform') {
    return {
      ...state,
      currentAction: undefined
    };
  }

  const completed = new Set(state.completed);
  completed.add(action);

  return {
    ...state,
    completed,
    currentAction: undefined
  };
};
