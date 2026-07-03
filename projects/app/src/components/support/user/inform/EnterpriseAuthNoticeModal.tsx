import React, { useCallback, useMemo, useState } from 'react';
import { Box, Button, Flex, Link, Text } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useTranslation } from 'next-i18next';
import { webPushTrack } from '@/web/common/middle/tracks/utils';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useQuery } from '@tanstack/react-query';
import { getEnterpriseAuthStatus } from '@/web/support/user/team/enterpriseAuth/api';
import { TeamEnterpriseAuthStatusEnum } from '@fastgpt/global/support/user/team/enterpriseAuth/constant';
import { canManageEnterpriseAuth } from '@/pageComponents/account/team/EnterpriseAuth/utils';

const certificationHref = '/account/info#certification';

const NoteIcon = () => (
  <Flex
    alignItems="center"
    justifyContent="center"
    flexShrink={0}
    mt="1px"
    w="18px"
    h="18px"
    borderRadius="5px"
    bg="blue.50"
    color="blue.600"
  >
    <MyIcon name="common/info" w="13px" h="13px" />
  </Flex>
);

const BenefitItem = ({ children }: { children: React.ReactNode }) => (
  <Flex as="li" alignItems="flex-start" gap={2}>
    <Flex
      alignItems="center"
      justifyContent="center"
      flexShrink={0}
      mt="2px"
      w="16px"
      h="16px"
      borderRadius="4px"
      bg="green.500"
      color="white"
    >
      <MyIcon name="common/check" w="11px" h="11px" />
    </Flex>
    <Box>{children}</Box>
  </Flex>
);

const EnterpriseAuthNoticeModal = () => {
  const router = useRouter();
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();
  const { userInfo, enterpriseAuthNoticeReadTeamIds, setEnterpriseAuthNoticeRead } = useUserStore();
  const [isClosed, setIsClosed] = useState(false);

  const teamId = userInfo?.team?.teamId;
  const canCheckEnterpriseAuthNotice = canManageEnterpriseAuth({
    isTeamOwner: userInfo?.team?.permission?.isOwner,
    hasTeamManagePer: userInfo?.team?.permission?.hasManagePer
  });
  const shouldCheckEnterpriseAuthNotice =
    router.pathname === '/dashboard/agent' &&
    !!feConfigs?.show_enterprise_auth &&
    !!teamId &&
    canCheckEnterpriseAuthNotice &&
    !enterpriseAuthNoticeReadTeamIds?.includes(teamId);
  const { data: enterpriseAuthStatus } = useQuery(
    ['getEnterpriseAuthNoticeStatus', teamId],
    getEnterpriseAuthStatus,
    {
      enabled: shouldCheckEnterpriseAuthNotice,
      staleTime: 30000
    }
  );
  const canShowEnterpriseAuthNotice = canManageEnterpriseAuth({
    statusCanManage: enterpriseAuthStatus?.canManage,
    isTeamOwner: userInfo?.team?.permission?.isOwner,
    hasTeamManagePer: userInfo?.team?.permission?.hasManagePer
  });
  const showEnterpriseAuthNotice = useMemo(
    () =>
      shouldCheckEnterpriseAuthNotice &&
      canShowEnterpriseAuthNotice &&
      enterpriseAuthStatus?.enabled !== false &&
      !!enterpriseAuthStatus?.status &&
      enterpriseAuthStatus.status !== TeamEnterpriseAuthStatusEnum.verified,
    [
      canShowEnterpriseAuthNotice,
      enterpriseAuthStatus?.enabled,
      enterpriseAuthStatus?.status,
      shouldCheckEnterpriseAuthNotice
    ]
  );

  const markAsRead = useCallback(() => {
    if (teamId) {
      setEnterpriseAuthNoticeRead(teamId);
    }
  }, [setEnterpriseAuthNoticeRead, teamId]);

  const onClickRead = useCallback(() => {
    markAsRead();
    setIsClosed(true);
  }, [markAsRead]);

  const onClickCertificationLink = useCallback(
    async (event: React.MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      markAsRead();
      webPushTrack.enterpriseAuthOpen({ source: 'notice' });
      await router.push(certificationHref);
    },
    [markAsRead, router]
  );

  if (!showEnterpriseAuthNotice || isClosed) return null;

  return (
    <MyModal
      isOpen
      onClose={() => setIsClosed(true)}
      isCentered
      size={'md'}
      title={t('common:enterprise_auth_notice_title')}
      footer={<Button onClick={onClickRead}>{t('common:enterprise_auth_notice_read')}</Button>}
    >
      <Flex flexDirection={'column'} gap={6} overflow={'hidden'}>
        <Box>
          <Text fontSize="16px" fontWeight={600} lineHeight="24px" mb={4}>
            {t('common:enterprise_auth_notice_headline')}
          </Text>

          <Text mb={2}>{t('common:enterprise_auth_notice_greeting')}</Text>
          <Text mb={4}>{t('common:enterprise_auth_notice_intro')}</Text>

          <Box as="section" mb={4}>
            <Flex alignItems="flex-start" gap={2}>
              <NoteIcon />
              <Text>{t('common:enterprise_auth_notice_benefit_intro')}</Text>
            </Flex>

            <Flex as="ul" direction="column" gap={1} mt={1} pl={0} listStyleType="none">
              <BenefitItem>{t('common:enterprise_auth_notice_benefit_advanced')}</BenefitItem>
              <BenefitItem>{t('common:enterprise_auth_notice_benefit_points')}</BenefitItem>
              <BenefitItem>{t('common:enterprise_auth_notice_benefit_support')}</BenefitItem>
            </Flex>
          </Box>

          <Text mb={4}>
            <Box as="span" fontWeight={600}>
              {t('common:enterprise_auth_notice_entry')}
            </Box>
            {t('common:enterprise_auth_notice_or_click')}
            <Link
              href={certificationHref}
              color="primary.600"
              fontWeight={500}
              textDecoration="underline"
              onClick={onClickCertificationLink}
            >
              {t('common:enterprise_auth_notice_link')}
            </Link>
            {t('common:enterprise_auth_notice_link_suffix')}
          </Text>

          <Text mb={6}>{t('common:enterprise_auth_notice_help')}</Text>

          <Box my={6} h="1px" bg="myGray.200" />

          <Text>{t('common:enterprise_auth_notice_footer')}</Text>
        </Box>
      </Flex>
    </MyModal>
  );
};

export default React.memo(EnterpriseAuthNoticeModal);
