import DiagramModal from '@/pageComponents/chat/ChatSetting/DiagramModal';
import { type PropsWithChildren, useCallback, useState } from 'react';
import { ChatSettingTabOptionEnum, ChatSidebarPaneEnum } from '@/pageComponents/chat/constants';
import dynamic from 'next/dynamic';
import SettingTabs from '@/pageComponents/chat/ChatSetting/SettingTabs';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { Box, Flex, type FlexProps } from '@chakra-ui/react';
import { useContextSelector } from 'use-context-selector';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { ChatContext } from '@/web/core/chat/context/chatContext';
import NextHead from '@/components/common/NextHead';
import { ChatSettingContext } from '@/web/core/chat/context/chatSettingContext';
import ChatSliderMobileDrawer from '@/pageComponents/chat/slider/ChatSliderMobileDrawer';
import { useTranslation } from 'react-i18next';
import { useMount } from 'ahooks';
import { useSystemStore } from '@/web/common/system/useSystemStore';

const HomepageSetting = dynamic(() => import('@/pageComponents/chat/ChatSetting/HomepageSetting'));
const LogDetails = dynamic(() => import('@/pageComponents/chat/ChatSetting/LogDetails'));
const DataDashboard = dynamic(() => import('@/pageComponents/chat/ChatSetting/DataDashboard'));
const FavouriteAppSetting = dynamic(
  () => import('@/pageComponents/chat/ChatSetting/FavouriteAppSetting')
);

const ChatSetting = () => {
  const { isPc } = useSystem();
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();

  const [isOpenDiagram, setIsOpenDiagram] = useState(false);
  const [tab, setTab] = useState<`${ChatSettingTabOptionEnum}`>('home');

  const onOpenSlider = useContextSelector(ChatContext, (v) => v.onOpenSlider);

  const chatSettings = useContextSelector(ChatSettingContext, (v) => v.chatSettings);
  const handlePaneChange = useContextSelector(ChatSettingContext, (v) => v.handlePaneChange);

  const SettingHeader = useCallback(
    ({ children }: PropsWithChildren) => (
      <SettingTabs tab={tab} onTabChange={setTab}>
        {children}
      </SettingTabs>
    ),
    [tab, setTab]
  );

  useMount(() => {
    if (!feConfigs?.isPlus) {
      handlePaneChange(ChatSidebarPaneEnum.TEAM_APPS);
    }
  });

  return (
    <>
      <NextHead title={chatSettings?.homeTabTitle || 'FastGPT'} icon="/icon/logo.svg" />

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
