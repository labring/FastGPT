import React, { useMemo, useState } from 'react';
import { Box, Grid, IconButton, HStack, Flex, VStack } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { delAppById, putAppById, resumeInheritPer, changeOwner } from '@/web/core/app/api';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Avatar from '@fastgpt/web/components/common/Avatar';
import PermissionIconText from '@/components/support/permission/IconText';
import { useTranslation } from 'next-i18next';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useContextSelector } from 'use-context-selector';
import { AppListContext } from './context';
import {
  AppFolderTypeList,
  AppTypeEnum,
  AppTypeList,
  ToolTypeList
} from '@fastgpt/global/core/app/constants';
import { useFolderDrag } from '@/components/common/folder/useFolderDrag';
import dynamic from 'next/dynamic';
import type { EditResourceInfoFormType } from '@/components/common/Modal/EditResourceModal';
import MyMenu, { type MenuItemType } from '@fastgpt/web/components/common/MyMenu';
import { AppRoleList } from '@fastgpt/global/support/permission/app/constant';
import {
  deleteAppCollaborators,
  getCollaboratorList,
  postUpdateAppCollaborators
} from '@/web/core/app/api/collaborator';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import AppTypeTag from './TypeTag';
import { postCopyApp } from '@/web/core/app/api/app';
import { formatTimeToChatTime } from '@fastgpt/global/common/string/time';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import { type RequireOnlyOne } from '@fastgpt/global/common/type/utils';
import UserBox from '@fastgpt/web/components/common/UserBox';
import { ChatSidebarPaneEnum } from '@/pageComponents/chat/constants';
import { ReadRoleVal } from '@fastgpt/global/support/permission/constant';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { getWebReqUrl } from '@fastgpt/web/common/system/utils';
import { createAppTypeMap } from '@/pageComponents/app/constants';
import { useUserStore } from '@/web/support/user/useUserStore';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';

const EditResourceModal = dynamic(() => import('@/components/common/Modal/EditResourceModal'));
const ConfigPerModal = dynamic(() => import('@/components/support/permission/ConfigPerModal'));

