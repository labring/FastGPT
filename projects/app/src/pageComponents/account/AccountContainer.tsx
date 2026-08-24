import React, { useCallback, useMemo } from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useRouter } from 'next/router';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import SecondaryNavigationContainer from '@/pageComponents/common/SecondaryNavigationContainer';

export enum TabEnum {
  'info' = 'info',
  'usage' = 'usage',
  'bill' = 'bill',
  'inform' = 'inform',
  'setting' = 'setting',
  'thirdParty' = 'thirdParty',
  'individuation' = 'individuation',
  'apikey' = 'apikey',
  'loginout' = 'loginout',
  'team' = 'team',
  'model' = 'model',
  'customDomain' = 'customDomain'
}

const AccountContainer = ({
  children,
  isLoading
}: {
  children: React.ReactNode;
  isLoading?: boolean;
}) => {
  const { t } = useClientTranslation('account');
  const { userInfo, setUserInfo } = useUserStore();
  const { feConfigs, systemVersion } = useSystemStore();
  const router = useRouter();

  const showThirdPartyTab =
    feConfigs?.show_openai_account === true ||
    feConfigs?.externalProviderWorkflowVariables?.some((item) => item.isOpen) === true;

  const currentTab = useMemo(() => {
    return router.pathname.split('/').pop() as TabEnum;
  }, [router.pathname]);

  const tabList = [
    {
      icon: 'support/user/userLight',
      label: t('account:personal_information'),
      value: TabEnum.info
    },
    ...(feConfigs?.isPlus
      ? [
          {
            icon: 'support/user/usersLight',
            label: t('account:team'),
            value: TabEnum.team
          },
          {
            icon: 'support/usage/usageRecordLight',
            label: t('account:usage_records'),
            value: TabEnum.usage
          }
        ]
      : []),
    ...(feConfigs?.show_pay && userInfo?.team?.permission.hasManagePer
      ? [
          {
            icon: 'support/bill/payRecordLight',
            label: t('account:bills_and_invoices'),
            value: TabEnum.bill
          }
        ]
      : []),
    ...(showThirdPartyTab
      ? [
          {
            icon: 'common/thirdParty',
            label: t('account:third_party'),
            value: TabEnum.thirdParty
          }
        ]
      : []),
    ...(feConfigs.isPlus && feConfigs.customDomain?.enable
      ? [
          {
            icon: 'common/globalLine',
            label: t('account:custom_domain'),
            value: TabEnum.customDomain
          }
        ]
      : []),
    ...(feConfigs.isPlus
      ? [
          {
            icon: 'common/model',
            label: t('common:model.provider_title'),
            value: TabEnum.model
          }
        ]
      : []),
    ...(userInfo?.team?.permission.hasApikeyCreatePer
      ? [
          {
            icon: 'key',
            label: t('account:api_key'),
            value: TabEnum.apikey
          }
        ]
      : []),

    ...(feConfigs.isPlus
      ? [
          {
            icon: 'support/user/informLight',
            label: t('account:notifications'),
            value: TabEnum.inform
          }
        ]
      : []),
    {
      icon: 'support/usage/usageRecordLight',
      label: t('account:language'),
      value: TabEnum.setting
    },
    {
      icon: 'support/account/loginoutLight',
      label: t('account:logout'),
      value: TabEnum.loginout
    }
  ];

  const { openConfirm, ConfirmModal } = useConfirm({
    content: t('account:confirm_logout')
  });

  const setCurrentTab = useCallback(
    (tab: string) => {
      if (tab === TabEnum.loginout) {
        openConfirm({
          onConfirm: () => {
            setUserInfo(null);
            router.replace('/login');
          }
        })();
      } else {
        router.replace('/account/' + tab);
      }
    },
    [openConfirm, router, setUserInfo]
  );

  return (
    <SecondaryNavigationContainer
      isLoading={isLoading}
      tabs={tabList}
      value={currentTab}
      onChange={setCurrentTab}
      mobileScrollPositionKey={'account-mobile-navigation'}
      footer={
        <Flex alignItems={'center'} px={'11px'} pb={5} pt={3}>
          <Box w={'8px'} h={'8px'} borderRadius={'50%'} bg={'#67c13b'} />
          <Box fontSize={'md'} ml={2}>
            V{systemVersion}
          </Box>
        </Flex>
      }
    >
      {children}
      <ConfirmModal />
    </SecondaryNavigationContainer>
  );
};

export default AccountContainer;
