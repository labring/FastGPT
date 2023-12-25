import React from 'react';
import { Box, Button, Flex, Image, useDisclosure, useTheme } from '@chakra-ui/react';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useTranslation } from 'next-i18next';
import MyTooltip from '@/components/MyTooltip';
import dynamic from 'next/dynamic';
import { feConfigs } from '@/web/common/system/staticData';
import { useToast } from '@/web/common/hooks/useToast';

const TeamManageModal = dynamic(() => import('../TeamManageModal'));

const TeamMenu = () => {
  const theme = useTheme();
  const { t } = useTranslation();
  const { userInfo } = useUserStore();
  const { toast } = useToast();

  const { isOpen, onOpen, onClose } = useDisclosure();

  return (
    <Button
      variant={'whitePrimary'}
      userSelect={'none'}
      w={'100%'}
      display={'block'}
      h={'34px'}
      px={3}
      css={{
        '& span': {
          display: 'block'
        }
      }}
      transform={'none !important'}
      onClick={() => {
        if (feConfigs.isPlus) {
          onOpen();
        } else {
          toast({
            status: 'warning',
            title: t('common.Business edition features')
          });
        }
      }}
    >
      <MyTooltip label={t('user.team.Select Team')}>
        <Flex w={'100%'} alignItems={'center'}>
          {userInfo?.team ? (
            <>
              <Image src={userInfo.team.avatar} alt={''} w={'16px'} />
              <Box ml={2}>{userInfo.team.teamName}</Box>
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
    </Button>
  );
};

export default TeamMenu;