const List = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const { parentId = null } = router.query;
  const { isPc } = useSystem();
  const { toast } = useToast();
  const { userInfo } = useUserStore();

  const { openConfirm: openMoveConfirm, ConfirmModal: MoveConfirmModal } = useConfirm({
    type: 'common',
    title: t('common:move.confirm'),
    content: t('app:move.hint')
  });

  const {
    myApps,
    appType,
    loadMyApps,
    isFetchingApps,
    onUpdateApp,
    setMoveAppId,
    folderDetail,
    searchKey,
    setSearchKey
  } = useContextSelector(AppListContext, (v) => v);

  const hasCreatePer = folderDetail
    ? folderDetail.permission.hasWritePer && folderDetail?.type !== AppTypeEnum.httpPlugin
    : userInfo?.team.permission.hasAppCreatePer;

  const [editedApp, setEditedApp] = useState<EditResourceInfoFormType>();
  const [editPerAppId, setEditPerAppId] = useState<string>();

  const editPerApp = useMemo(
    () =>
      editPerAppId !== undefined
        ? myApps.find((item) => String(item._id) === String(editPerAppId))
        : undefined,
    [editPerAppId, myApps]
  );

  const parentApp = useMemo(() => myApps.find((item) => item._id === parentId), [parentId, myApps]);

  const { runAsync: onPutAppById } = useRequest2(putAppById, {
    onSuccess() {
      loadMyApps();
    }
  });

  const { getBoxProps } = useFolderDrag({
    activeStyles: {
      borderColor: 'primary.600'
    },
    onDrop: (dragId: string, targetId: string) => {
      openMoveConfirm({ onConfirm: async () => onPutAppById(dragId, { parentId: targetId }) })();
    }
  });

  const { openConfirm: openConfirmDel, ConfirmModal: DelConfirmModal } = useConfirm({
    type: 'delete'
  });

  const { lastChatAppId, setLastChatAppId } = useChatStore();
  const { runAsync: onclickDelApp } = useRequest2(
    (id: string) => {
      if (id === lastChatAppId) {
        setLastChatAppId('');
      }
      return delAppById(id);
    },
    {
      onSuccess(data) {
        data.forEach((appId) => {
          localStorage.removeItem(`app_log_keys_${appId}`);
        });
        loadMyApps();
      },
      successToast: t('common:delete_success'),
      errorToast: t('common:delete_failed')
    }
  );

  const { openConfirm: openConfirmCopy, ConfirmModal: ConfirmCopyModal } = useConfirm({
    content: t('app:confirm_copy_app_tip')
  });
  const { runAsync: onclickCopy } = useRequest2(postCopyApp, {
    onSuccess({ appId }) {
      router.push(`/app/detail?appId=${appId}`);
      loadMyApps();
    },
    successToast: t('app:create_copy_success')
  });

  const { runAsync: onResumeInheritPermission } = useRequest2(
    () => {
      return resumeInheritPer(editPerApp!._id);
    },
    {
      manual: true,
      errorToast: t('common:permission.Resume InheritPermission Failed'),
      onSuccess() {
        loadMyApps();
      }
    }
  );
  if (myApps.length === 0 && isFetchingApps) return null;

  return (
    <>
      {myApps.length === 0 && !folderDetail ? (
        searchKey ? (
          <EmptyTip />
        ) : isPc && hasCreatePer ? (
          <CreateButton appType={appType} />
        ) : (
          <Grid
            py={4}
            gridTemplateColumns={
              folderDetail
                ? ['1fr', 'repeat(2,1fr)', 'repeat(2,1fr)', 'repeat(3,1fr)']
                : ['1fr', 'repeat(2,1fr)', 'repeat(2,1fr)', 'repeat(3,1fr)', 'repeat(4,1fr)']
            }
            gridGap={5}
            alignItems={'stretch'}
          >
            {hasCreatePer ? <ListCreateButton appType={appType} /> : <ForbiddenCreateButton />}
          </Grid>
        )
      ) : (
        <Grid
          py={4}
          gridTemplateColumns={
            folderDetail
              ? ['1fr', 'repeat(2,1fr)', 'repeat(2,1fr)', 'repeat(3,1fr)']
              : ['1fr', 'repeat(2,1fr)', 'repeat(2,1fr)', 'repeat(3,1fr)', 'repeat(4,1fr)']
          }
          gridGap={5}
          alignItems={'stretch'}
        >
          {hasCreatePer ? <ListCreateButton appType={appType} /> : <ForbiddenCreateButton />}
          {myApps.map((app, index) => {
            const isAgent = AppTypeList.includes(app.type);
            const isTool = ToolTypeList.includes(app.type);
            const isFolder = AppFolderTypeList.includes(app.type);
            return (
              <MyTooltip
                key={app._id}
                label={
                  app.type === AppTypeEnum.folder
                    ? t('common:open_folder')
                    : app.permission.hasWritePer || app.permission.hasReadChatLogPer
                      ? t('app:edit_app')
                      : t('app:go_to_chat')
                }
              >
                <MyBox
                  py={4}
                  px={5}
                  cursor={'pointer'}
                  border={'base'}
                  bg={'white'}
                  borderRadius={'10px'}
                  position={'relative'}
                  display={'flex'}
                  flexDirection={'column'}
                  _hover={{
                    borderColor: 'primary.300',
                    boxShadow: '1.5',
                    '& .more': {
                      display: 'flex'
                    },
                    '& .time': {
                      display: ['flex', 'none']
                    }
                  }}
                  onClick={() => {
                    if (AppFolderTypeList.includes(app.type)) {
                      setSearchKey('');
                      router.push({
                        query: {
                          ...router.query,
                          parentId: app._id
                        }
                      });
                    } else if (app.permission.hasWritePer || app.permission.hasReadChatLogPer) {
                      router.push(`/app/detail?appId=${app._id}`);
                    } else {
                      window.open(
                        `/chat?appId=${app._id}&pane=${ChatSidebarPaneEnum.RECENTLY_USED_APPS}`,
                        '_blank'
                      );
                    }
                  }}
                  {...getBoxProps({
                    dataId: app._id,
                    isFolder: app.type === AppTypeEnum.folder || app.type === AppTypeEnum.toolFolder
                  })}
                >
                  <Grid templateColumns="auto 1fr auto" alignItems="center" width="100%" gap={2}>
                    <Avatar src={app.avatar} borderRadius={'sm'} w={'1.5rem'} />
                    <Box color={'myGray.900'} fontWeight={'medium'} minWidth={0} overflow="hidden">
                      <Box className={'textEllipsis'}>{app.name}</Box>
                    </Box>
                    <Box justifySelf="end" mr={-5}>
                      <AppTypeTag type={app.type} />
                    </Box>
                  </Grid>
                  <Box
                    flex={'1 0 56px'}
                    mt={3}
                    textAlign={'justify'}
                    wordBreak={'break-all'}
                    fontSize={'xs'}
                    color={'myGray.500'}
                  >
                    <Box className={'textEllipsis2'} whiteSpace={'pre-wrap'} lineHeight={1.3}>
                      {app.intro || t('common:no_intro')}
                    </Box>
                  </Box>
                  <HStack h={'24px'} fontSize={'mini'} color={'myGray.500'} w="full">
                    <HStack flex={'1 0 0'}>
                      <UserBox
                        sourceMember={app.sourceMember}
                        fontSize="xs"
                        avatarSize="1rem"
                        spacing={0.5}
                      />
                      <PermissionIconText
                        private={app.private}
                        color={'myGray.500'}
                        iconColor={'myGray.400'}
                        w={'0.875rem'}
                      />
                    </HStack>
                    <HStack>
                      {isPc && (
                        <HStack spacing={0.5} className="time">
                          <MyIcon name={'history'} w={'0.85rem'} color={'myGray.400'} />
                          <Box color={'myGray.500'}>
                            {t(formatTimeToChatTime(app.updateTime) as any).replace('#', ':')}
                          </Box>
                        </HStack>
                      )}
                      {(AppFolderTypeList.includes(app.type)
                        ? app.permission.hasManagePer
                        : app.permission.hasWritePer || app.permission.hasReadChatLogPer) && (
                        <Box className="more" display={['', 'none']}>
                          <MyMenu
                            Button={
                              <IconButton
                                size={'xsSquare'}
                                variant={'transparentBase'}
                                icon={<MyIcon name={'more'} w={'0.875rem'} color={'myGray.500'} />}
                                aria-label={''}
                              />
                            }
                            menuList={[
                              ...([AppTypeEnum.simple, AppTypeEnum.workflow].includes(app.type)
                                ? [
                                    {
                                      children: [
                                        {
                                          icon: 'core/chat/chatLight',
                                          type: 'grayBg' as MenuItemType,
                                          label: t('app:go_to_chat'),
                                          onClick: () => {
                                            window.open(
                                              `/chat?appId=${app._id}&pane=${ChatSidebarPaneEnum.RECENTLY_USED_APPS}`,
                                              '_blank'
                                            );
                                          }
                                        }
                                      ]
                                    }
                                  ]
                                : []),
                              ...([AppTypeEnum.workflowTool].includes(app.type)
                                ? [
                                    {
                                      children: [
                                        {
                                          icon: 'core/chat/chatLight',
                                          type: 'grayBg' as MenuItemType,
                                          label: t('app:go_to_run'),
                                          onClick: () => {
                                            window.open(
                                              `/chat?appId=${app._id}&pane=${ChatSidebarPaneEnum.RECENTLY_USED_APPS}`,
                                              '_blank'
                                            );
                                          }
                                        }
                                      ]
                                    }
                                  ]
                                : []),
                              ...(app.permission.hasManagePer
                                ? [
                                    {
                                      children: [
                                        {
                                          icon: 'edit',
                                          type: 'grayBg' as MenuItemType,
                                          label: t('common:dataset.Edit Info'),
                                          onClick: () => {
                                            if (app.type === AppTypeEnum.httpPlugin) {
                                              toast({
                                                title: t('app:type.Http plugin_deprecated'),
                                                status: 'warning'
                                              });
                                            }
                                            setEditedApp({
                                              id: app._id,
                                              avatar: app.avatar,
                                              name: app.name,
                                              intro: app.intro
                                            });
                                          }
                                        },
                                        ...(folderDetail?.type === AppTypeEnum.httpPlugin &&
                                        !(parentApp ? parentApp.permission : app.permission)
                                          .hasManagePer
                                          ? []
                                          : [
                                              {
                                                icon: 'common/file/move',
                                                type: 'grayBg' as MenuItemType,
                                                label: t('common:move_to'),
                                                onClick: () => setMoveAppId(app._id)
                                              }
                                            ]),
                                        ...(app.permission.hasManagePer
                                          ? [
                                              {
                                                icon: 'key',
                                                type: 'grayBg' as MenuItemType,
                                                label: t('common:permission.Permission'),
                                                onClick: () => setEditPerAppId(app._id)
                                              }
                                            ]
                                          : [])
                                      ]
                                    }
                                  ]
                                : []),
                              ...(!app.permission?.hasWritePer ||
                              app.type === AppTypeEnum.mcpToolSet ||
                              app.type === AppTypeEnum.folder ||
                              app.type === AppTypeEnum.httpToolSet ||
                              app.type === AppTypeEnum.httpPlugin
                                ? []
                                : [
                                    {
                                      children: [
                                        {
                                          icon: 'copy',
                                          type: 'grayBg' as MenuItemType,
                                          label: t('app:copy_one_app'),
                                          onClick: () =>
                                            openConfirmCopy({
                                              onConfirm: () => onclickCopy({ appId: app._id })
                                            })()
                                        }
                                      ]
                                    }
                                  ]),
                              ...(app.permission.isOwner
                                ? [
                                    {
                                      children: [
                                        {
                                          type: 'danger' as 'danger',
                                          icon: 'delete',
                                          label: t('common:Delete'),
                                          onClick: () =>
                                            openConfirmDel({
                                              onConfirm: () => onclickDelApp(app._id),
                                              inputConfirmText: app.name,
                                              customContent: (() => {
                                                if (isFolder)
                                                  return t('app:confirm_delete_folder_tip');
                                                if (isAgent) return t('app:confirm_del_app_tip');
                                                if (isTool) return t('app:confirm_del_tool_tip');
                                                return t('app:confirm_del_app_tip');
                                              })()
                                            })()
                                        }
                                      ]
                                    }
                                  ]
                                : [])
                            ]}
                          />
                        </Box>
                      )}
                    </HStack>
                  </HStack>
                </MyBox>
              </MyTooltip>
            );
          })}
        </Grid>
      )}
      <DelConfirmModal />
      <ConfirmCopyModal />
      {!!editedApp && (
        <EditResourceModal
          {...editedApp}
          title={t('common:core.app.edit_content')}
          onClose={() => {
            setEditedApp(undefined);
          }}
          onEdit={({ id, ...data }) => onUpdateApp(id, data)}
        />
      )}
      {!!editPerApp && (
        <ConfigPerModal
          {...(editPerApp.permission.isOwner && {
            onChangeOwner: (tmbId: string) =>
              changeOwner({
                appId: editPerApp._id,
                ownerId: tmbId
              }).then(() => loadMyApps())
          })}
          refetchResource={loadMyApps}
          hasParent={Boolean(parentId)}
          resumeInheritPermission={onResumeInheritPermission}
          isInheritPermission={editPerApp.inheritPermission}
          avatar={editPerApp.avatar}
          name={editPerApp.name}
          managePer={{
            defaultRole: ReadRoleVal,
            permission: editPerApp.permission,
            onGetCollaboratorList: () => getCollaboratorList(editPerApp._id),
            roleList: AppRoleList,
            onUpdateCollaborators: (props) =>
              postUpdateAppCollaborators({
                ...props,
                appId: editPerApp._id
              }),
            onDelOneCollaborator: async (
              props: RequireOnlyOne<{
                tmbId?: string;
                groupId?: string;
                orgId?: string;
              }>
            ) =>
              deleteAppCollaborators({
                ...props,
                appId: editPerApp._id
              }),
            refreshDeps: [editPerApp.inheritPermission]
          }}
          onClose={() => setEditPerAppId(undefined)}
        />
      )}
      <MoveConfirmModal />
    </>
  );
};

