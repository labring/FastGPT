import React, { useCallback } from 'react';
import { Box, Flex, useTheme } from '@chakra-ui/react';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import PageContainer from '@/components/PageContainer';
import SideTabs from '@/components/SideTabs';
import LightRowTabs from '@fastgpt/web/components/common/Tabs/LightRowTabs';
import UserInfo from './components/Info/index';
import { serviceSideProps } from '@/web/common/utils/i18n';
import { useTranslation } from 'next-i18next';
import Script from 'next/script';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { getWebReqUrl } from '@fastgpt/web/common/system/utils';

const Promotion = dynamic(() => import('./components/Promotion'));
const UsageTable = dynamic(() => import('./components/UsageTable'));
const BillAndInvoice = dynamic(() => import('./components/bill/BillAndInvoice'));
const InformTable = dynamic(() => import('./components/InformTable'));
const ApiKeyTable = dynamic(() => import('./components/ApiKeyTable'));
const Individuation = dynamic(() => import('./components/Individuation'));
enum TabEnum {
  'info' = 'info',
  'promotion' = 'promotion',
  'usage' = 'usage',
  'bill' = 'bill',
  'inform' = 'inform',
  'individuation' = 'individuation',
  'apikey' = 'apikey',
  'loginout' = 'loginout'
}

const Account = ({ currentTab }: { currentTab: TabEnum }) => {
  const { t } = useTranslation();
  const { userInfo, setUserInfo } = useUserStore();
  const { feConfigs, systemVersion } = useSystemStore();
  const { isPc } = useSystem();

  const tabList = [
    {
      icon: 'support/user/userLight',
      label: t('user:personal_information'),
      value: TabEnum.info
    },
    ...(feConfigs?.isPlus
      ? [
          {
            icon: 'support/usage/usageRecordLight',
            label: t('user:usage_record'),
            value: TabEnum.usage
          }
        ]
      : []),
    ...(feConfigs?.show_pay && userInfo?.team?.permission.hasManagePer
      ? [
          {
            icon: 'support/bill/payRecordLight',
            label: t('user:bill_and_invoices'),
            value: TabEnum.bill
          }
        ]
      : []),
    ...(feConfigs?.show_promotion && userInfo?.team?.permission.isOwner
      ? [
          {
            icon: 'support/account/promotionLight',
            label: t('user:promotion_records'),
            value: TabEnum.promotion
          }
        ]
      : []),
    ...(userInfo?.team?.permission.hasManagePer
      ? [
          {
            icon: 'support/outlink/apikeyLight',
            label: t('common:user.apikey.key'),
            value: TabEnum.apikey
          }
        ]
      : []),
    {
      icon: 'support/user/individuation',
      label: t('user:personalization'),
      value: TabEnum.individuation
    },
    ...(feConfigs.isPlus
      ? [
          {
            icon: 'support/user/informLight',
            label: t('user:notice'),
            value: TabEnum.inform
          }
        ]
      : []),

    {
      icon: 'support/account/loginoutLight',
      label: t('user:sign_out'),
      value: TabEnum.loginout
    }
  ];

  const { openConfirm, ConfirmModal } = useConfirm({
    content: t('common:support.user.logout.confirm')
  });

  const router = useRouter();
  const theme = useTheme();

  const setCurrentTab = useCallback(
    (tab: string) => {
      if (tab === TabEnum.loginout) {
        openConfirm(() => {
          setUserInfo(null);
          router.replace('/login');
        })();
      } else {
        router.replace({
          query: {
            currentTab: tab
          }
        });
      }
    },
    [openConfirm, router, setUserInfo]
  );

  return (
    <>
      <Script src={getWebReqUrl('/js/qrcode.min.js')} strategy="lazyOnload"></Script>
      <PageContainer>
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
            {currentTab === TabEnum.info && <UserInfo />}
            {currentTab === TabEnum.promotion && <Promotion />}
            {currentTab === TabEnum.usage && <UsageTable />}
            {currentTab === TabEnum.bill && <BillAndInvoice />}
            {currentTab === TabEnum.individuation && <Individuation />}
            {currentTab === TabEnum.inform && <InformTable />}
            {currentTab === TabEnum.apikey && <ApiKeyTable />}
          </Box>
        </Flex>
        <ConfirmModal />
      </PageContainer>
    </>
  );
};

export async function getServerSideProps(content: any) {
  return {
    props: {
      currentTab: content?.query?.currentTab || TabEnum.info,
      ...(await serviceSideProps(content, ['publish', 'user']))
    }
  };
}

export default Account;
