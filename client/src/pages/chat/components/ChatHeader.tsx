import React, { useMemo } from 'react';
import { Flex, useTheme, Box } from '@chakra-ui/react';
import { useGlobalStore } from '@/store/global';
import MyIcon from '@/components/Icon';
import Tag from '@/components/Tag';
import Avatar from '@/components/Avatar';
import ToolMenu from './ToolMenu';
import { ChatItemType } from '@/types/chat';

const ChatHeader = ({
  history,
  appName,
  appAvatar,
  onOpenSlider
}: {
  history: ChatItemType[];
  appName: string;
  appAvatar: string;
  onOpenSlider: () => void;
}) => {
  const theme = useTheme();
  const { isPc } = useGlobalStore();
  const title = useMemo(() => {}, []);

  return (
    <Flex
      alignItems={'center'}
      py={[3, 5]}
      px={[3, 5]}
      borderBottom={theme.borders.base}
      borderBottomColor={'gray.200'}
      color={'myGray.900'}
    >
      {isPc ? (
        <>
          <Box mr={3} color={'myGray.1000'}>
            {appName}
          </Box>
          <Tag display={'flex'}>
            <MyIcon name={'history'} w={'14px'} />
            <Box ml={1}>{history.length === 0 ? '新的对话' : `${history.length}条记录`}</Box>
          </Tag>
          <Box flex={1} />
        </>
      ) : (
        <>
          <MyIcon name={'menu'} w={'20px'} h={'20px'} color={'myGray.900'} onClick={onOpenSlider} />
          <Flex px={3} alignItems={'center'} flex={'1 0 0'} w={0} justifyContent={'center'}>
            <Avatar src={appAvatar} w={'16px'} />
            <Box ml={1} className="textEllipsis">
              {appName}
            </Box>
          </Flex>
        </>
      )}
      {/* control */}
      <ToolMenu history={history} />
    </Flex>
  );
};

export default ChatHeader;
