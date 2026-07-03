import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Box,
  Button,
  Flex,
  Skeleton,
  useDisclosure,
  type BoxProps,
  type ButtonProps
} from '@chakra-ui/react';
import dynamic from 'next/dynamic';
import { useTranslation } from 'next-i18next';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { webPushTrack } from '@/web/common/middle/tracks/utils';
import { useUserStore } from '@/web/support/user/useUserStore';
import { getEnterpriseAuthStatus } from '@/web/support/user/team/enterpriseAuth/api';
import {
  TeamEnterpriseAuthStatusEnum,
  TeamEnterpriseAuthTaskStatusEnum
} from '@fastgpt/global/support/user/team/enterpriseAuth/constant';
import {
  canManageEnterpriseAuth,
  canOpenEnterpriseAuthAmountStep,
  shouldShowEnterpriseAuthContactBusinessModal
} from './utils';

const EnterpriseAuthModal = dynamic(() => import('./Modal'), { ssr: false });
const EnterpriseAuthContactBusinessModal = dynamic(() => import('./ContactBusinessModal'), {
  ssr: false
});

type EnterpriseAuthStatusRowProps = BoxProps & {
  labelStyles?: BoxProps;
  buttonProps?: ButtonProps;
  autoOpen?: boolean;
  onAutoOpenFinish?: () => void;
};

const getStatusCopy = ({
  t,
  status,
  taskStatus,
  verifiedEnterpriseName,
  hasTask
}: {
  t: (key: string, options?: Record<string, any>) => string;
  status?: `${TeamEnterpriseAuthStatusEnum}`;
  taskStatus?: `${TeamEnterpriseAuthTaskStatusEnum}`;
  verifiedEnterpriseName?: string;
  hasTask?: boolean;
}) => {
  if (status === TeamEnterpriseAuthStatusEnum.verified) {
    return {
      label: verifiedEnterpriseName || t('account_team:enterprise_auth_verified_label')
    };
  }

  if (
    taskStatus === TeamEnterpriseAuthTaskStatusEnum.starting ||
    taskStatus === TeamEnterpriseAuthTaskStatusEnum.granting
  ) {
    return {
      label: t('account_team:enterprise_auth_processing_label')
    };
  }

  if (hasTask || status === TeamEnterpriseAuthStatusEnum.verifying) {
    return {
      label: t('account_team:enterprise_auth_pending_amount_label'),
      buttonText: t('account_team:enterprise_auth_continue_button')
    };
  }

  return {
    label: t('account_team:enterprise_auth_unverified_label'),
    buttonText: t('account_team:enterprise_auth_button')
  };
};

