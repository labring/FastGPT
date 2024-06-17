import React, { useState } from 'react';
import { Box, Flex, Button, IconButton, HStack } from '@chakra-ui/react';
import { DragHandleIcon } from '@chakra-ui/icons';
import { useRouter } from 'next/router';
import { AppSchema } from '@fastgpt/global/core/app/type.d';
import { useTranslation } from 'next-i18next';
import Avatar from '@/components/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import TagsEditModal from '../TagsEditModal';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { AppContext } from '@/pages/app/detail/components/context';
import { useContextSelector } from 'use-context-selector';
import PermissionIconText from '@/components/support/permission/IconText';
import MyTag from '@fastgpt/web/components/common/Tag/index';

const AppCard = () => {
  const router = useRouter();
  const { t } = useTranslation();

  const { appDetail, onOpenInfoEdit, onDelApp } = useContextSelector(AppContext, (v) => v);
  const appId = appDetail._id;
  const { feConfigs } = useSystemStore();
  const [TeamTagsSet, setTeamTagsSet] = useState<AppSchema>();

  return (
    <>
      {/* basic info */}
      <Box px={6} py={4} position={'relative'}>
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
              onClick={onDelApp}
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
          minH={'46px'}
        >
          {appDetail.intro || t('core.app.tip.Add a intro to app')}
        </Box>
        <HStack>
          <Button
            size={['sm', 'md']}
            variant={'whitePrimary'}
            leftIcon={<MyIcon name={'core/chat/chatLight'} w={'16px'} />}
            onClick={() => router.push(`/chat?appId=${appId}`)}
          >
            {t('core.Chat')}
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
          <Box flex={1} />
          <MyTag
            type="borderFill"
            colorSchema="gray"
            onClick={() => (appDetail.permission.hasManagePer ? onOpenInfoEdit() : undefined)}
          >
            <PermissionIconText defaultPermission={appDetail.defaultPermission} fontSize={'md'} />
          </MyTag>
        </HStack>
      </Box>
      {TeamTagsSet && <TagsEditModal onClose={() => setTeamTagsSet(undefined)} />}
    </>
  );
};

export default React.memo(AppCard);
