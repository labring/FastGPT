import DiagramModal from '@/components/core/chat/ChatSetting/DiagramModal';
import { useCallback, useState } from 'react';
import { ChatSettingTabOptionEnum } from '@/pageComponents/chat/constants';
import dynamic from 'next/dynamic';
import SettingTabs from '@/components/core/chat/ChatSetting/SettingTabs';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { Box, Drawer, DrawerContent, DrawerOverlay, Flex } from '@chakra-ui/react';
import { ChatSettingContext } from '@/web/core/chat/context/chatSettingContext';
import { useContextSelector } from 'use-context-selector';
import MyIcon from '@fastgpt/web/components/common/Icon';
import ChatHistorySlider from '@/pageComponents/chat/ChatHistorySlider';
import { useTranslation } from 'react-i18next';

const HomepageSetting = dynamic(() => import('@/components/core/chat/ChatSetting/HomepageSetting'));

const ChatSetting = () => {
  const { t } = useTranslation();
  const { isPc } = useSystem();

  const [isOpenDiagram, setIsOpenDiagram] = useState(false);
  const [tab, setTab] = useState<`${ChatSettingTabOptionEnum}`>('home');

  const isOpenAppDrawer = useContextSelector(ChatSettingContext, (v) => v.isOpenAppDrawer);
  const onCloseAppDrawer = useContextSelector(ChatSettingContext, (v) => v.onCloseAppDrawer);
  const onOpenAppDrawer = useContextSelector(ChatSettingContext, (v) => v.onOpenAppDrawer);

  const SettingHeader = useCallback(
    ({ children }: { children?: React.ReactNode }) => (
      <>
        <SettingTabs tab={tab} onChange={setTab}>
          {children}
        </SettingTabs>
      </>
    ),
    [tab, setTab]
  );

  return (
    <>
      {!isPc && (
        <Flex
          h="46px"
          w="100vw"
          left="4"
          position="absolute"
          borderBottom="1px solid"
          borderColor="myGray.100"
          onClick={onOpenAppDrawer}
        >
          <MyIcon
            w="20px"
            color="myGray.900"
            name="core/chat/sidebar/menu"
            onClick={onCloseAppDrawer}
          />

          <Drawer
            size="xs"
            placement="left"
            autoFocus={false}
            isOpen={isOpenAppDrawer}
            onClose={onCloseAppDrawer}
          >
            <DrawerOverlay backgroundColor="rgba(255,255,255,0.5)" />
            <DrawerContent maxWidth="75vw">
              <ChatHistorySlider
                confirmClearText={t('common:core.chat.Confirm to clear history')}
              />
            </DrawerContent>
          </Drawer>
        </Flex>
      )}

      {/* homepage setting */}
      {tab === ChatSettingTabOptionEnum.HOME && (
        <HomepageSetting Header={SettingHeader} onDiagramShow={setIsOpenDiagram} />
      )}

      <DiagramModal show={isOpenDiagram} onShow={setIsOpenDiagram} />
    </>
  );
};

export default ChatSetting;
