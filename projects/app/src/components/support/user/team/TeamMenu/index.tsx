import React from 'react';
import { Box, Button, Flex, useDisclosure } from '@chakra-ui/react';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useTranslation } from 'next-i18next';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import dynamic from 'next/dynamic';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useToast } from '@fastgpt/web/hooks/useToast';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';

const TeamManageModal = dynamic(() => import('../TeamManageModal'));

const TeamMenu = () => {
  const { feConfigs } = useSystemStore();
  const { t } = useTranslation();
  const { userInfo } = useUserStore();
  const { toast } = useToast();

  const { isOpen, onOpen, onClose } = useDisclosure();

  return (
    <>
      <Button
        variant={'whitePrimary'}
        userSelect={'none'}
        w={'100%'}
        h={'34px'}
        justifyContent={'space-between'}
        px={3}
        css={{
          '& span': {
            display: 'block'
          }
        }}
        transform={'none !important'}
        rightIcon={<MyIcon w={'1rem'} name={'common/select'} />}
        onClick={() => {
          if (feConfigs.isPlus) {
            onOpen();
          } else {
            toast({
              status: 'warning',
              title: t('common:common.system.Commercial version function')
            });
          }
        }}
      >
        <MyTooltip label={t('common:user.team.Select Team')}>
          <Flex w={'100%'} alignItems={'center'}>
            {userInfo?.team ? (
              <>
                <Avatar src={userInfo.team.avatar} w={'1rem'} />
                <Box ml={2}>{userInfo.team.teamName}</Box>
              </>
            ) : (
              <>
                <Box w={'8px'} h={'8px'} mr={3} borderRadius={'50%'} bg={'#67c13b'} />
                {t('common:user.team.Personal Team')}
              </>
            )}
          </Flex>
        </MyTooltip>
      </Button>
      {isOpen && <TeamManageModal onClose={onClose} />}
    </>
  );
};

export default TeamMenu;
