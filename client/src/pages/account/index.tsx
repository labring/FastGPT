import React, { useCallback, useRef } from 'react';
import { Box, Flex, useTheme } from '@chakra-ui/react';
import { useGlobalStore } from '@/store/global';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import { clearToken } from '@/utils/user';
import { useUserStore } from '@/store/user';
import { useConfirm } from '@/hooks/useConfirm';
import PageContainer from '@/components/PageContainer';
import SideTabs from '@/components/SideTabs';
import Tabs from '@/components/Tabs';
import UserInfo from './components/Info';
import { serviceSideProps } from '@/utils/i18n';
import { feConfigs } from '@/store/static';

const BillTable = dynamic(() => import('./components/BillTable'), {
  ssr: false
});
const PayRecordTable = dynamic(() => import('./components/PayRecordTable'), {
  ssr: false
});
const InformTable = dynamic(() => import('./components/InformTable'), {
  ssr: false
});

enum TabEnum {
  'info' = 'info',
  'bill' = 'bill',
  'pay' = 'pay',
  'inform' = 'inform',
  'loginout' = 'loginout'
}

const Account = ({ currentTab }: { currentTab: `${TabEnum}` }) => {
  const tabList = useRef([
    {
      icon: 'meLight',
      label: 'user.Personal Information',
      id: TabEnum.info,
      Component: <BillTable />
    },
    {
      icon: 'billRecordLight',
      label: 'user.Usage Record',
      id: TabEnum.bill,
      Component: <BillTable />
    },
    ...(feConfigs?.show_userDetail
      ? [
          {
            icon: 'payRecordLight',
            label: 'user.Recharge Record',
            id: TabEnum.pay,
            Component: <PayRecordTable />
          }
        ]
      : []),
    {
      icon: 'informLight',
      label: 'user.Notice',
      id: TabEnum.inform,
      Component: <InformTable />
    },
    {
      icon: 'loginoutLight',
      label: 'user.Sign Out',
      id: TabEnum.loginout,
      Component: () => <></>
    }
  ]);

  const { openConfirm, ConfirmModal } = useConfirm({
    content: '确认退出登录？'
  });

  const router = useRouter();
  const theme = useTheme();
  const { isPc } = useGlobalStore();
  const { setUserInfo } = useUserStore();

  const setCurrentTab = useCallback(
    (tab: string) => {
      if (tab === TabEnum.loginout) {
        openConfirm(() => {
          clearToken();
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
              list={tabList.current}
              activeId={currentTab}
              onChange={setCurrentTab}
            />
          </Flex>
        ) : (
          <Box mb={3}>
            <Tabs
              m={'auto'}
              w={'90%'}
              size={isPc ? 'md' : 'sm'}
              list={tabList.current.map((item) => ({
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
          {currentTab === TabEnum.bill && <BillTable />}
          {currentTab === TabEnum.pay && <PayRecordTable />}
          {currentTab === TabEnum.inform && <InformTable />}
        </Box>
      </Flex>
      <ConfirmModal />
    </PageContainer>
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
