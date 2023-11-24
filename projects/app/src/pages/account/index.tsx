import React, { useCallback, useMemo, useRef } from 'react';
import { Box, Flex, useTheme } from '@chakra-ui/react';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import { clearToken } from '@/web/support/user/auth';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useConfirm } from '@/web/common/hooks/useConfirm';
import PageContainer from '@/components/PageContainer';
import SideTabs from '@/components/SideTabs';
import Tabs from '@/components/Tabs';
import UserInfo from './components/Info';
import { serviceSideProps } from '@/web/common/utils/i18n';
import { feConfigs } from '@/web/common/system/staticData';
import { useTranslation } from 'next-i18next';
import Script from 'next/script';

const Promotion = dynamic(() => import('./components/Promotion'));
const BillTable = dynamic(() => import('./components/BillTable'));
const PayRecordTable = dynamic(() => import('./components/PayRecordTable'));
const InformTable = dynamic(() => import('./components/InformTable'));
const ApiKeyTable = dynamic(() => import('./components/ApiKeyTable'));

enum TabEnum {
  'info' = 'info',
  'promotion' = 'promotion',
  'bill' = 'bill',
  'pay' = 'pay',
  'inform' = 'inform',
  'apikey' = 'apikey',
  'loginout' = 'loginout'
}

const Account = ({ currentTab }: { currentTab: `${TabEnum}` }) => {
  const { t } = useTranslation();
  const { userInfo, setUserInfo } = useUserStore();

  const tabList = [
    {
      icon: 'meLight',
      label: t('user.Personal Information'),
      id: TabEnum.info
    },
    ...(feConfigs?.isPlus
      ? [
          {
            icon: 'billRecordLight',
            label: t('user.Usage Record'),
            id: TabEnum.bill
          }
        ]
      : []),
    ...(feConfigs?.show_promotion
      ? [
          {
            icon: 'support/account/promotionLight',
            label: t('user.Promotion Record'),
            id: TabEnum.promotion
          }
        ]
      : []),
    ...(feConfigs?.show_pay && userInfo?.team.canWrite
      ? [
          {
            icon: 'support/pay/payRecordLight',
            label: t('user.Recharge Record'),
            id: TabEnum.pay
          }
        ]
      : []),
    ...(userInfo?.team.canWrite
      ? [
          {
            icon: 'apikey',
            label: t('user.apikey.key'),
            id: TabEnum.apikey
          }
        ]
      : []),
    ...(feConfigs.isPlus
      ? [
          {
            icon: 'informLight',
            label: t('user.Notice'),
            id: TabEnum.inform
          }
        ]
      : []),

    {
      icon: 'support/account/loginoutLight',
      label: t('user.Sign Out'),
      id: TabEnum.loginout
    }
  ];

  const { openConfirm, ConfirmModal } = useConfirm({
    content: '确认退出登录？'
  });

  const router = useRouter();
  const theme = useTheme();
  const { isPc } = useSystemStore();

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
      <Script src="/js/qrcode.min.js" strategy="lazyOnload"></Script>
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
              <SideTabs
                flex={1}
                mx={'auto'}
                mt={2}
                w={'100%'}
                list={tabList}
                activeId={currentTab}
                onChange={setCurrentTab}
              />
            </Flex>
          ) : (
            <Box mb={3}>
              <Tabs
                m={'auto'}
                size={isPc ? 'md' : 'sm'}
                list={tabList.map((item) => ({
                  id: item.id,
                  label: item.label
                }))}
                activeId={currentTab}
                onChange={setCurrentTab}
              />
            </Box>
          )}

          <Box flex={'1 0 0'} h={'100%'} pb={[4, 0]}>
            {currentTab === TabEnum.info && <UserInfo />}
            {currentTab === TabEnum.promotion && <Promotion />}
            {currentTab === TabEnum.bill && <BillTable />}
            {currentTab === TabEnum.pay && <PayRecordTable />}
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
      ...(await serviceSideProps(content))
    }
  };
}

export default Account;
