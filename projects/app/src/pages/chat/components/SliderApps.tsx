import React from 'react';
import { Flex, Box, IconButton } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Avatar from '@/components/Avatar';
import { AppListItemType } from '@fastgpt/global/core/app/type';

const SliderApps = ({
  showExist = true,
  apps,
  activeAppId
}: {
  showExist?: boolean;
  apps: AppListItemType[];
  activeAppId: string;
}) => {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <Flex flexDirection={'column'} h={'100%'}>
      <Box px={5} py={4}>
        {showExist && (
          <Flex
            alignItems={'center'}
            cursor={'pointer'}
            py={2}
            px={3}
            borderRadius={'md'}
            _hover={{ bg: 'myGray.200' }}
            onClick={() => router.push('/app/list')}
          >
            <IconButton
              mr={3}
              icon={<MyIcon name={'common/backFill'} w={'18px'} color={'primary.500'} />}
              bg={'white'}
              boxShadow={'1px 1px 9px rgba(0,0,0,0.15)'}
              size={'smSquare'}
              borderRadius={'50%'}
              aria-label={''}
            />
            {t('core.chat.Exit Chat')}
          </Flex>
        )}
      </Box>

      <Box flex={'1 0 0'} h={0} px={5} overflow={'overlay'}>
        {apps.map((item) => (
          <Flex
            key={item._id}
            py={2}
            px={3}
            mb={3}
            cursor={'pointer'}
            borderRadius={'md'}
            alignItems={'center'}
            {...(item._id === activeAppId
              ? {
                  bg: 'white',
                  boxShadow: 'md'
                }
              : {
                  _hover: {
                    bg: 'myGray.200'
                  },
                  onClick: () => {
                    router.replace({
                      query: {
                        ...router.query,
                        chatId: '',
                        appId: item._id
                      }
                    });
                  }
                })}
          >
            <Avatar src={item.avatar} w={'24px'} />
            <Box ml={2} className={'textEllipsis'}>
              {item.name}
            </Box>
          </Flex>
        ))}
      </Box>
    </Flex>
  );
};

export default SliderApps;
