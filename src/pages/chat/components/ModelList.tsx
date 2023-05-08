import React from 'react';
import { Box, Flex, Image } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { ModelListItemType } from '@/types/model';

const ModelList = ({ models, modelId }: { models: ModelListItemType[]; modelId: string }) => {
  const router = useRouter();

  return (
    <>
      {models.map((item) => (
        <Box key={item._id}>
          <Flex
            key={item._id}
            position={'relative'}
            alignItems={['flex-start', 'center']}
            p={3}
            cursor={'pointer'}
            transition={'background-color .2s ease-in'}
            borderLeft={['', '5px solid transparent']}
            zIndex={0}
            _hover={{
              backgroundColor: ['', '#dee0e3']
            }}
            {...(modelId === item._id
              ? {
                  backgroundColor: '#eff0f1',
                  borderLeftColor: 'myBlue.600'
                }
              : {})}
            onClick={() => {
              if (item._id === modelId) return;
              router.replace(`/chat?modelId=${item._id}`);
            }}
          >
            <Image
              src={item.avatar || '/icon/logo.png'}
              alt=""
              w={'34px'}
              maxH={'50px'}
              objectFit={'contain'}
            />
            <Box flex={'1 0 0'} w={0} ml={3}>
              <Box className="textEllipsis" color={'myGray.1000'}>
                {item.name}
              </Box>
              <Box className="textEllipsis" color={'myGray.400'} fontSize={'sm'}>
                {item.systemPrompt || '这个AI助手没有设置提示词~'}
              </Box>
            </Box>
          </Flex>
        </Box>
      ))}
    </>
  );
};

export default ModelList;