const CreateButton = ({ appType }: { appType: AppTypeEnum | 'all' }) => {
  const { t } = useTranslation();
  const [isHoverCreateButton, setIsHoverCreateButton] = useState(false);
  const router = useRouter();
  const parentId = router.query.parentId;
  const createAppType =
    appType !== 'all' && appType in createAppTypeMap
      ? createAppTypeMap[appType as keyof typeof createAppTypeMap].type
      : router.pathname.includes('/agent')
        ? AppTypeEnum.workflow
        : AppTypeEnum.workflowTool;
  const isToolType = ToolTypeList.includes(createAppType);

  return (
    <Box
      position="relative"
      width="100%"
      minH={'150px'}
      overflow="hidden"
      rounded={'sm'}
      cursor={'pointer'}
      onClick={() => {
        router.push(
          `/dashboard/create?appType=${createAppType}${parentId ? `&parentId=${parentId}` : ''}`
        );
      }}
      onMouseEnter={() => setIsHoverCreateButton(true)}
      onMouseLeave={() => setIsHoverCreateButton(false)}
      boxShadow={
        isHoverCreateButton
          ? '0 4px 27.1px 0 rgba(199, 212, 233, 0.29)'
          : '0 4px 27.1px 0 rgba(199, 212, 233, 0.29)'
      }
      userSelect={'none'}
      mt={4}
    >
      <Box
        as="img"
        src={getWebReqUrl('/imgs/app/createButton.jpg')}
        alt="operational advertisement"
        width="100%"
        maxW="100%"
        display="block"
        transition="transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)"
        transform={isHoverCreateButton ? 'scale(1.2) translateY(-12px)' : 'scale(1) translateY(0)'}
      />
      <VStack
        position="absolute"
        top="50%"
        left="50%"
        transform="translate(-50%, -50%)"
        color="#334155"
        fontSize="32px"
        fontWeight="medium"
      >
        <Flex gap={2.5} alignItems={'center'}>
          <MyIcon name={'core/app/create'} w={8} />
          {isToolType ? t('app:create_your_first_tool') : t('app:create_your_first_agent')}
        </Flex>
        <Box
          mt={4}
          h={14}
          w={'330px'}
          display={'flex'}
          alignItems={'center'}
          justifyContent={'center'}
          sx={{
            background: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='330' height='56'%3E%3Crect x='0.5' y='0.5' width='329' height='55' rx='12' fill='none' stroke='%237895FE' stroke-width='1' stroke-dasharray='6 6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") no-repeat center`
          }}
        >
          <MyIcon name={'common/addLight'} w={8} color={'#7895FE'} />
        </Box>
      </VStack>
    </Box>
  );
};
const ListCreateButton = ({ appType }: { appType: AppTypeEnum | 'all' }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const parentId = router.query.parentId;
  const createAppType =
    appType !== 'all' && appType in createAppTypeMap
      ? createAppTypeMap[appType as keyof typeof createAppTypeMap].type
      : router.pathname.includes('/agent')
        ? AppTypeEnum.workflow
        : AppTypeEnum.workflowTool;

  return (
    <MyBox
      py={4}
      px={5}
      cursor={'pointer'}
      border={'base'}
      bg={'white'}
      borderRadius={'10px'}
      position={'relative'}
      display={'flex'}
      flexDirection={'column'}
      _hover={{
        '& .create-box': {
          display: 'flex'
        }
      }}
      onClick={() => {
        router.push(
          `/dashboard/create?appType=${createAppType}${parentId ? `&parentId=${parentId}` : ''}`
        );
      }}
    >
      <Box color={'myGray.900'} fontWeight={'medium'}>
        {t('common:new_create')}
      </Box>
      <Box
        mt={4}
        mb={2}
        h={'100%'}
        w={'100%'}
        display={'flex'}
        alignItems={'center'}
        justifyContent={'center'}
        position={'relative'}
        flex={'1 0 56px'}
      >
        <Box
          className="create-box"
          display={'none'}
          position={'absolute'}
          top={'1px'}
          left={'1px'}
          right={'1px'}
          bottom={'1px'}
          bg={'primary.50'}
          borderRadius={'14px'}
        />
        <Box
          w={'100%'}
          h={'100%'}
          display={'flex'}
          alignItems={'center'}
          justifyContent={'center'}
          sx={{
            background: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100%25' height='100%25' viewBox='0 0 330 56' preserveAspectRatio='none'%3E%3Crect x='0.5' y='0.5' width='329' height='55' rx='12' fill='none' stroke='%237895FE' stroke-width='1' stroke-dasharray='6 6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") no-repeat center`,
            backgroundSize: '100% 100%'
          }}
        >
          <MyIcon name={'common/addLight'} w={8} color={'#7895FE'} zIndex={1} />
        </Box>
      </Box>
    </MyBox>
  );
};
const ForbiddenCreateButton = () => {
  const { t } = useTranslation();
  return (
    <MyBox
      py={4}
      px={5}
      cursor={'not-allowed'}
      border={'base'}
      bg={'white'}
      borderRadius={'10px'}
      position={'relative'}
      display={'flex'}
      flexDirection={'column'}
    >
      <Box color={'myGray.900'} fontWeight={'medium'}>
        {t('common:new_create')}
      </Box>
      <Box
        mt={4}
        mb={2}
        h={'100%'}
        w={'100%'}
        display={'flex'}
        alignItems={'center'}
        justifyContent={'center'}
        position={'relative'}
        flex={'1 0 56px'}
      >
        <Box
          position={'absolute'}
          top={'1px'}
          left={'1px'}
          right={'1px'}
          bottom={'1px'}
          bg={'myGray.50'}
          borderRadius={'14px'}
        />
        <Box
          w={'100%'}
          h={'100%'}
          display={'flex'}
          flexDirection={'column'}
          alignItems={'center'}
          justifyContent={'center'}
          sx={{
            background: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100%25' height='100%25' viewBox='0 0 330 56' preserveAspectRatio='none'%3E%3Crect x='0.5' y='0.5' width='329' height='55' rx='12' fill='none' stroke='%23D7D7D7' stroke-width='1' stroke-dasharray='6 6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") no-repeat center`,
            backgroundSize: '100% 100%'
          }}
        >
          <MyIcon name={'common/disable'} w={'34px'} color={'#DFE2EA'} zIndex={1} />
          <Box color={'myGray.500'} fontSize={'11px'} fontWeight={'medium'} zIndex={1}>
            {t('app:has_no_create_per')}
          </Box>
        </Box>
      </Box>
    </MyBox>
  );
};

export default List;
