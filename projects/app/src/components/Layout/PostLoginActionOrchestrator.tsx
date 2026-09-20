import dynamic from 'next/dynamic';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode
} from 'react';
import { useRouter } from 'next/router';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useUserStore } from '@/web/support/user/useUserStore';
import { getInviteLinkIdFromRoute } from '@/web/support/user/loginRedirect/invitation';
import type { GetUnreadInformResponseType } from '@fastgpt/global/openapi/support/user/inform/api';
import type { UserInformSchema } from '@fastgpt/global/support/user/inform/type';
import { shouldPromptContactBinding } from '@/web/support/user/inform/utils';
import {
  finishPostLoginAction,
  getNextPostLoginAction,
  isMandatoryPostLoginActionRoute,
  isPostLoginActionAdmitted,
  isPostLoginActionRoute,
  startPostLoginAction,
  type OneTimePostLoginAction,
  type PostLoginAction,
  type PostLoginActionState
} from './postLoginAction';

const HandleInviteModal = dynamic(
  () => import('@/pageComponents/account/team/Invite/HandleInviteModal'),
  { ssr: false }
);
const ForceMemberNameModal = dynamic(() => import('./ForceMemberNameModal'), { ssr: false });
const ResetExpiredPswModal = dynamic(
  () => import('@/components/support/user/safe/ResetExpiredPswModal'),
  { ssr: false }
);
const SystemMsgModal = dynamic(() => import('@/components/support/user/inform/SystemMsgModal'), {
  ssr: false
});
const ImportantInform = dynamic(() => import('@/components/support/user/inform/ImportantInform'), {
  ssr: false
});
const UpdateContact = dynamic(() => import('@/components/support/user/inform/UpdateContactModal'), {
  ssr: false
});
const ActivityAdModal = dynamic(() => import('@/components/support/activity/ActivityAdModal'), {
  ssr: false
});
const EnterpriseAuthNoticeModal = dynamic(
  () => import('@/components/support/user/inform/EnterpriseAuthNoticeModal'),
  { ssr: false }
);

const CONTACT_HANDLED_KEY_PREFIX = 'fastgpt:login-action:bind-contact-handled:v3:';
const CONTACT_HANDLED_EVENT = 'fastgpt:login-action:bind-contact-handled-changed';

const getContactHandledKey = (userId: string) => `${CONTACT_HANDLED_KEY_PREFIX}${userId}`;

/**
 * 读取当前用户是否已处理过“绑定联系方式”引导。
 * 只允许在客户端调用，供 useSyncExternalStore 的 getSnapshot 使用。
 */
const readContactHandled = (userId?: string) =>
  !!userId && window.localStorage.getItem(getContactHandledKey(userId)) === '1';

/**
 * 订阅已处理标记的变更：写入后派发的自定义事件覆盖当前标签页，
 * storage 事件覆盖其他标签页，保证渲染读到的始终是最新值。
 */
