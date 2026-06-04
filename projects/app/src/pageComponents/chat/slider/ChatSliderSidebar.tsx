import { useTheme } from '@chakra-ui/react';
import React from 'react';
import MyBox from '@fastgpt/web/components/common/MyBox';
import ChatSliderHeader from '@/pageComponents/chat/slider/ChatSliderHeader';
import ChatSliderMenu from '@/pageComponents/chat/slider/ChatSliderMenu';
import ChatSliderList from '@/pageComponents/chat/slider/ChatSliderList';

type Props = {
  title?: string;
  banner?: string;
  menuConfirmButtonText?: string;
  footerSlot?: React.ReactNode;
};

export const CHAT_HISTORY_SLIDER_PC_WIDTH = '256px';

const ChatHistorySidebar = ({ title, banner, menuConfirmButtonText, footerSlot }: Props) => {
  const theme = useTheme();

  return (
    <MyBox
      display={'flex'}
      flexDirection={'column'}
      w={'100%'}
      h={'100%'}
      px={4}
      bg={'white'}
      borderRight={['', theme.borders.base]}
      borderRightColor={['', 'myGray.200']}
      whiteSpace={'nowrap'}
    >
      <ChatSliderHeader title={title} banner={banner} />
      <ChatSliderMenu menuConfirmButtonText={menuConfirmButtonText} />
      <ChatSliderList />
      {footerSlot}
    </MyBox>
  );
};

export default ChatHistorySidebar;
