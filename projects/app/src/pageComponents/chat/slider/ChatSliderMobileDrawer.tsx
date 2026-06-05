import { Drawer, DrawerOverlay, DrawerContent, useTheme } from '@chakra-ui/react';
import React from 'react';
import MyBox from '@fastgpt/web/components/common/MyBox';
import ChatSliderHeader from '@/pageComponents/chat/slider/ChatSliderHeader';
import ChatSliderMenu from '@/pageComponents/chat/slider/ChatSliderMenu';
import ChatSliderList from '@/pageComponents/chat/slider/ChatSliderList';
import { useContextSelector } from 'use-context-selector';
import { ChatContext } from '@/web/core/chat/context/chatContext';
import ChatSliderFooter from '@/pageComponents/chat/slider/ChatSliderFooter';
import MyDivider from '@fastgpt/web/components/common/MyDivider';
import ChatSliderMobileNewChatButton from '@/pageComponents/chat/slider/ChatSliderMobileNewChatButton';

type Props = {
  title?: string;
  banner?: string;
  menuConfirmButtonText?: string;
  showHeader?: boolean;
  showFooter?: boolean;
  showList?: boolean;
  showMenu?: boolean;
  footerSlot?: React.ReactNode;
};

const ChatSliderMobileDrawer = ({
  title,
  banner,
  menuConfirmButtonText,
  showHeader = true,
  showFooter = true,
  showList = true,
  showMenu = true,
  footerSlot
}: Props) => {
  const theme = useTheme();

  const isOpenSlider = useContextSelector(ChatContext, (v) => v.isOpenSlider);
  const onCloseSlider = useContextSelector(ChatContext, (v) => v.onCloseSlider);

  return (
    <Drawer
      size="xs"
      placement="left"
      autoFocus={false}
      isOpen={isOpenSlider}
      onClose={onCloseSlider}
    >
      <DrawerOverlay backgroundColor="rgba(0, 0, 0, 0.16)" />

      <DrawerContent maxWidth="75vw">
        <MyBox
          display={'flex'}
          flexDirection={'column'}
          position="relative"
          w={'100%'}
          h={'100%'}
          px={'16px'}
          py={'12px'}
          bg={'white'}
          borderRight={['', theme.borders.base]}
          borderRightColor={['', 'myGray.200']}
          whiteSpace={'nowrap'}
        >
          {showHeader && <ChatSliderHeader title={title} banner={banner} />}

          {showMenu && (
            <MyDivider h="0.5px" bg="myGray.100" my="16px" mx={2} w="calc(100% - 16px)" />
          )}
          {showMenu && <ChatSliderMenu menuConfirmButtonText={menuConfirmButtonText} />}

          {showList && <ChatSliderList />}

          {footerSlot}

          {showList && <ChatSliderMobileNewChatButton />}

          {showFooter && <ChatSliderFooter />}
        </MyBox>
      </DrawerContent>
    </Drawer>
  );
};

export default ChatSliderMobileDrawer;
