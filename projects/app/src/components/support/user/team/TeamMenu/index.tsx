import React from 'react';
import { Box, Flex, Image, useDisclosure, useTheme } from '@chakra-ui/react';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useTranslation } from 'react-i18next';
import MyTooltip from '@/components/MyTooltip';
import dynamic from 'next/dynamic';

const TeamManageModal = dynamic(() => import('../TeamManageModal'));

const TeamMenu = () => {
  const theme = useTheme();
  const { t } = useTranslation();
  const { userInfo } = useUserStore();

  const { isOpen, onOpen, onClose } = useDisclosure();

  return (
    <Box
      py={1}
      pl={4}
      border={theme.borders.sm}
      borderWidth={'1.5px'}
      borderRadius={'md'}
      cursor={'pointer'}
      userSelect={'none'}
      css={{
        '& span': {
          display: 'block'
        }
      }}
      onClick={onOpen}
    >
      <MyTooltip label={t('user.team.Select Team')}>
        <Flex w={'100%'} alignItems={'center'}>
          {userInfo?.team ? (
            <>
              <Image src={userInfo.team.avatar} alt={''} w={'16px'} />
              <Box>{userInfo.team.teamName}</Box>
            </>
          ) : (
            <>
              <Box w={'8px'} h={'8px'} mr={3} borderRadius={'50%'} bg={'#67c13b'} />
              {t('user.team.Personal Team')}
            </>
          )}
        </Flex>
      </MyTooltip>
      {isOpen && <TeamManageModal onClose={onClose} />}
    </Box>
  );
};

export default TeamMenu;
