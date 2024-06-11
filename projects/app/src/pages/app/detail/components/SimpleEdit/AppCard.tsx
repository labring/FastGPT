import React, { useState } from 'react';
import { Box, Flex, Button, IconButton, useDisclosure } from '@chakra-ui/react';
import { DragHandleIcon } from '@chakra-ui/icons';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useRouter } from 'next/router';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { AppSchema } from '@fastgpt/global/core/app/type.d';
import { delAppById } from '@/web/core/app/api';
import { useTranslation } from 'next-i18next';
import PermissionIconText from '@/components/support/permission/IconText';
import dynamic from 'next/dynamic';
import Avatar from '@/components/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import TagsEditModal from './TagsEditModal';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useI18n } from '@/web/context/I18n';
import { AppContext } from '@/web/core/app/context/appContext';
import { useContextSelector } from 'use-context-selector';
const InfoModal = dynamic(() => import('../InfoModal'));

const AppCard = () => {
  const router = useRouter();
  const { t } = useTranslation();
  const { appT } = useI18n();

  const { toast } = useToast();
  const { appDetail } = useContextSelector(AppContext, (v) => v);
  const appId = appDetail._id;
  const { feConfigs } = useSystemStore();
  const [TeamTagsSet, setTeamTagsSet] = useState<AppSchema>();

  const {
    isOpen: isOpenInfoEdit,
    onOpen: onOpenInfoEdit,
    onClose: onCloseInfoEdit
  } = useDisclosure();

  const { openConfirm: openConfirmDel, ConfirmModal: ConfirmDelModal } = useConfirm({
    content: appT('Confirm Del App Tip'),
    type: 'delete'
  });

  /* 点击删除 */
  const { mutate: handleDelModel, isLoading } = useRequest({
    mutationFn: async () => {
      if (!appDetail) return null;
      await delAppById(appDetail._id);
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
          <Box fontWeight={'bold'}>
            <PermissionIconText defaultPermission={appDetail.defaultPermission} fontSize={'md'} />
          </Box>
          <Box color={'myGray.500'} fontSize={'xs'}>
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
          <Flex alignItems={'center'}>
            <Avatar src={appDetail.avatar} borderRadius={'md'} w={'28px'} />
            <Box ml={3} fontWeight={'bold'} fontSize={'md'}>
              {appDetail.name}
            </Box>
            {appDetail.permission.isOwner && (
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
            mt={3}
            mb={4}
            className={'textEllipsis3'}
            wordBreak={'break-all'}
            color={'myGray.600'}
            fontSize={'xs'}
          >
            {appDetail.intro || t('core.app.tip.Add a intro to app')}
          </Box>
          <Flex>
            <Button
              size={['sm', 'md']}
              variant={'whitePrimary'}
              leftIcon={<MyIcon name={'core/chat/chatLight'} w={'16px'} />}
              onClick={() => router.push(`/chat?appId=${appId}`)}
            >
              {t('core.Chat')}
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
                    currentTab: 'publish'
                  }
                });
              }}
            >
              {t('core.app.navbar.Publish')}
            </Button>
            {appDetail.permission.hasWritePer && feConfigs?.show_team_chat && (
              <Button
                mr={3}
                size={['sm', 'md']}
                variant={'whitePrimary'}
                leftIcon={<DragHandleIcon w={'16px'} />}
                onClick={() => setTeamTagsSet(appDetail)}
              >
                {t('common.Team Tags Set')}
              </Button>
            )}
            {appDetail.permission.hasManagePer && (
              <Button
                size={['sm', 'md']}
                variant={'whitePrimary'}
                leftIcon={<MyIcon name={'common/settingLight'} w={'16px'} />}
                onClick={onOpenInfoEdit}
              >
                {t('common.Setting')}
              </Button>
            )}
          </Flex>
        </Box>
      </Box>
      <ConfirmDelModal />
      {isOpenInfoEdit && <InfoModal onClose={onCloseInfoEdit} />}
      {TeamTagsSet && <TagsEditModal onClose={() => setTeamTagsSet(undefined)} />}
    </>
  );
};

export default React.memo(AppCard);
