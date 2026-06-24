import React, { useCallback, useMemo, useState } from 'react';
import { Box, Flex, type BoxProps } from '@chakra-ui/react';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useRouter } from 'next/router';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import PageContainer from '@/components/PageContainer';
import LightRowTabs from '@fastgpt/web/components/common/Tabs/LightRowTabs';
import { useTranslation } from 'next-i18next';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import {
  DashboardNavbar,
  SIDEBAR_EXPANDED_WIDTH,
  SIDEBAR_COLLAPSED_WIDTH
} from '@/pageComponents/dashboard/Container';
import BgDecoration from '@/pageComponents/dashboard/BgDecoration';

export enum TabEnum {
  'info' = 'info',
  'promotion' = 'promotion',
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
  isLoading,
  header,
  wrapperContainerProps,
  containerInsertProps
}: {
  children: React.ReactNode;
  isLoading?: boolean;
  header?: React.ReactNode;
  wrapperContainerProps?: BoxProps;
  containerInsertProps?: BoxProps;
}) => {
  const { t } = useTranslation();
  const { userInfo, setUserInfo } = useUserStore();
  const { feConfigs } = useSystemStore();
  const router = useRouter();
  const { isPc } = useSystem();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const sidebarWidth = isCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH;

  const currentTab = useMemo(() => {
    return router.pathname.split('/').pop() as TabEnum;
  }, [router.pathname]);

  const tabList = useMemo(
    () => [
      ...(feConfigs?.isPlus
        ? [
            {
              icon: 'support/usage/usageRecordLight',
              label: t('common:usage_records'),
              value: TabEnum.usage
            }
          ]
        : []),
      {
        icon: 'support/user/userLight',
        label: t('common:personal_information'),
        value: TabEnum.info
      },
      ...(feConfigs?.isPlus
        ? [
            {
              icon: 'support/user/usersLight',
              label: t('common:team'),
              value: TabEnum.team
            }
          ]
        : []),
      ...(feConfigs?.show_pay && userInfo?.team?.permission.hasManagePer
        ? [
            {
              icon: 'support/bill/payRecordLight',
              label: t('common:bills_and_invoices'),
              value: TabEnum.bill
            }
          ]
        : []),
      {
        icon: 'common/thirdParty',
        label: t('common:third_party'),
        value: TabEnum.thirdParty
      },
      ...(feConfigs.isPlus && feConfigs.customDomain?.enable
        ? [
            {
              icon: 'common/globalLine',
              label: t('common:custom_domain'),
              value: TabEnum.customDomain
            }
          ]
        : []),
      {
        icon: 'common/model',
        label: t('common:model_provider'),
        value: TabEnum.model
      },
      ...(feConfigs?.show_promotion && userInfo?.team?.permission.isOwner
        ? [
            {
              icon: 'support/account/promotionLight',
              label: t('common:promotion_records'),
              value: TabEnum.promotion
            }
          ]
        : []),
      ...(userInfo?.team?.permission.hasApikeyCreatePer
        ? [
            {
              icon: 'key',
              label: t('common:api_key'),
              value: TabEnum.apikey
            }
          ]
        : []),

      ...(feConfigs.isPlus
        ? [
            {
              icon: 'support/user/informLight',
              label: t('common:notifications'),
              value: TabEnum.inform
            }
          ]
        : []),
      {
        icon: 'support/usage/usageRecordLight',
        label: t('common:language'),
        value: TabEnum.setting
      },
      {
        icon: 'support/account/loginoutLight',
        label: t('common:logout'),
        value: TabEnum.loginout
      }
    ],
    [t, feConfigs, userInfo]
  );

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
    <>
      {isPc && <DashboardNavbar isCollapsed={isCollapsed} setIsCollapsed={setIsCollapsed} />}
      <Flex
        h={'100%'}
        pl={isPc ? sidebarWidth : 0}
        position={'relative'}
        transition="padding-left 0.2s ease"
        direction={'column'}
      >
        <BgDecoration />
        {header && (
          <Box px={4} h={'64px'} flexShrink={0} display={'flex'} alignItems={'center'}>
            {header}
          </Box>
        )}
        <Box flex={'1 0 0'} overflow={'hidden'} position={'relative'}>
          <PageContainer
            isLoading={isLoading}
            {...(wrapperContainerProps ? wrapperContainerProps : {})}
            insertProps={{
              p: 0,
              background: 'white',
              position: 'relative',
              ml: 4,
              ...containerInsertProps
            }}
          >
            <Flex flexDirection={'column'} h={'100%'} pt={[4, 0]}>
              {!isPc && (
                <Box mb={3}>
                  <LightRowTabs<TabEnum>
                    m={'auto'}
                    w={'100%'}
                    size={'sm'}
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
        </Box>
      </Flex>
    </>
  );
};

export default AccountContainer;
