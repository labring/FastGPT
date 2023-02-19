import React from 'react';
import { Box, Button, Flex, Heading, Tag } from '@chakra-ui/react';
import type { ModelType } from '@/types/model';
import { formatModelStatus } from '@/constants/model';
import dayjs from 'dayjs';
import { useRouter } from 'next/router';

const ModelPhoneList = ({
  models,
  handlePreviewChat
}: {
  models: ModelType[];
  handlePreviewChat: (_: string) => void;
}) => {
  const router = useRouter();

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
            <Box flex={'0 0 100px'}>最后更新时间: </Box>
            <Box color={'blackAlpha.500'}>{dayjs(model.updateTime).format('YYYY-MM-DD HH:mm')}</Box>
          </Flex>
          <Flex mt={5}>
            <Box flex={'0 0 100px'}>AI模型: </Box>
            <Box color={'blackAlpha.500'}>{model.service.modelName}</Box>
          </Flex>
          <Flex mt={5}>
            <Box flex={'0 0 100px'}>训练次数: </Box>
            <Box color={'blackAlpha.500'}>{model.trainingTimes}次</Box>
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
