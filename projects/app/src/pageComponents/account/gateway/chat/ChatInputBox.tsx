import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Box, Flex, Textarea, Button, IconButton, useBreakpointValue } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { getWebDefaultLLMModel } from '@/web/common/system/utils';

const ChatInputBox = () => {
  const [inputValue, setInputValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const buttonSize = useBreakpointValue({ base: 'sm', md: 'md' });
  const isSendDisabled = inputValue.trim() === '';

  const { llmModelList } = useSystemStore();

  const modelList = useMemo(
    () =>
      llmModelList.map((item) => ({
        label: item.name,
        value: item.model
      })),
    [llmModelList]
  );

  const defaultModel = useMemo(() => {
    return getWebDefaultLLMModel(llmModelList).model;
  }, [llmModelList]);

  const [selectedModel, setSelectedModel] = useState(defaultModel);

  useEffect(() => {
    if (!llmModelList.find((item) => item.model === selectedModel) && defaultModel) {
      setSelectedModel(defaultModel);
    }
  }, [defaultModel, selectedModel, llmModelList]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 300)}px`; // 设置最大高度为300px
    }
  }, [inputValue]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
  };

  const handleSend = () => {
    if (inputValue.trim()) {
      console.log('Sending message:', inputValue);
      // 这里添加发送消息的逻辑
      setInputValue('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // 按下Ctrl+Enter或Command+Enter发送消息
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Box
      w="full"
      maxW="700px"
      minH="132px"
      bg="white"
      border="0.5px solid rgba(0, 0, 0, 0.13)"
      boxShadow="0px 5px 16px -4px rgba(19, 51, 107, 0.08)"
      borderRadius="20px"
      position="relative"
      p={4}
      pb="56px"
    >
      <Textarea
        ref={textareaRef}
        value={inputValue}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        placeholder="你可以问我任何问题"
        variant="unstyled"
        resize="none"
        minH="60px"
        maxH="300px"
        fontFamily="PingFang SC, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
        fontSize="15px"
        lineHeight="1.6"
        letterSpacing="0.5px"
        overflowY="auto"
        css={{
          '&::-webkit-scrollbar': {
            width: '4px'
          },
          '&::-webkit-scrollbar-track': {
            width: '6px',
            background: 'transparent'
          },
          '&::-webkit-scrollbar-thumb': {
            background: '#E2E8F0',
            borderRadius: '24px'
          }
        }}
        _placeholder={{
          color: '#A4A4A4',
          fontSize: '15px'
        }}
      />

      {/* Bottom Toolbar */}
      <Flex position="absolute" left="3" bottom="3" gap={2} align="center">
        <MySelect
          value={selectedModel}
          list={modelList}
          onChange={setSelectedModel}
          width="128px"
          bg="#F9F9F9"
          border="0.5px solid #E0E0E0"
          borderRadius="10px"
          color="#485264"
          h="36px"
          fontSize="14px"
        />

        <Button
          size={buttonSize}
          leftIcon={<MyIcon name={'common/toolkit'} w={'18px'} h={'18px'} />}
          bg="#F0F4FF"
          color="#3370FF"
          border="0.5px solid #C5D7FF"
          borderRadius="full"
          minW="95px"
          h="36px"
          px={2}
          py={1}
          fontWeight="medium"
          fontSize="14px"
          lineHeight="20px"
          letterSpacing="0.1px"
          gap="4px"
          transition="all 0.2s ease-in-out"
          _hover={{
            bg: '#E0E8FF',
            transform: 'scale(1.05)'
          }}
        >
          工具选择
        </Button>
      </Flex>

      <Flex position="absolute" right="4" bottom="3" align="center" gap={2}>
        <IconButton
          aria-label="Upload file"
          icon={<MyIcon name={'support/gate/chat/fileGray'} w={'20px'} />}
          size={buttonSize}
          variant="ghost"
          borderRadius="6px"
          w="36px"
          h="36px"
        />
        <IconButton
          aria-label="Upload image"
          icon={<MyIcon name={'support/gate/chat/imageGray'} w={'20px'} />}
          size={buttonSize}
          variant="ghost"
          borderRadius="6px"
          w="36px"
          h="36px"
        />
        <IconButton
          aria-label="Voice input"
          icon={<MyIcon name={'support/gate/chat/voiceGray'} w={'20px'} />}
          size={buttonSize}
          variant="ghost"
          borderRadius="6px"
          w="36px"
          h="36px"
        />

        <Box w="2px" h="16px" bg="#F0F1F6" mx={2} />
        <IconButton
          aria-label="Send"
          icon={
            <MyIcon
              name={'core/chat/sendFill'}
              width={['18px', '20px']}
              height={['18px', '20px']}
              color={'white'}
            />
          }
          size={buttonSize}
          bg={isSendDisabled ? 'rgba(17, 24, 36, 0.1)' : '#3370FF'}
          _hover={{
            bg: isSendDisabled ? 'rgba(17, 24, 36, 0.1)' : '#2860E1'
          }}
          borderRadius="12px"
          w="36px"
          h="36px"
          onClick={handleSend}
          isDisabled={isSendDisabled}
          cursor={isSendDisabled ? 'not-allowed' : 'pointer'}
        />
      </Flex>
    </Box>
  );
};

export default ChatInputBox;
