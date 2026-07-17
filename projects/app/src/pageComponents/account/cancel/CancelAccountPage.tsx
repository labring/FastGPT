import { Spinner } from '@chakra-ui/react';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import type {
  AccountCancellationStatusResponse,
  SubmitAccountCancellationResponse
} from '@fastgpt/global/openapi/support/user/account/cancellation/api';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useUserStore } from '@/web/support/user/useUserStore';
import {
  cancelAccountCancellation,
  getAccountCancellationStatus
} from '@/web/support/user/account/cancellation/api';
import { AccountCancellationPageLayout } from './AccountCancellationPageLayout';
import { CancelPendingPanel } from './CancelPendingPanel';
import { MemberPendingPanel } from './MemberPendingPanel';
import { VerificationPanel } from './VerificationPanel';

const CancelAccountPage = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const { userInfo, initUserInfo, setUserInfo } = useUserStore();
  const [status, setStatus] = useState<AccountCancellationStatusResponse>();
  const [submittedResult, setSubmittedResult] =
    useState<Extract<SubmitAccountCancellationResponse, { status: 'pending' }>>();
  const [loading, setLoading] = useState(true);
  const [canceling, setCanceling] = useState(false);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      setStatus(await getAccountCancellationStatus());
    } catch {
      await router.replace('/account/info');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void initUserInfo().then(loadStatus);
  }, [initUserInfo, loadStatus]);

  const memberCancellation = userInfo?.team?.accountCancellation;
  const isMemberView = status?.status === 'none' && !!memberCancellation;
  const isVerificationView =
    status?.status === 'none' &&
    status.canRequestCancellation &&
    router.query.confirmed === '1' &&
    !memberCancellation;

  useEffect(() => {
    if (loading || !router.isReady || !status || submittedResult) return;
    if (status.status === 'pending' || isMemberView || isVerificationView) return;
    void router.replace('/account/info');
  }, [isMemberView, isVerificationView, loading, router, status, submittedResult]);

  const onSubmitted = useCallback(
    (result: Extract<SubmitAccountCancellationResponse, { status: 'pending' }>) => {
      setSubmittedResult(result);
    },
    []
  );

  const onCancel = async () => {
    if (submittedResult) {
      setUserInfo(null);
      await router.replace('/login?lastRoute=/account/cancel');
      return;
    }

    setCanceling(true);
    try {
      await cancelAccountCancellation();
      toast({
        status: 'success',
        title: t('account_info:account_cancellation_cancel_success', '已取消注销')
      });
      await router.replace('/account/info');
    } catch {
      toast({
        status: 'warning',
        title: t('account_info:account_cancellation_cancel_error', '取消失败')
      });
    } finally {
      setCanceling(false);
    }
  };

  const content = (() => {
    if (loading || !status) {
      return <Spinner color="primary.600" />;
    }
    if (submittedResult) {
      return (
        <CancelPendingPanel
          requestedAt={submittedResult.requestedAt}
          scheduledCancelAt={submittedResult.scheduledCancelAt}
          canCancel={submittedResult.canCancelCancellation}
          onCancel={() => void onCancel()}
          loading={canceling}
        />
      );
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
      return <VerificationPanel onSubmitted={onSubmitted} />;
    }
    return <Spinner color="primary.600" />;
  })();

  return (
    <AccountCancellationPageLayout
      showBack={isVerificationView && !submittedResult}
      onBack={() => void router.replace('/account/info')}
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
