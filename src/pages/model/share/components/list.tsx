import React, { Dispatch, useCallback } from 'react';
import { Card, Box, Flex, Image, Button } from '@chakra-ui/react';
import type { ShareModelItem } from '@/types/model';
import { useRouter } from 'next/router';
import MyIcon from '@/components/Icon';
import styles from '../index.module.scss';

const ShareModelList = ({ models }: { models: ShareModelItem[] }) => {
  const router = useRouter();

  return (
    <>
      {models.map((model) => (
        <Card key={model._id} p={4}>
          <Flex alignItems={'center'}>
            <Image
              src={model.avatar}
              alt={'avatar'}
              width={'36px'}
              height={'36px'}
              objectFit={'contain'}
            />
            <Box fontWeight={'bold'} fontSize={'lg'} ml={5}>
              {model.name}
            </Box>
          </Flex>
          <Box className={styles.intro} my={4} fontSize={'sm'}>
            {model.share.intro || '这个模型没有介绍~'}
          </Box>
          <Flex justifyContent={'space-between'}>
            <Flex alignItems={'center'} cursor={'pointer'}>
              <MyIcon mr={1} name={'collectionLight'} w={'16px'} />
              {model.share.collection}
            </Flex>
            <Box>
              <Button
                size={'sm'}
                variant={'outline'}
                w={'80px'}
                onClick={() => router.push(`/chat?modelId=${model._id}`)}
              >
                体验
              </Button>
              {model.share.isShareDetail && (
                <Button
                  ml={4}
                  size={'sm'}
                  w={'80px'}
                  onClick={() => router.push(`/model/detail?modelId=${model._id}`)}
                >
                  详情
                </Button>
              )}
            </Box>
          </Flex>
        </Card>
      ))}
    </>
  );
};

export default ShareModelList;
