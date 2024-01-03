import React from 'react';
import { Box, Flex, Button, Card } from '@chakra-ui/react';
import type { ShareAppItem } from '@/types/app';
import { useRouter } from 'next/router';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Avatar from '@/components/Avatar';
import MyTooltip from '@/components/MyTooltip';

const ShareModelList = ({
  models = [],
  onclickCollection
}: {
  models: ShareAppItem[];
  onclickCollection: (appId: string) => void;
}) => {
  const router = useRouter();

  return (
    <>
      {models.map((model) => (
        <Card
          key={model._id}
          display={'flex'}
          w={'100%'}
          flexDirection={'column'}
          p={4}
          borderRadius={'md'}
          border={'1px solid '}
          userSelect={'none'}
          boxShadow={'none'}
          borderColor={'myGray.200'}
          _hover={{
            boxShadow: 'lg'
          }}
        >
          <Flex alignItems={'center'}>
            <Avatar
              src={model.avatar}
              w={['28px', '36px']}
              h={['28px', '36px']}
              borderRadius={'50%'}
            />
            <Box fontWeight={'bold'} fontSize={'lg'} ml={5}>
              {model.name}
            </Box>
          </Flex>
          <MyTooltip label={model.intro}>
            <Box
              className={'textEllipsis3'}
              flex={1}
              my={4}
              fontSize={'sm'}
              wordBreak={'break-all'}
              color={'blackAlpha.600'}
            >
              {model.intro || '这个应用还没有介绍~'}
            </Box>
          </MyTooltip>

          <Flex justifyContent={'space-between'}>
            <Flex
              alignItems={'center'}
              cursor={'pointer'}
              color={model.isCollection ? 'primary.600' : 'blackAlpha.700'}
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
                variant={'whitePrimary'}
                w={['60px', '70px']}
                onClick={() => router.push(`/chat?appId=${model._id}`)}
              >
                体验
              </Button>
            </Box>
          </Flex>
        </Card>
      ))}
    </>
  );
};

export default ShareModelList;
