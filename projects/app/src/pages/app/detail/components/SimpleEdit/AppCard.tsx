import React, { useState } from 'react';
import { Box, Flex, Button, IconButton } from '@chakra-ui/react';
import { useRequest } from '@/web/common/hooks/useRequest';
import { useConfirm } from '@/web/common/hooks/useConfirm';
import { useRouter } from 'next/router';
import { useToast } from '@/web/common/hooks/useToast';
import { AppSchema } from '@fastgpt/global/core/app/type.d';
import { delModelById } from '@/web/core/app/api';
import { useTranslation } from 'next-i18next';
import { useAppStore } from '@/web/core/app/store/useAppStore';
import PermissionIconText from '@/components/support/permission/IconText';
import dynamic from 'next/dynamic';
import Avatar from '@/components/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
const InfoModal = dynamic(() => import('../InfoModal'));

const AppCard = ({ appId }: { appId: string }) => {
  const router = useRouter();
  const { t } = useTranslation();
  const { toast } = useToast();
  const { appDetail } = useAppStore();
  const [settingAppInfo, setSettingAppInfo] = useState<AppSchema>();

  const { openConfirm: openConfirmDel, ConfirmModal: ConfirmDelModal } = useConfirm({
    content: t('app.Confirm Del App Tip')
  });

  /* 点击删除 */
  const { mutate: handleDelModel, isLoading } = useRequest({
    mutationFn: async () => {
      if (!appDetail) return null;
      await delModelById(appDetail._id);
      return 'success';
    },
    onSuccess(res) {
      if (!res) return;
      toast({
        title: t('common.Delete Success'),
        status: 'success'
      });
      router.replace(`/app/list`);
    },
    errorToast: t('common.Delete Failed')
  });

  return (
    <>
      <Box px={4}>
        <Flex alignItems={'center'} justifyContent={'space-between'}>
          <Box fontSize={['md', 'xl']} fontWeight={'bold'}>
            <PermissionIconText permission={appDetail.permission} />
          </Box>
          <Box color={'myGray.500'} fontSize={'sm'}>
            AppId:{' '}
            <Box as={'span'} userSelect={'all'}>
              {appId}
            </Box>
          </Box>
        </Flex>
        {/* basic info */}
        <Box
          borderWidth={'1px'}
          borderColor={'primary.1'}
          borderRadius={'md'}
          mt={2}
          px={5}
          py={4}
          bg={'primary.50'}
          position={'relative'}
        >
          <Flex alignItems={'center'} py={2}>
            <Avatar src={appDetail.avatar} borderRadius={'md'} w={'28px'} />
            <Box ml={3} fontWeight={'bold'} fontSize={'lg'}>
              {appDetail.name}
            </Box>
            {appDetail.isOwner && (
              <IconButton
                className="delete"
                position={'absolute'}
                top={4}
                right={4}
                size={'smSquare'}
                icon={<MyIcon name={'delete'} w={'14px'} />}
                variant={'whiteDanger'}
                borderRadius={'md'}
                aria-label={'delete'}
                isLoading={isLoading}
                onClick={openConfirmDel(handleDelModel)}
              />
            )}
          </Flex>
          <Box
            flex={1}
            my={2}
            className={'textEllipsis3'}
            wordBreak={'break-all'}
            color={'myGray.600'}
          >
            {appDetail.intro || '快来给应用一个介绍~'}
          </Box>
          <Flex>
            <Button
              size={['sm', 'md']}
              variant={'whitePrimary'}
              leftIcon={<MyIcon name={'core/chat/chatLight'} w={'16px'} />}
              onClick={() => router.push(`/chat?appId=${appId}`)}
            >
              对话
            </Button>
            <Button
              mx={3}
              size={['sm', 'md']}
              variant={'whitePrimary'}
              leftIcon={<MyIcon name={'support/outlink/shareLight'} w={'16px'} />}
              onClick={() => {
                router.replace({
                  query: {
                    appId,
                    currentTab: 'outLink'
                  }
                });
              }}
            >
              外接
            </Button>
            {appDetail.isOwner && (
              <Button
                size={['sm', 'md']}
                variant={'whitePrimary'}
                leftIcon={<MyIcon name={'common/settingLight'} w={'16px'} />}
                onClick={() => setSettingAppInfo(appDetail)}
              >
                设置
              </Button>
            )}
          </Flex>
        </Box>
      </Box>

      <ConfirmDelModal />
      {settingAppInfo && (
        <InfoModal defaultApp={settingAppInfo} onClose={() => setSettingAppInfo(undefined)} />
      )}
    </>
  );
};

export default React.memo(AppCard);
