import React from 'react';
import { Box, Flex, Image, Button } from '@chakra-ui/react';
import type { ShareModelItem } from '@/types/model';
import { useRouter } from 'next/router';
import MyIcon from '@/components/Icon';
import styles from '../index.module.scss';

const ShareModelList = ({
  models = [],
  onclickCollection
}: {
  models: ShareModelItem[];
  onclickCollection: (modelId: string) => void;
}) => {
  const router = useRouter();

  return (
    <>
      {models.map((model) => (
        <Box
          key={model._id}
          p={4}
          border={'1px solid'}
          borderColor={'gray.200'}
          borderRadius={'md'}
        >
          <Flex alignItems={'center'}>
            <Image
              src={model.avatar}
              alt={'avatar'}
              w={['28px', '36px']}
              h={['28px', '36px']}
              objectFit={'cover'}
            />
            <Box fontWeight={'bold'} fontSize={'lg'} ml={5}>
              {model.name}
            </Box>
          </Flex>
          <Box className={styles.intro} my={4} fontSize={'sm'} color={'blackAlpha.600'}>
            {model.share.intro || '这个模型没有介绍~'}
          </Box>
          <Flex justifyContent={'space-between'}>
            <Flex
              alignItems={'center'}
              cursor={'pointer'}
              color={model.isCollection ? 'blue.600' : 'alphaBlack.700'}
              onClick={() => onclickCollection(model._id)}
            >
              <MyIcon
                mr={1}
                name={model.isCollection ? 'collectionSolid' : 'collectionLight'}
                w={'16px'}
              />
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
        </Box>
      ))}
    </>
  );
};

export default ShareModelList;