const EnterpriseAuthStatusRow = ({
  labelStyles,
  buttonProps,
  autoOpen = false,
  onAutoOpenFinish,
  ...props
}: EnterpriseAuthStatusRowProps) => {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();
  const { userInfo, initUserInfo } = useUserStore();
  const { toast } = useToast();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const {
    isOpen: isOpenContactBusiness,
    onOpen: onOpenContactBusiness,
    onClose: onCloseContactBusiness
  } = useDisclosure();
  const autoOpenHandledRef = useRef(false);

  const {
    data,
    loading,
    error,
    refresh: refreshStatus
  } = useRequest(getEnterpriseAuthStatus, {
    manual: false,
    ready: !!feConfigs?.show_enterprise_auth && !!userInfo?.team?.teamId,
    refreshDeps: [userInfo?.team?.teamId],
    errorToast: ''
  });

  const statusCopy = useMemo(
    () =>
      getStatusCopy({
        t,
        status: data?.status,
        taskStatus: data?.currentTask?.status,
        verifiedEnterpriseName: data?.verifiedEnterpriseName,
        hasTask: !!data?.currentTask
      }),
    [data?.currentTask, data?.status, data?.verifiedEnterpriseName, t]
  );
  const needContactBusiness = shouldShowEnterpriseAuthContactBusinessModal({
    usedTimes: data?.usedTimes,
    hasCurrentTask: !!data?.currentTask
  });
  const canOpenCurrentTask = canOpenEnterpriseAuthAmountStep(data?.currentTask?.status);
  const hasOtherMemberProcessingTask =
    data?.status === TeamEnterpriseAuthStatusEnum.verifying && !data?.currentTask;
  const canManageCurrentEnterpriseAuth = canManageEnterpriseAuth({
    statusCanManage: data?.canManage,
    isTeamOwner: userInfo?.team?.permission?.isOwner,
    hasTeamManagePer: userInfo?.team?.permission?.hasManagePer
  });

  const trackOpen = useCallback(
    (source: 'statusRow' | 'notice') => {
      webPushTrack.enterpriseAuthOpen({
        source,
        status: data?.status,
        taskStatus: data?.currentTask?.status,
        hasCurrentTask: !!data?.currentTask,
        canManage: canManageCurrentEnterpriseAuth,
        needContactBusiness
      });
    },
    [canManageCurrentEnterpriseAuth, data?.currentTask, data?.status, needContactBusiness]
  );

  const handleOpen = useCallback(() => {
    if (data?.status === TeamEnterpriseAuthStatusEnum.verified) return;

    trackOpen('statusRow');
    if (!canManageCurrentEnterpriseAuth) {
      toast({
        title: t('account_team:enterprise_auth_contact_admin_tip'),
        status: 'warning'
      });
      return;
    }
    if (hasOtherMemberProcessingTask) {
      toast({
        title: t('common:enterprise_auth.error.processing'),
        status: 'warning'
      });
      return;
    }
    if (needContactBusiness) {
      webPushTrack.enterpriseAuthContactBusiness({
        source: 'statusRow',
        status: data?.status,
        taskStatus: data?.currentTask?.status,
        usedTimes: data?.usedTimes
      });
      onOpenContactBusiness();
      return;
    }
    if (data?.currentTask && !canOpenCurrentTask) {
      return;
    }
    onOpen();
  }, [
    canOpenCurrentTask,
    canManageCurrentEnterpriseAuth,
    data?.currentTask,
    data?.status,
    data?.usedTimes,
    hasOtherMemberProcessingTask,
    needContactBusiness,
    onOpen,
    onOpenContactBusiness,
    t,
    trackOpen,
    toast
  ]);

  useEffect(() => {
    if (!autoOpen || autoOpenHandledRef.current) return;
    if (error) {
      autoOpenHandledRef.current = true;
      onAutoOpenFinish?.();
      return;
    }
    if (!feConfigs?.show_enterprise_auth || data?.enabled === false) {
      autoOpenHandledRef.current = true;
      onAutoOpenFinish?.();
      return;
    }
    if (loading || !data?.enabled) return;

    autoOpenHandledRef.current = true;
    trackOpen('notice');
    if (data.status === TeamEnterpriseAuthStatusEnum.verified) {
      onAutoOpenFinish?.();
      return;
    }
    if (!canManageCurrentEnterpriseAuth) {
      toast({
        title: t('account_team:enterprise_auth_contact_admin_tip'),
        status: 'warning'
      });
      onAutoOpenFinish?.();
      return;
    }
    if (hasOtherMemberProcessingTask) {
      toast({
        title: t('common:enterprise_auth.error.processing'),
        status: 'warning'
      });
      onAutoOpenFinish?.();
      return;
    }
    if (needContactBusiness) {
      webPushTrack.enterpriseAuthContactBusiness({
        source: 'statusRow',
        status: data?.status,
        taskStatus: data?.currentTask?.status,
        usedTimes: data?.usedTimes
      });
      onOpenContactBusiness();
      onAutoOpenFinish?.();
      return;
    }
    if (data.currentTask && !canOpenEnterpriseAuthAmountStep(data.currentTask.status)) {
      onAutoOpenFinish?.();
      return;
    }

    window.setTimeout(() => {
      onOpen();
      onAutoOpenFinish?.();
    }, 0);
  }, [
    autoOpen,
    canManageCurrentEnterpriseAuth,
    data?.currentTask,
    data?.enabled,
    data?.status,
    data?.usedTimes,
    error,
    feConfigs?.show_enterprise_auth,
    hasOtherMemberProcessingTask,
    loading,
    needContactBusiness,
    onAutoOpenFinish,
    onOpen,
    onOpenContactBusiness,
    t,
    trackOpen,
    toast
  ]);

  useEffect(() => {
    if (autoOpen) return;
    autoOpenHandledRef.current = false;
  }, [autoOpen]);

  if (!feConfigs?.show_enterprise_auth || data?.enabled === false) return null;

  if (loading && !data) {
    return <Skeleton mt={4} h={'32px'} borderRadius={'8px'} {...props} />;
  }

  if (!data?.enabled) return null;

  return (
    <>
      <Flex mt={4} alignItems={'center'} minW={0} {...props}>
        <Box {...labelStyles}>{t('account_team:enterprise_auth_title')}&nbsp;</Box>
        <Flex flex={'1 1 auto'} minW={0} align={'center'}>
          <Box
            flex={'1 1 auto'}
            minW={0}
            color={'#383F50'}
            fontFamily={'"PingFang SC"'}
            fontSize={'14px'}
            fontWeight={400}
            lineHeight={'20px'}
            letterSpacing={'0.25px'}
            noOfLines={1}
          >
            {statusCopy.label}
          </Box>
          {data.status !== TeamEnterpriseAuthStatusEnum.verified && statusCopy.buttonText && (
            <Button
              size={'sm'}
              variant={'primary'}
              flexShrink={0}
              ml={3}
              {...buttonProps}
              onClick={handleOpen}
            >
              {statusCopy.buttonText}
            </Button>
          )}
        </Flex>
      </Flex>
      {isOpen && (
        <EnterpriseAuthModal
          defaultStatus={data}
          onClose={onClose}
          onSuccess={() => {
            refreshStatus();
            initUserInfo();
          }}
        />
      )}
      {isOpenContactBusiness && (
        <EnterpriseAuthContactBusinessModal onClose={onCloseContactBusiness} />
      )}
    </>
  );
};

export default React.memo(EnterpriseAuthStatusRow);
