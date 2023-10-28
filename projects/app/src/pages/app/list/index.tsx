import React, { useCallback, useEffect } from 'react';
import {
  Box,
  Grid,
  Card,
  useTheme,
  Flex,
  IconButton,
  Button,
  useDisclosure,
  Image
} from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useQuery } from '@tanstack/react-query';
import { AddIcon } from '@chakra-ui/icons';
import { delModelById } from '@/web/core/app/api';
import { useToast } from '@/web/common/hooks/useToast';
import { useConfirm } from '@/web/common/hooks/useConfirm';
import { serviceSideProps } from '@/web/common/utils/i18n';
import { useTranslation } from 'next-i18next';

import MyIcon from '@/components/Icon';
import PageContainer from '@/components/PageContainer';
import Avatar from '@/components/Avatar';
import MyTooltip from '@/components/MyTooltip';
import CreateModal from './component/CreateModal';

const MyApps = () => {
  const { toast } = useToast();
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const { myApps, loadMyApps } = useUserStore();
  const { openConfirm, ConfirmModal } = useConfirm({
    title: '删除提示',
    content: '确认删除该应用所有信息？'
  });
  const {
    isOpen: isOpenCreateModal,
    onOpen: onOpenCreateModal,
    onClose: onCloseCreateModal
  } = useDisclosure();

  /* 点击删除 */
  const onclickDelApp = useCallback(
    async (id: string) => {
      try {
        await delModelById(id);
        toast({
          title: '删除成功',
          status: 'success'
        });
        loadMyApps(true);
      } catch (err: any) {
        toast({
          title: err?.message || '删除失败',
          status: 'error'
        });
      }
    },
    [toast, loadMyApps]
  );

  /* 加载模型 */
  useQuery(['loadApps'], () => loadMyApps(true), {
    refetchOnMount: true
  });

  return (
    <PageContainer>
      <Flex pt={3} px={5} alignItems={'center'}>
        <Flex flex={1} alignItems={'center'}>
          <Image src={'/imgs/module/ai.svg'} alt={''} mr={2} h={'24px'} />
          <Box className="textlg" letterSpacing={1} fontSize={['20px', '24px']} fontWeight={'bold'}>
            {t('app.My Apps')}
          </Box>
        </Flex>
        <Button leftIcon={<AddIcon />} variant={'base'} onClick={onOpenCreateModal}>
          {t('common.New Create')}
        </Button>
      </Flex>
      <Grid
        p={5}
        gridTemplateColumns={['1fr', 'repeat(3,1fr)', 'repeat(4,1fr)', 'repeat(5,1fr)']}
        gridGap={5}
      >
        {myApps.map((app) => (
          <Card
            key={app._id}
            py={4}
            px={5}
            cursor={'pointer'}
            h={'140px'}
            border={theme.borders.md}
            boxShadow={'none'}
            userSelect={'none'}
            position={'relative'}
            _hover={{
              boxShadow: '1px 1px 10px rgba(0,0,0,0.2)',
              borderColor: 'transparent',
              '& .delete': {
                display: 'block'
              },
              '& .chat': {
                display: 'block'
              }
            }}
            onClick={() => router.push(`/app/detail?appId=${app._id}`)}
          >
            <Flex alignItems={'center'} h={'38px'}>
              <Avatar src={app.avatar} borderRadius={'md'} w={'28px'} />
              <Box ml={3}>{app.name}</Box>
              <IconButton
                className="delete"
                position={'absolute'}
                top={4}
                right={4}
                size={'sm'}
                icon={<MyIcon name={'delete'} w={'14px'} />}
                variant={'base'}
                borderRadius={'md'}
                aria-label={'delete'}
                display={['', 'none']}
                _hover={{
                  bg: 'red.100'
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  openConfirm(() => onclickDelApp(app._id))();
                }}
              />
            </Flex>
            <Box
              className={'textEllipsis3'}
              py={2}
              wordBreak={'break-all'}
              fontSize={'sm'}
              color={'myGray.600'}
            >
              {app.intro || '这个应用还没写介绍~'}
            </Box>
            <IconButton
              className="chat"
              position={'absolute'}
              right={4}
              bottom={4}
              size={'sm'}
              icon={
                <MyTooltip label={'去聊天'}>
                  <MyIcon name={'chat'} w={'14px'} />
                </MyTooltip>
              }
              variant={'base'}
              borderRadius={'md'}
              aria-label={'delete'}
              display={['', 'none']}
              _hover={{
                bg: 'myGray.100'
              }}
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/chat?appId=${app._id}`);
              }}
            />
          </Card>
        ))}
      </Grid>
      <ConfirmModal />
      {isOpenCreateModal && (
        <CreateModal onClose={onCloseCreateModal} onSuccess={() => loadMyApps(true)} />
      )}
    </PageContainer>
  );
};

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content))
    }
  };
}

export default MyApps;
