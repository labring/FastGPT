import { AppModuleItemType } from '@/types/app';
import { AppSchema } from '@/types/mongoSchema';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Box, useOutsideClick, Flex, IconButton } from '@chakra-ui/react';
import MyIcon from '@/components/Icon';
import { useChat } from '@/hooks/useChat';

const ChatTest = ({
  app,
  modules,
  onClose
}: {
  app: AppSchema;
  modules?: AppModuleItemType[];
  onClose: () => void;
}) => {
  const isOpen = useMemo(() => !!modules, [modules]);

  const { ChatBox, ChatInput, ChatBoxParentRef, setChatHistory } = useChat({
    appId: app._id
  });

  return (
    <Flex
      zIndex={3}
      flexDirection={'column'}
      position={'absolute'}
      top={5}
      right={0}
      h={isOpen ? '95%' : '0'}
      w={isOpen ? '460px' : '0'}
      bg={'white'}
      boxShadow={'3px 0 20px rgba(0,0,0,0.2)'}
      borderRadius={'md'}
      overflow={'hidden'}
      transition={'.2s ease'}
    >
      <Flex py={4} px={5} whiteSpace={'nowrap'}>
        <Box fontSize={'xl'} fontWeight={'bold'} flex={1}>
          调试预览
        </Box>
        <IconButton
          className="chat"
          size={'sm'}
          icon={<MyIcon name={'clearLight'} w={'14px'} />}
          variant={'base'}
          borderRadius={'md'}
          aria-label={'delete'}
          onClick={(e) => {
            e.stopPropagation();
            setChatHistory([]);
          }}
        />
      </Flex>
      <Box ref={ChatBoxParentRef} flex={1} px={5} overflow={'overlay'}>
        <ChatBox appAvatar={app.avatar} />
      </Box>

      <Box px={5}>
        <ChatInput />
      </Box>
    </Flex>
  );
};

export default ChatTest;
