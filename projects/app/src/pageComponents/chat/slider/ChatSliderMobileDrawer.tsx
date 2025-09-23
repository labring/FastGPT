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

type Props = {
  title?: string;
  banner?: string;
  menuConfirmButtonText?: string;
  showHeader?: boolean;
  showFooter?: boolean;
  showList?: boolean;
  showMenu?: boolean;
};

const ChatSliderMobileDrawer = ({
  title,
  banner,
  menuConfirmButtonText,
  showHeader = true,
  showFooter = true,
  showList = true,
  showMenu = true
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
      <DrawerOverlay backgroundColor="rgba(255,255,255,0.5)" />

      <DrawerContent maxWidth="75vw">
        <MyBox
          display={'flex'}
          flexDirection={'column'}
          w={'100%'}
          h={'100%'}
          bg={'white'}
          borderRight={['', theme.borders.base]}
          whiteSpace={'nowrap'}
        >
          {showHeader && <ChatSliderHeader title={title} banner={banner} />}

          {showMenu && <MyDivider h="0.5px" bg="myGray.100" my={2} mx={2} w="calc(100% - 16px)" />}
          {showMenu && <ChatSliderMenu menuConfirmButtonText={menuConfirmButtonText} />}

          {showList && <ChatSliderList />}

          {showFooter && <ChatSliderFooter />}
        </MyBox>
      </DrawerContent>
    </Drawer>
  );
};

export default ChatSliderMobileDrawer;
