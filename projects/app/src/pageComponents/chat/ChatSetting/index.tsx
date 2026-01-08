import DiagramModal from '@/pageComponents/chat/ChatSetting/DiagramModal';
import { type PropsWithChildren, useCallback, useMemo, useState } from 'react';
import { ChatSettingTabOptionEnum, ChatSidebarPaneEnum } from '@/pageComponents/chat/constants';
import dynamic from 'next/dynamic';
import SettingTabs from '@/pageComponents/chat/ChatSetting/SettingTabs';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { Box, Flex, type FlexProps } from '@chakra-ui/react';
import { useContextSelector } from 'use-context-selector';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { ChatContext } from '@/web/core/chat/context/chatContext';
import NextHead from '@/components/common/NextHead';
import { ChatPageContext } from '@/web/core/chat/context/chatPageContext';
import ChatSliderMobileDrawer from '@/pageComponents/chat/slider/ChatSliderMobileDrawer';
import { useTranslation } from 'react-i18next';
import { useMount } from 'ahooks';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useRouter } from 'next/router';
import { useUserStore } from '@/web/support/user/useUserStore';
import { getWebReqUrl } from '@fastgpt/web/common/system/utils';

const HomepageSetting = dynamic(() => import('@/pageComponents/chat/ChatSetting/HomepageSetting'));
const LogDetails = dynamic(() => import('@/pageComponents/chat/ChatSetting/LogDetails'));
const DataDashboard = dynamic(() => import('@/pageComponents/chat/ChatSetting/DataDashboard'));
const FavouriteAppSetting = dynamic(
  () => import('@/pageComponents/chat/ChatSetting/FavouriteAppSetting')
);

const ChatSetting = () => {
  const router = useRouter();
  const { isPc } = useSystem();
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();
  const { userInfo } = useUserStore();

  const { tab: tabQuery } = router.query as { tab: ChatSettingTabOptionEnum };
  const [isOpenDiagram, setIsOpenDiagram] = useState(false);
  const tab = useMemo(
    () =>
      Object.values(ChatSettingTabOptionEnum).includes(tabQuery)
        ? tabQuery
        : ChatSettingTabOptionEnum.HOME,
    [tabQuery]
  );
  const onOpenSlider = useContextSelector(ChatContext, (v) => v.onOpenSlider);

  const chatSettings = useContextSelector(ChatPageContext, (v) => v.chatSettings);
  const handlePaneChange = useContextSelector(ChatPageContext, (v) => v.handlePaneChange);

  const handleTabChange = useCallback(
    (tab: ChatSettingTabOptionEnum) => {
      handlePaneChange(ChatSidebarPaneEnum.SETTING, undefined, tab);
    },
    [handlePaneChange]
  );

  const SettingHeader = useCallback(
    ({ children }: PropsWithChildren) => (
      <SettingTabs tab={tab} onTabChange={handleTabChange}>
        {children}
      </SettingTabs>
    ),
    [tab, handleTabChange]
  );

  useMount(() => {
    if (!feConfigs?.isPlus || !userInfo?.team.permission.hasManagePer) {
      handlePaneChange(ChatSidebarPaneEnum.TEAM_APPS);
    }
  });

  return (
    <>
      <NextHead title={chatSettings?.homeTabTitle} icon={getWebReqUrl(feConfigs?.favicon)} />

      <Flex flexDir="column" h="100%">
        {!isPc && (
          <>
            <Flex borderBottom="sm" color="myGray.900" py={2} flexShrink="0">
              <MyIcon
                ml={3}
                w="20px"
                color="myGray.900"
                name="core/chat/sidebar/menu"
                onClick={onOpenSlider}
              />
            </Flex>

            <ChatSliderMobileDrawer
              showList={false}
              showMenu={false}
              banner={chatSettings?.wideLogoUrl}
              menuConfirmButtonText={t('common:core.chat.Confirm to clear history')}
            />
          </>
        )}

        {chatSettings && (
          <Box p={['16px 0 16px 0', 6]} flex="1 0 0" h="0" boxSizing="border-box">
            {/* homepage setting */}
            {tab === ChatSettingTabOptionEnum.HOME && (
              <HomepageSetting Header={SettingHeader} onDiagramShow={setIsOpenDiagram} />
            )}

            {/* data dashboard */}
            {tab === ChatSettingTabOptionEnum.DATA_DASHBOARD && (
              <DataDashboard Header={SettingHeader} />
            )}

            {/* log details */}
            {tab === ChatSettingTabOptionEnum.LOG_DETAILS && <LogDetails Header={SettingHeader} />}

            {/* home chat logs */}
            {tab === ChatSettingTabOptionEnum.FAVOURITE_APPS && (
              <FavouriteAppSetting Header={SettingHeader} />
            )}
          </Box>
        )}
      </Flex>

      <DiagramModal show={isOpenDiagram} onShow={setIsOpenDiagram} />
    </>
  );
};

export default ChatSetting;
