import DiagramModal from '@/pageComponents/chat/ChatSetting/DiagramModal';
import { type PropsWithChildren, useCallback, useState } from 'react';
import { ChatSettingTabOptionEnum } from '@/pageComponents/chat/constants';
import dynamic from 'next/dynamic';
import SettingTabs from '@/pageComponents/chat/ChatSetting/SettingTabs';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { Flex } from '@chakra-ui/react';
import { useContextSelector } from 'use-context-selector';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { ChatContext } from '@/web/core/chat/context/chatContext';
import NextHead from '@/components/common/NextHead';
import { ChatSettingContext } from '@/web/core/chat/context/chatSettingContext';
import ChatSliderMobileDrawer from '@/pageComponents/chat/slider/ChatSliderMobileDrawer';
import { useTranslation } from 'react-i18next';

const HomepageSetting = dynamic(() => import('@/pageComponents/chat/ChatSetting/HomepageSetting'));
const LogDetails = dynamic(() => import('@/pageComponents/chat/ChatSetting/LogDetails'));
const DataDashboard = dynamic(() => import('@/pageComponents/chat/ChatSetting/DataDashboard'));

const ChatSetting = () => {
  const { t } = useTranslation();
  const { isPc } = useSystem();

  const [isOpenDiagram, setIsOpenDiagram] = useState(false);
  const [tab, setTab] = useState<`${ChatSettingTabOptionEnum}`>('home');

  const onOpenSlider = useContextSelector(ChatContext, (v) => v.onOpenSlider);

  const chatSettings = useContextSelector(ChatSettingContext, (v) => v.chatSettings);

  const SettingHeader = useCallback(
    ({ children }: PropsWithChildren) => (
      <SettingTabs tab={tab} onChange={setTab}>
        {children}
      </SettingTabs>
    ),
    [tab, setTab]
  );

  return (
    <>
      <NextHead title={chatSettings?.homeTabTitle || 'FastGPT'} icon="/icon/logo.svg" />

      {!isPc && (
        <>
          <Flex h="46px" w="100vw" position="absolute" borderBottom="sm" color="myGray.900">
            <MyIcon
              ml={3}
              w="20px"
              color="myGray.900"
              name="core/chat/sidebar/menu"
              onClick={onOpenSlider}
            />
          </Flex>

          <ChatSliderMobileDrawer
            showHeader
            showFooter
            banner={chatSettings?.wideLogoUrl}
            menuConfirmButtonText={t('common:core.chat.Confirm to clear history')}
          />
        </>
      )}

      {/* homepage setting */}
      {tab === ChatSettingTabOptionEnum.HOME && (
        <HomepageSetting Header={SettingHeader} onDiagramShow={setIsOpenDiagram} />
      )}

      {/* data dashboard */}
      {tab === ChatSettingTabOptionEnum.DATA_DASHBOARD && <DataDashboard Header={SettingHeader} />}

      {/* log details */}
      {tab === ChatSettingTabOptionEnum.LOG_DETAILS && <LogDetails Header={SettingHeader} />}

      <DiagramModal show={isOpenDiagram} onShow={setIsOpenDiagram} />
    </>
  );
};

export default ChatSetting;
