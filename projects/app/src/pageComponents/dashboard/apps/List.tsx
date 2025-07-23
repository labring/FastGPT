import React, { useMemo, useState } from 'react';
import { Box, Grid, Flex, IconButton, HStack } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { delAppById, putAppById, resumeInheritPer, changeOwner } from '@/web/core/app/api';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Avatar from '@fastgpt/web/components/common/Avatar';
import PermissionIconText from '@/components/support/permission/IconText';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { useTranslation } from 'next-i18next';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useContextSelector } from 'use-context-selector';
import { AppListContext } from './context';
import { AppFolderTypeList, AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { useFolderDrag } from '@/components/common/folder/useFolderDrag';
import dynamic from 'next/dynamic';
import type { EditResourceInfoFormType } from '@/components/common/Modal/EditResourceModal';
import MyMenu, { type MenuItemType } from '@fastgpt/web/components/common/MyMenu';
import { AppPermissionList } from '@fastgpt/global/support/permission/app/constant';
import {
  deleteAppCollaborators,
  getCollaboratorList,
  postUpdateAppCollaborators
} from '@/web/core/app/api/collaborator';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import AppTypeTag from './TypeTag';

const EditResourceModal = dynamic(() => import('@/components/common/Modal/EditResourceModal'));
const ConfigPerModal = dynamic(() => import('@/components/support/permission/ConfigPerModal'));

import type { EditHttpPluginProps } from './HttpPluginEditModal';
import { postCopyApp } from '@/web/core/app/api/app';
import { formatTimeToChatTime } from '@fastgpt/global/common/string/time';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import { type RequireOnlyOne } from '@fastgpt/global/common/type/utils';
import UserBox from '@fastgpt/web/components/common/UserBox';
import { type PermissionValueType } from '@fastgpt/global/support/permission/type';
const HttpEditModal = dynamic(() => import('./HttpPluginEditModal'));

const ListItem = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const { parentId = null } = router.query;
  const { isPc } = useSystem();

  const { openConfirm: openMoveConfirm, ConfirmModal: MoveConfirmModal } = useConfirm({
    type: 'common',
    title: t('common:move.confirm'),
    content: t('app:move.hint')
  });

  const { myApps, loadMyApps, onUpdateApp, setMoveAppId, folderDetail } = useContextSelector(
    AppListContext,
    (v) => v
  );

  const [editedApp, setEditedApp] = useState<EditResourceInfoFormType>();
  const [editHttpPlugin, setEditHttpPlugin] = useState<EditHttpPluginProps>();
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
      openMoveConfirm(async () => onPutAppById(dragId, { parentId: targetId }))();
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
      onSuccess() {
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

  return (
    <>
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
        {myApps.map((app, index) => {
          return (
            <MyTooltip
              key={app._id}
              h="100%"
              label={
                app.type === AppTypeEnum.folder
                  ? t('common:open_folder')
                  : app.permission.hasWritePer
                    ? t('app:edit_app')
                    : t('app:go_to_chat')
              }
            >
              <MyBox
                lineHeight={1.5}
                h="100%"
                pt={5}
                pb={3}
                px={5}
                cursor={'pointer'}
                border={'base'}
                boxShadow={'2'}
                bg={'white'}
                borderRadius={'lg'}
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
                    router.push({
                      query: {
                        ...router.query,
                        parentId: app._id
                      }
                    });
                  } else if (app.permission.hasWritePer) {
                    router.push(`/app/detail?appId=${app._id}`);
                  } else {
                    router.push(`/chat?appId=${app._id}`);
                  }
                }}
                {...getBoxProps({
                  dataId: app._id,
                  isFolder: app.type === AppTypeEnum.folder
                })}
              >
                <HStack>
                  <Avatar src={app.avatar} borderRadius={'sm'} w={'1.5rem'} />
                  <Box flex={'1 0 0'} color={'myGray.900'}>
                    {app.name}
                  </Box>
                  <Box mr={'-1.25rem'}>
                    <AppTypeTag type={app.type} />
                  </Box>
                </HStack>
                <Box
                  flex={['1 0 60px', '1 0 72px']}
                  mt={3}
                  pr={8}
                  textAlign={'justify'}
                  wordBreak={'break-all'}
                  fontSize={'xs'}
                  color={'myGray.500'}
                >
                  <Box className={'textEllipsis2'} whiteSpace={'pre-wrap'}>
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
                      : app.permission.hasWritePer) && (
                      <Box className="more" display={['', 'none']}>
                        <MyMenu
                          size={'xs'}
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
                                          router.push(`/chat?appId=${app._id}`);
                                        }
                                      }
                                    ]
                                  }
                                ]
                              : []),
                            ...([AppTypeEnum.plugin].includes(app.type)
                              ? [
                                  {
                                    children: [
                                      {
                                        icon: 'core/chat/chatLight',
                                        type: 'grayBg' as MenuItemType,
                                        label: t('app:go_to_run'),
                                        onClick: () => {
                                          router.push(`/chat?appId=${app._id}`);
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
                                            setEditHttpPlugin({
                                              id: app._id,
                                              name: app.name,
                                              avatar: app.avatar,
                                              intro: app.intro,
                                              pluginData: app.pluginData
                                            });
                                          } else {
                                            setEditedApp({
                                              id: app._id,
                                              avatar: app.avatar,
                                              name: app.name,
                                              intro: app.intro
                                            });
                                          }
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
                            ...(app.type === AppTypeEnum.toolSet ||
                            app.type === AppTypeEnum.folder ||
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
                                          openConfirmCopy(() => onclickCopy({ appId: app._id }))()
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
                                          openConfirmDel(
                                            () => onclickDelApp(app._id),
                                            undefined,
                                            app.type === AppTypeEnum.folder
                                              ? t('app:confirm_delete_folder_tip')
                                              : t('app:confirm_del_app_tip', { name: app.name })
                                          )()
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
      {myApps.length === 0 && <EmptyTip text={t('common:core.app.no_app')} pt={'30vh'} />}
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
            permission: editPerApp.permission,
            onGetCollaboratorList: () => getCollaboratorList(editPerApp._id),
            permissionList: AppPermissionList,
            onUpdateCollaborators: (props: {
              members?: string[];
              groups?: string[];
              orgs?: string[];
              permission: PermissionValueType;
            }) =>
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
      {!!editHttpPlugin && (
        <HttpEditModal
          defaultPlugin={editHttpPlugin}
          onClose={() => setEditHttpPlugin(undefined)}
        />
      )}
      <MoveConfirmModal />
    </>
  );
};
export default ListItem;
