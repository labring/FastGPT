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
import { useQuery } from '@tanstack/react-query';
import { AddIcon } from '@chakra-ui/icons';
import { delModelById } from '@/web/core/app/api';
import { useToast } from '@/web/common/hooks/useToast';
import { useConfirm } from '@/web/common/hooks/useConfirm';
import { serviceSideProps } from '@/web/common/utils/i18n';
import { useTranslation } from 'next-i18next';

import MyIcon from '@fastgpt/web/components/common/Icon';
import PageContainer from '@/components/PageContainer';
import Avatar from '@/components/Avatar';
import MyTooltip from '@/components/MyTooltip';
import CreateModal from './component/CreateModal';
import { useAppStore } from '@/web/core/app/store/useAppStore';
import PermissionIconText from '@/components/support/permission/IconText';
import { useUserStore } from '@/web/support/user/useUserStore';

const MyApps = () => {
  const { toast } = useToast();
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const { userInfo } = useUserStore();
  const { myApps, loadMyApps } = useAppStore();
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
  const { isFetching } = useQuery(['loadApps'], () => loadMyApps(true), {
    refetchOnMount: true
  });

  return (
    <PageContainer isLoading={isFetching} insertProps={{ px: [5, '48px'] }}>
      <Flex pt={[4, '30px']} alignItems={'center'} justifyContent={'space-between'}>
        <Box letterSpacing={1} fontSize={['20px', '24px']} color={'myGray.900'}>
          {t('app.My Apps')}
        </Box>
        <Button leftIcon={<AddIcon />} variant={'primaryOutline'} onClick={onOpenCreateModal}>
          {t('common.New Create')}
        </Button>
      </Flex>
      <Grid
        py={[4, 6]}
        gridTemplateColumns={['1fr', 'repeat(2,1fr)', 'repeat(3,1fr)', 'repeat(4,1fr)']}
        gridGap={5}
      >
        {myApps.map((app) => (
          <MyTooltip
            key={app._id}
            label={userInfo?.team.canWrite ? t('app.To Settings') : t('app.To Chat')}
          >
            <Box
              lineHeight={1.5}
              h={'100%'}
              py={3}
              px={5}
              cursor={'pointer'}
              borderWidth={'1.5px'}
              borderColor={'borderColor.low'}
              bg={'white'}
              borderRadius={'md'}
              userSelect={'none'}
              position={'relative'}
              display={'flex'}
              flexDirection={'column'}
              _hover={{
                borderColor: 'primary.300',
                boxShadow: '1.5',
                '& .delete': {
                  display: 'flex'
                },
                '& .chat': {
                  display: 'flex'
                }
              }}
              onClick={() => {
                if (userInfo?.team.canWrite) {
                  router.push(`/app/detail?appId=${app._id}`);
                } else {
                  router.push(`/chat?appId=${app._id}`);
                }
              }}
            >
              <Flex alignItems={'center'} h={'38px'}>
                <Avatar src={app.avatar} borderRadius={'md'} w={'28px'} />
                <Box ml={3}>{app.name}</Box>
                {app.isOwner && userInfo?.team.canWrite && (
                  <IconButton
                    className="delete"
                    position={'absolute'}
                    top={4}
                    right={4}
                    size={'xsSquare'}
                    variant={'whiteDanger'}
                    icon={<MyIcon name={'delete'} w={'14px'} />}
                    aria-label={'delete'}
                    display={['', 'none']}
                    onClick={(e) => {
                      e.stopPropagation();
                      openConfirm(() => onclickDelApp(app._id))();
                    }}
                  />
                )}
              </Flex>
              <Box
                flex={1}
                className={'textEllipsis3'}
                py={2}
                wordBreak={'break-all'}
                fontSize={'sm'}
                color={'myGray.600'}
              >
                {app.intro || '这个应用还没写介绍~'}
              </Box>
              <Flex h={'34px'} alignItems={'flex-end'}>
                <Box flex={1}>
                  <PermissionIconText permission={app.permission} color={'myGray.600'} />
                </Box>
                {userInfo?.team.canWrite && (
                  <IconButton
                    className="chat"
                    size={'xsSquare'}
                    variant={'whitePrimary'}
                    icon={
                      <MyTooltip label={'去聊天'}>
                        <MyIcon name={'core/chat/chatLight'} w={'14px'} />
                      </MyTooltip>
                    }
                    aria-label={'chat'}
                    display={['', 'none']}
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/chat?appId=${app._id}`);
                    }}
                  />
                )}
              </Flex>
            </Box>
          </MyTooltip>
        ))}
      </Grid>
      {myApps.length === 0 && (
        <Flex mt={'35vh'} flexDirection={'column'} alignItems={'center'}>
          <MyIcon name="empty" w={'48px'} h={'48px'} color={'transparent'} />
          <Box mt={2} color={'myGray.500'}>
            还没有应用，快去创建一个吧！
          </Box>
        </Flex>
      )}
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
