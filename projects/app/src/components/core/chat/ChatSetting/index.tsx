import { Box, Flex } from '@chakra-ui/react';
import SettingHeader from './SettingHeader';
import CopyrightSetting from '@/components/core/chat/ChatSetting/CopyrightSetting';
import {
  ChatSettingTabOptionEnum,
  useChatSettingContext
} from '@/web/core/chat/context/chatSettingContext';
import HomepageSetting from '@/components/core/chat/ChatSetting/HomepageSetting';
import DiagramModal from '@/components/core/chat/ChatSetting/DiagramModal';

const ChatSetting = () => {
  const { settingTabOption } = useChatSettingContext();

  return (
    <>
      <Flex flexDir="column" px={6} py={5} gap={'52px'} h="full">
        <Box flexShrink={0}>
          <SettingHeader />
        </Box>

        <Flex
          flexGrow={1}
          overflowY={'auto'}
          justifyContent={'flex-start'}
          alignItems={'center'}
          flexDir="column"
          w="630px"
          alignSelf="center"
        >
          {settingTabOption === ChatSettingTabOptionEnum.HOME && <HomepageSetting />}
          {settingTabOption === ChatSettingTabOptionEnum.COPYRIGHT && <CopyrightSetting />}
        </Flex>
      </Flex>
      <DiagramModal />
    </>
  );
};

export default ChatSetting;
