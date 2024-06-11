import React from 'react';
import { Box, Button, Flex, Image, useDisclosure } from '@chakra-ui/react';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useTranslation } from 'next-i18next';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import dynamic from 'next/dynamic';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useToast } from '@fastgpt/web/hooks/useToast';
import Avatar from '@/components/Avatar';

const TeamManageModal = dynamic(() => import('../TeamManageModal'));

const TeamMenu = () => {
  const { feConfigs } = useSystemStore();
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
            title: t('common.system.Commercial version function')
          });
        }
      }}
    >
      <MyTooltip label={t('user.team.Select Team')}>
        <Flex w={'100%'} alignItems={'center'}>
          {userInfo?.team ? (
            <>
              <Avatar src={userInfo.team.avatar} w={'1rem'} />
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
