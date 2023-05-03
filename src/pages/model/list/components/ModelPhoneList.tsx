import React, { useEffect } from 'react';
import { Box, Button, Flex, Tag } from '@chakra-ui/react';
import type { ModelSchema } from '@/types/mongoSchema';
import { formatModelStatus } from '@/constants/model';
import { useRouter } from 'next/router';
import { ChatModelMap } from '@/constants/model';

const ModelPhoneList = ({
  models,
  handlePreviewChat
}: {
  models: ModelSchema[];
  handlePreviewChat: (_: string) => void;
}) => {
  const router = useRouter();

  useEffect(() => {
    router.prefetch('/chat');
  }, [router]);

  return (
    <Box borderRadius={'md'} overflow={'hidden'} mb={5}>
      {models.map((model) => (
        <Box
          key={model._id}
          _notFirst={{ borderTop: '1px solid rgba(0,0,0,0.1)' }}
          px={6}
          py={3}
          backgroundColor={'white'}
        >
          <Flex alignItems={'flex-start'}>
            <Box flex={'1 0 0'} w={0} fontSize={'lg'} fontWeight={'bold'}>
              {model.name}
            </Box>
            <Tag
              colorScheme={formatModelStatus[model.status].colorTheme}
              variant="solid"
              px={3}
              size={'md'}
            >
              {formatModelStatus[model.status].text}
            </Tag>
          </Flex>
          <Flex mt={5}>
            <Box flex={'0 0 100px'}>对话模型: </Box>
            <Box color={'blackAlpha.500'}>{ChatModelMap[model.chat.chatModel].name}</Box>
          </Flex>
          <Flex mt={5}>
            <Box flex={'0 0 100px'}>模型温度: </Box>
            <Box color={'blackAlpha.500'}>{model.chat.temperature}</Box>
          </Flex>
          <Flex mt={5} justifyContent={'flex-end'}>
            <Button
              mr={3}
              variant={'outline'}
              w={'100px'}
              size={'sm'}
              onClick={() => handlePreviewChat(model._id)}
            >
              体验
            </Button>
            <Button
              size={'sm'}
              w={'100px'}
              onClick={() => router.push(`/model/detail?modelId=${model._id}`)}
            >
              编辑
            </Button>
          </Flex>
        </Box>
      ))}
    </Box>
  );
};

export default ModelPhoneList;
