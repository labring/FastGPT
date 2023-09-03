import React from 'react';
import { Flex, Box, IconButton } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { useUserStore } from '@/store/user';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import MyIcon from '@/components/Icon';
import Avatar from '@/components/Avatar';

const SliderApps = ({ appId }: { appId: string }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { myApps, loadMyApps } = useUserStore();

  useQuery(['loadModels'], () => loadMyApps(false));

  return (
    <Flex flexDirection={'column'} h={'100%'}>
      <Box px={5} py={4}>
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
            icon={<MyIcon name={'backFill'} w={'18px'} color={'myBlue.600'} />}
            bg={'white'}
            boxShadow={'1px 1px 9px rgba(0,0,0,0.15)'}
            h={'28px'}
            size={'sm'}
            borderRadius={'50%'}
            aria-label={''}
          />
          {t('chat.Exit Chat')}
        </Flex>
      </Box>
      <Box flex={'1 0 0'} h={0} px={5} overflow={'overlay'}>
        {myApps.map((item) => (
          <Flex
            key={item._id}
            py={2}
            px={3}
            mb={3}
            cursor={'pointer'}
            borderRadius={'lg'}
            alignItems={'center'}
            {...(item._id === appId
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
