import { Spinner } from '@chakra-ui/react';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import type { AccountCancellationStatusResponse } from '@fastgpt/global/openapi/support/user/account/cancellation/api';
import type { OAuthAccountVerificationProvider } from '@fastgpt/global/support/user/account/verification/type';
import { checkIsWecomTerminal } from '@fastgpt/global/support/user/login/constants';
import type { OAuthEnum } from '@fastgpt/global/support/user/constant';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import {
  AccountVerificationPanel,
  type VerificationSubmitResult,
  type WechatVerificationMaterial
} from '@/components/support/user/safe/AccountVerificationPanel';
import { useUserStore } from '@/web/support/user/useUserStore';
import {
  cancelAccountCancellation,
  createAccountCancellationVerification,
  getAccountCancellationStatus,
  submitAccountCancellation
} from '@/web/support/user/account/cancellation/api';
import { AccountCancellationPageLayout } from './AccountCancellationPageLayout';
import { CancelPendingPanel } from './CancelPendingPanel';
import { MemberPendingPanel } from './MemberPendingPanel';

const CancelAccountPage = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const { userInfo, setUserInfo } = useUserStore();
  const [status, setStatus] = useState<AccountCancellationStatusResponse>();
  const [loading, setLoading] = useState(true);
  const [canceling, setCanceling] = useState(false);

  useEffect(() => {
    void getAccountCancellationStatus()
      .then(setStatus)
      .catch(() => router.replace('/account/info'))
      .finally(() => setLoading(false));
  }, [router]);

  const memberCancellation = userInfo?.team?.accountCancellation;
  const isMemberView = status?.status === 'none' && !!memberCancellation;
  const isVerificationView =
    status?.status === 'none' &&
    status.canRequestCancellation &&
    router.query.confirmed === '1' &&
    !memberCancellation;
  const isPendingView = status?.status === 'pending';

  useEffect(() => {
    if (loading || !router.isReady || !status) return;
    if (status.status === 'pending' || isMemberView || isVerificationView) return;
    void router.replace('/account/info');
  }, [isMemberView, isVerificationView, loading, router, status]);

  const onSubmitted = useCallback(() => {
    toast({
      status: 'success',
      title: t('account_info:account_cancellation_submit_success', '注销提交成功')
    });
    setUserInfo(null);
    void router.replace('/login?lastRoute=/account/cancel');
  }, [router, setUserInfo, t, toast]);

  const createCodeVerification = useCallback(async (captcha: string) => {
    const result = await createAccountCancellationVerification({
      method: 'code',
      payload: { captcha }
    });
    if (result.method !== 'code') throw new Error('Verification method mismatch');
  }, []);

  const submitCodeVerification = useCallback(
    async (code: string): Promise<VerificationSubmitResult> => {
      const result = await submitAccountCancellation({ method: 'code', payload: { code } });
      if (result.status === 'pending') {
        onSubmitted();
        return 'verified';
      }
      return result.status === 'verificationExpired' ? 'expired' : 'pending';
    },
    [onSubmitted]
  );

  const createWechatVerification = useCallback(async (): Promise<WechatVerificationMaterial> => {
    const result = await createAccountCancellationVerification({ method: 'wechat', payload: {} });
    if (result.method !== 'wechat') throw new Error('Verification method mismatch');
    return result;
  }, []);

  const submitWechatVerification = useCallback(
    async (code: string): Promise<VerificationSubmitResult> => {
      const result = await submitAccountCancellation({ method: 'wechat', payload: { code } });
      if (result.status === 'pending') {
        onSubmitted();
        return 'verified';
      }
      return result.status === 'verificationExpired' ? 'expired' : 'pending';
    },
    [onSubmitted]
  );

  const startOAuthVerification = useCallback(async () => {
    const method = status?.status === 'none' ? status.verificationMethod : undefined;
    if (!method || !method.startsWith('oauth/'))
      throw new Error('OAuth verification is unavailable');
    const callbackUrl = `${window.location.origin}/login/provider`;
    const result = await createAccountCancellationVerification({
      method,
      payload: { callbackUrl, isWecomWorkTerminal: checkIsWecomTerminal() }
    });
    if (result.method !== method) throw new Error('Verification method mismatch');
    const provider = method.slice('oauth/'.length) as OAuthAccountVerificationProvider;
    useSystemStore.getState().setLoginStore({
      provider: provider as OAuthEnum,
      lastRoute: '/account/cancel?confirmed=1',
      state: result.state,
      flow: 'accountCancellation'
    });
    return { url: result.url };
  }, [status]);

  const onCancel = async () => {
    setCanceling(true);
    try {
      await cancelAccountCancellation();
      toast({
        status: 'success',
        title: t('account_info:account_cancellation_cancel_success', '已取消注销')
      });
      window.location.replace('/account/info');
    } catch {
      toast({
        status: 'warning',
        title: t('account_info:account_cancellation_cancel_error', '取消失败')
      });
    } finally {
      setCanceling(false);
    }
  };

  // 等待期账号已停用且页面无导航入口，返回即退出登录，让用户可切换其他账号；
  // 验证页返回则回到账号信息页继续注销流程。
  const onBack = useCallback(() => {
    if (isPendingView) {
      setUserInfo(null);
      void router.replace('/login');
      return;
    }
    void router.replace('/account/info');
  }, [isPendingView, router, setUserInfo]);

  const content = (() => {
    if (loading || !status) {
      return <Spinner color="primary.600" />;
    }
    if (isMemberView && memberCancellation) {
      return (
        <MemberPendingPanel
          teamName={userInfo?.team?.teamName ?? ''}
          status={memberCancellation.status}
          scheduledCancelAt={memberCancellation.scheduledCancelAt}
        />
      );
    }
    if (status.status === 'pending') {
      return (
        <CancelPendingPanel
          requestedAt={status.requestedAt}
          scheduledCancelAt={status.scheduledCancelAt}
          canCancel={status.canCancelCancellation}
          onCancel={() => void onCancel()}
          loading={canceling}
        />
      );
    }
    if (isVerificationView) {
      return (
        <AccountVerificationPanel
          method={status.verificationMethod!}
          username={userInfo?.username ?? ''}
          purpose="unsubscribe"
          createCodeVerification={createCodeVerification}
          submitCodeVerification={submitCodeVerification}
          createWechatVerification={createWechatVerification}
          submitWechatVerification={submitWechatVerification}
          startOAuthVerification={startOAuthVerification}
        />
      );
    }
    return <Spinner color="primary.600" />;
  })();

  return (
    <AccountCancellationPageLayout
      showBack={isVerificationView || isPendingView}
      onBack={onBack}
      cardProps={
        loading || !status
          ? { minH: '220px', alignItems: 'center', justifyContent: 'center' }
          : undefined
      }
    >
      {content}
    </AccountCancellationPageLayout>
  );
};

export default CancelAccountPage;
