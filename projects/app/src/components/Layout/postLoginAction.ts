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
  /** 被强制动作临时抢占的可选动作，强制动作完成后恢复。 */
  pausedOptionalAction?: PostLoginAction;
  /**
   * 锁定邀请动作时快照下来的邀请链接 ID。
   * 弹窗展示期间路由可能被清理（接受邀请后 replace、用户跳到其他页面再回来），
   * 锁里保留快照才能保证已锁定的动作始终有渲染依据，
   * 不会退化成“锁还在、却什么都不渲染”，把后续所有动作一起堵死。
   */
  currentLinkId?: string;
};

/**
 * 可选通知类动作的路由排除表：/chat、/appStore 等专注使用的页面
 * 不应被系统通知、活动广告等可选弹窗打断。
 * 强制动作使用更窄的 MANDATORY_ACTION_EXCLUDED_ROUTES，两者不要混用。
 */
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

/** 判断当前路径是否允许启动可选通知类登录后引导动作。 */
export const isPostLoginActionRoute = (pathname: string) =>
  !POST_LOGIN_ACTION_EXCLUDED_ROUTES.has(pathname);

/**
 * 强制动作（邀请处理、成员名补齐）属于必须完成的数据补齐：不挂载的话
 * 用户可能一直停留在 /chat、/appStore 等路由上永远补不完，内部哨兵值也会残留在会话里。
 * 因此只保留流程必须绝对专注的路由：登录/注销、注销账号和根路径重定向中间页。
 */
export const MANDATORY_ACTION_EXCLUDED_ROUTES = new Set([
  '/',
  '/login',
  '/login/provider',
  '/login/fastlogin',
  '/login/sso',
  '/account/cancel',
  '/logout'
]);

/** 判断当前路径是否允许挂载强制动作。 */
export const isMandatoryPostLoginActionRoute = (pathname: string) =>
  !MANDATORY_ACTION_EXCLUDED_ROUTES.has(pathname);

/** 强制动作集合：新增动作默认属于可选通知类，只有必须完成的补齐才放进这里。 */
export const MANDATORY_POST_LOGIN_ACTIONS: ReadonlySet<PostLoginAction> = new Set([
  'invitation',
  'memberName'
]);

export const isMandatoryPostLoginAction = (action: PostLoginAction) =>
  MANDATORY_POST_LOGIN_ACTIONS.has(action);

/**
 * 判断某个动作在当前就绪标志下是否准入：强制动作看强制门槛，可选通知类看可选门槛。
 * 路由排除在这里收敛，保证选择下一个动作、提交编排锁和渲染三处的判断始终一致。
 */
export const isPostLoginActionAdmitted = ({
  action,
  canStartMandatory,
  canStartOptional
}: {
  action: PostLoginAction;
  canStartMandatory: boolean;
  canStartOptional: boolean;
}) => (isMandatoryPostLoginAction(action) ? canStartMandatory : canStartOptional);

/**
 * 按设计文档规定的顺序选择下一个登录后动作。
 * 当前准入的动作优先保持不变；隐藏的可选动作允许强制动作临时抢占。
 * 重要通知不进入一次性完成集合，后续新通知可以再次触发。
 */
export const getNextPostLoginAction = ({
  canStartMandatory,
  canStartOptional,
  currentAction,
  completed,
  inviteLinkId,
  hasPendingMemberName,
  shouldShowContact,
  contactHandled,
  isPlus,
  hasImportantInform
}: {
  canStartMandatory: boolean;
  canStartOptional: boolean;
  currentAction?: PostLoginAction;
  completed: ReadonlySet<OneTimePostLoginAction>;
  inviteLinkId: string;
  hasPendingMemberName: boolean;
  shouldShowContact: boolean;
  contactHandled: boolean;
  isPlus: boolean;
  hasImportantInform: boolean;
}) => {
  if (!canStartMandatory && !canStartOptional) return undefined;
  if (
    currentAction &&
    isPostLoginActionAdmitted({ action: currentAction, canStartMandatory, canStartOptional })
  ) {
    return currentAction;
  }
  // 不准入的强制动作仍保持锁定；只有隐藏的可选动作可以被强制动作临时抢占。
  if (currentAction && isMandatoryPostLoginAction(currentAction)) return undefined;

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
    (action) =>
      !!action &&
      isPostLoginActionAdmitted({ action, canStartMandatory, canStartOptional }) &&
      (action === 'importantInform' || !completed.has(action))
  );
};

/**
 * 锁定当前动作，防止通知轮询或其他派生状态变化抢占正在展示的弹窗。
 * 唯一例外是不准入的可选动作可由强制动作抢占，此时可选动作会被暂停并在强制动作完成后恢复。
 * linkId 只在锁定邀请动作时传入，作为这一次展示的快照；其他动作省略即可。
 * 每次加锁都会覆盖旧快照，避免非邀请动作继承上一次的邀请链接。
 */
export const startPostLoginAction = ({
  state,
  key,
  action,
  linkId
}: {
  state: PostLoginActionState;
  key: string;
  action: PostLoginAction;
  linkId?: string;
}): PostLoginActionState => {
  if (state.key !== key) {
    return {
      key,
      completed: new Set<OneTimePostLoginAction>(),
      currentAction: action,
      currentLinkId: linkId
    };
  }

  if (state.currentAction) {
    const canMandatoryActionPreempt =
      !isMandatoryPostLoginAction(state.currentAction) && isMandatoryPostLoginAction(action);
    if (!canMandatoryActionPreempt) return state;

    return {
      ...state,
      currentAction: action,
      currentLinkId: linkId,
      pausedOptionalAction: state.pausedOptionalAction ?? state.currentAction
    };
  }

  return {
    ...state,
    currentAction: action,
    currentLinkId: linkId,
    pausedOptionalAction:
      state.pausedOptionalAction === action ? undefined : state.pausedOptionalAction
  };
};

/**
 * 释放当前动作。一次性动作写入 completed；重要通知只释放当前锁，不记录永久完成状态。
 * key 和 currentAction 都必须匹配，避免旧弹窗的异步回调污染新用户或新团队状态。
 * 释放时一并清空邀请链接快照，避免下一次加锁前读到过期链接。
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
      currentAction: state.pausedOptionalAction,
      pausedOptionalAction: undefined,
      currentLinkId: undefined
    };
  }

  const completed = new Set(state.completed);
  completed.add(action);

  return {
    ...state,
    completed,
    currentAction: state.pausedOptionalAction,
    pausedOptionalAction: undefined,
    currentLinkId: undefined
  };
};
