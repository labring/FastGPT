import DiagramModal from '@/components/core/chat/ChatSetting/DiagramModal';
import { useCallback, useState } from 'react';
import { ChatSettingTabOptionEnum } from '@/pageComponents/chat/constants';
import dynamic from 'next/dynamic';
import SettingTabs from '@/components/core/chat/ChatSetting/SettingTabs';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { Drawer, DrawerContent, DrawerOverlay, Flex } from '@chakra-ui/react';
import { useContextSelector } from 'use-context-selector';
import MyIcon from '@fastgpt/web/components/common/Icon';
import ChatHistorySlider from '@/pageComponents/chat/ChatHistorySlider';
import { useTranslation } from 'react-i18next';
import { ChatContext } from '@/web/core/chat/context/chatContext';

const HomepageSetting = dynamic(() => import('@/components/core/chat/ChatSetting/HomepageSetting'));

const ChatSetting = () => {
  const { t } = useTranslation();
  const { isPc } = useSystem();

  const [isOpenDiagram, setIsOpenDiagram] = useState(false);
  const [tab, setTab] = useState<`${ChatSettingTabOptionEnum}`>('home');

  const isOpenSlider = useContextSelector(ChatContext, (v) => v.isOpenSlider);
  const onCloseSlider = useContextSelector(ChatContext, (v) => v.onCloseSlider);
  const onOpenSlider = useContextSelector(ChatContext, (v) => v.onOpenSlider);

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
        <Flex h="46px" w="100vw" position="absolute" borderBottom="sm" color="myGray.900">
          <MyIcon
            ml={3}
            w="20px"
            color="myGray.900"
            name="core/chat/sidebar/menu"
            onClick={onOpenSlider}
          />

          <Drawer
            size="xs"
            placement="left"
            autoFocus={false}
            isOpen={isOpenSlider}
            onClose={onCloseSlider}
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
