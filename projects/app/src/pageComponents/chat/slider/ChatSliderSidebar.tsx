import React from 'react';
import MyBox from '@fastgpt/web/components/common/MyBox';
import ChatSliderHeader from '@/pageComponents/chat/slider/ChatSliderHeader';
import ChatSliderMenu from '@/pageComponents/chat/slider/ChatSliderMenu';
import ChatSliderList from '@/pageComponents/chat/slider/ChatSliderList';

type Props = {
  title?: string;
  banner?: string;
  menuConfirmButtonText?: string;
  isShareMode?: boolean;
};

const ChatHistorySidebar = ({ title, banner, isShareMode }: Props) => {
  const shareModeStyles = isShareMode
    ? {
        background:
          "url('/imgs/sidebar-texture.png') no-repeat bottom, linear-gradient(180deg, #F2F8FF 0%, #F5F8FC 10%)",
        backgroundSize: '100% 270px, 100% 100%',
        borderColor: 'myGray.200'
      }
    : {
        backgroundColor: 'white',
        borderColor: '#E6F1FF'
      };

  return (
    <MyBox
      display={'flex'}
      flexDirection={'column'}
      w={'100%'}
      h={'100%'}
      {...shareModeStyles}
      borderWidth={'0px 1px 0px 0px'}
      whiteSpace={'nowrap'}
    >
      <ChatSliderHeader title={title} banner={banner} />
      <ChatSliderMenu />
      <ChatSliderList isShareMode={isShareMode} />
    </MyBox>
  );
};

export default ChatHistorySidebar;
