import React, { useCallback, useMemo } from 'react';
import { Box, Flex, useTheme } from '@chakra-ui/react';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useRouter } from 'next/router';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import PageContainer from '@/components/PageContainer';
import SideTabs from '@/components/SideTabs';
import LightRowTabs from '@fastgpt/web/components/common/Tabs/LightRowTabs';
import { useTranslation } from 'next-i18next';
import Script from 'next/script';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { getWebReqUrl } from '@fastgpt/web/common/system/utils';

export enum TabEnum {
  'info' = 'info',
  'promotion' = 'promotion',
  'usage' = 'usage',
  'bill' = 'bill',
  'inform' = 'inform',
  'individuation' = 'individuation',
  'apikey' = 'apikey',
  'loginout' = 'loginout',
  'team' = 'team'
}

const AccountContainer = ({
  children,
  isLoading
}: {
  children: React.ReactNode;
  isLoading?: boolean;
}) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const { userInfo, setUserInfo } = useUserStore();
  const { feConfigs, systemVersion } = useSystemStore();
  const router = useRouter();
  const { isPc } = useSystem();

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
    ...(feConfigs?.show_promotion && userInfo?.team?.permission.isOwner
      ? [
          {
            icon: 'support/account/promotionLight',
            label: t('account:promotion_records'),
            value: TabEnum.promotion
          }
        ]
      : []),
    ...(userInfo?.team?.permission.hasManagePer
      ? [
          {
            icon: 'support/outlink/apikeyLight',
            label: t('account:api_key'),
            value: TabEnum.apikey
          }
        ]
      : []),
    {
      icon: 'support/user/individuation',
      label: t('account:personalization'),
      value: TabEnum.individuation
    },
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
        openConfirm(() => {
          setUserInfo(null);
          router.replace('/login');
        })();
      } else {
        router.replace('/account/' + tab);
      }
    },
    [openConfirm, router, setUserInfo]
  );

  return (
    <>
      <Script src={getWebReqUrl('/js/qrcode.min.js')} strategy="lazyOnload"></Script>
      <PageContainer isLoading={isLoading}>
        <Flex flexDirection={['column', 'row']} h={'100%'} pt={[4, 0]}>
          {isPc ? (
            <Flex
              flexDirection={'column'}
              p={4}
              h={'100%'}
              flex={'0 0 200px'}
              borderRight={theme.borders.base}
            >
              <SideTabs<TabEnum>
                flex={1}
                mx={'auto'}
                mt={2}
                w={'100%'}
                list={tabList}
                value={currentTab}
                onChange={setCurrentTab}
              />
              <Flex alignItems={'center'}>
                <Box w={'8px'} h={'8px'} borderRadius={'50%'} bg={'#67c13b'} />
                <Box fontSize={'md'} ml={2}>
                  V{systemVersion}
                </Box>
              </Flex>
            </Flex>
          ) : (
            <Box mb={3}>
              <LightRowTabs<TabEnum>
                m={'auto'}
                size={isPc ? 'md' : 'sm'}
                list={tabList.map((item) => ({
                  value: item.value,
                  label: item.label
                }))}
                value={currentTab}
                onChange={setCurrentTab}
              />
            </Box>
          )}

          <Box flex={'1 0 0'} h={'100%'} pb={[4, 0]} overflow={'auto'}>
            {children}
          </Box>
        </Flex>
        <ConfirmModal />
      </PageContainer>
    </>
  );
};

export default AccountContainer;