const subscribeContactHandled = (onChange: () => void) => {
  window.addEventListener(CONTACT_HANDLED_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CONTACT_HANDLED_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
};

type PostLoginActionOrchestratorProps = {
  importantInforms: UserInformSchema[];
  importantInformQueryError: boolean;
  refetchImportantInforms: () => Promise<{
    isError?: boolean;
    data?: GetUnreadInformResponseType;
  }>;
  unreadQueryFetched: boolean;
};

/**
 * 渲染单个登录后动作所需的上下文，由各业务弹窗按需取用。
 * inviteLinkId 是加锁瞬间的快照，不是实时路由值，因此邀请弹窗在展示期间不会因为路由变化而消失。
 */
type PostLoginActionViewProps = {
  inviteLinkId: string;
  importantInforms: UserInformSchema[];
  importantInformQueryError: boolean;
  refetchImportantInforms: () => Promise<{
    isError?: boolean;
    data?: GetUnreadInformResponseType;
  }>;
  onFinishContact: () => void;
  onFinishImportantInform: () => void;
  onFinishOneTimeAction: (action: OneTimePostLoginAction) => void;
};

/**
 * 动作到弹窗的映射表。key 覆盖 PostLoginAction 全集，新增动作时 TypeScript 会强制补齐渲染分支，
 * 避免只改了顺序逻辑却漏了渲染。
 * 每个分支都必须渲染出最终会回调 finish 的弹窗：编排锁只能由弹窗释放，
 * 一旦某个动作渲染成 null，锁就再也没人解开，后续动作会全部停摆。
 * 邀请链接取自锁内快照，加锁时必然非空，所以邀请分支不存在渲染不出来的情况。
 */
const POST_LOGIN_ACTION_VIEWS: Record<
  PostLoginAction,
  (props: PostLoginActionViewProps) => ReactNode
> = {
  invitation: ({ inviteLinkId, onFinishOneTimeAction }) => (
    <HandleInviteModal
      inviteLinkId={inviteLinkId}
      onFinish={() => onFinishOneTimeAction('invitation')}
    />
  ),
  memberName: ({ onFinishOneTimeAction }) => (
    <ForceMemberNameModal onSuccess={() => onFinishOneTimeAction('memberName')} />
  ),
  resetExpiredPassword: ({ onFinishOneTimeAction }) => (
    <ResetExpiredPswModal enabled onFinish={() => onFinishOneTimeAction('resetExpiredPassword')} />
  ),
  contact: ({ onFinishContact }) => <UpdateContact onClose={onFinishContact} mode="contact" />,
  systemMessage: ({ onFinishOneTimeAction }) => (
    <SystemMsgModal enabled onFinish={() => onFinishOneTimeAction('systemMessage')} />
  ),
  importantInform: ({
    importantInforms,
    importantInformQueryError,
    refetchImportantInforms,
    onFinishImportantInform
  }) => (
    <ImportantInform
      enabled
      informs={importantInforms}
      refetch={refetchImportantInforms}
      queryError={importantInformQueryError}
      onResolved={onFinishImportantInform}
    />
  ),
  activityAd: ({ onFinishOneTimeAction }) => (
    <ActivityAdModal enabled onFinish={() => onFinishOneTimeAction('activityAd')} />
  ),
  enterpriseAuthNotice: ({ onFinishOneTimeAction }) => (
    <EnterpriseAuthNoticeModal
      enabled
      onFinish={() => onFinishOneTimeAction('enterpriseAuthNotice')}
    />
  )
};

/**
 * 串行编排登录后的用户动作，保证邀请、成员名、联系方式和通知类弹窗不会同时出现。
 * 业务组件只负责自身展示和完成回调，动作顺序与启动条件集中在这里维护。
 */
const PostLoginActionOrchestrator = ({
  importantInforms,
  importantInformQueryError,
  refetchImportantInforms,
  unreadQueryFetched
}: PostLoginActionOrchestratorProps) => {
  const router = useRouter();
  const { feConfigs } = useSystemStore();
  const { userInfo } = useUserStore();
  const userId = userInfo?._id;
  const teamId = userInfo?.team?.teamId;
  // 只在路由变化时解析邀请参数：这个值同时是加锁快照的来源，需要保持稳定身份
  const inviteLinkId = useMemo(() => getInviteLinkIdFromRoute(router.asPath), [router.asPath]);
  const isPlus = !!feConfigs?.isPlus;
  // 可选通知类和强制动作使用不同的路由准入：前者排除表更宽，
  // 后者只避开流程必须专注的路由，保证 /chat、/appStore 上也能完成强制补齐。
  const canRunOptionalActions = isPostLoginActionRoute(router.pathname);
  const canRunMandatoryActions = isMandatoryPostLoginActionRoute(router.pathname);
  const runKey = userId && teamId ? `${userId}:${teamId}` : '';

  const [runState, setRunState] = useState<PostLoginActionState>({
    key: '',
    completed: new Set<OneTimePostLoginAction>()
  });

  // localStorage 属于渲染外部的可变数据源，统一通过 useSyncExternalStore 订阅，
  // 不在渲染体里同步读取；服务端渲染阶段固定视为未处理。
  const contactHandled = useSyncExternalStore(
    subscribeContactHandled,
    () => readContactHandled(userId),
    () => false
  );

  const shouldShowContact = shouldPromptContactBinding({
    isPlus,
    bindNotificationMethod: feConfigs?.bind_notification_method,
    contact: userInfo?.contact
  });

  const baseReady = router.isReady && isPlus && !!userId && !!teamId;
  // 强制补齐不依赖未读通知数据，不能等该查询 settle；
  // 可选通知类动作需要查询结果判断 hasImportantInform，所以必须等 isFetched。
  const canStartMandatory = baseReady && canRunMandatoryActions;
  const canStartOptional = baseReady && canRunOptionalActions && unreadQueryFetched;

  const finishOneTimeAction = useCallback(
    (action: OneTimePostLoginAction) => {
      setRunState((state) => finishPostLoginAction({ state, key: runKey, action }));
    },
    [runKey]
  );

  const finishImportantInform = useCallback(() => {
    setRunState((state) =>
      finishPostLoginAction({ state, key: runKey, action: 'importantInform' })
    );
  }, [runKey]);

  const currentAction = runState.key === runKey ? runState.currentAction : undefined;
  const completed =
    runState.key === runKey ? runState.completed : new Set<OneTimePostLoginAction>();
  // 邀请链接只认加锁瞬间的快照。用户跳到其他页面再回来、或接受邀请后路由被 replace 清理，
  // 都不会让已锁定的邀请动作失去渲染依据。
  const lockedInviteLinkId = runState.key === runKey ? (runState.currentLinkId ?? '') : '';
  const nextAction = getNextPostLoginAction({
    canStartMandatory,
    canStartOptional,
    currentAction,
    completed,
    inviteLinkId,
    hasPendingMemberName: userInfo?.team?.memberNamePending === true,
    shouldShowContact,
    contactHandled,
    isPlus,
    hasImportantInform: importantInforms.length > 0
  });

  useEffect(() => {
    if (!runKey || !nextAction || currentAction === nextAction) return;

    // 编排锁只能在路由、用户信息和未读通知这些异步输入全部就绪后提交。
    // nextAction 与当前锁不同时，只可能是强制动作抢占当前路由不准入的可选动作。
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 动作锁依赖异步就绪状态，无法在渲染期派生
    setRunState((state) =>
      startPostLoginAction({
        state,
        key: runKey,
        action: nextAction,
        // 只有邀请动作依赖额外上下文，加锁时快照链接，其余动作不写入
        linkId: nextAction === 'invitation' ? inviteLinkId : undefined
      })
    );
  }, [currentAction, inviteLinkId, nextAction, runKey]);

  const activeAction =
    currentAction &&
    isPostLoginActionAdmitted({ action: currentAction, canStartMandatory, canStartOptional })
      ? currentAction
      : undefined;

  const finishContact = useCallback(() => {
    if (userId) {
      window.localStorage.setItem(getContactHandledKey(userId), '1');
      // 主动派发变更事件，避免依赖下一次渲染才拿到最新标记。
      window.dispatchEvent(new Event(CONTACT_HANDLED_EVENT));
    }
    finishOneTimeAction('contact');
  }, [finishOneTimeAction, userId]);

  if (!activeAction) return null;

  // 动作与弹窗的对应关系集中在 POST_LOGIN_ACTION_VIEWS，这里只负责把上下文传进去。
  const renderAction = POST_LOGIN_ACTION_VIEWS[activeAction];

  return (
    <>
      {renderAction({
        inviteLinkId: lockedInviteLinkId,
        importantInforms,
        importantInformQueryError,
        refetchImportantInforms,
        onFinishContact: finishContact,
        onFinishImportantInform: finishImportantInform,
        onFinishOneTimeAction: finishOneTimeAction
      })}
    </>
  );
};

export default PostLoginActionOrchestrator;
