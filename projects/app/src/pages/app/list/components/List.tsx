import React, { useMemo, useState } from 'react';
import { Box, Grid, Flex, IconButton, HStack } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { delAppById, putAppById } from '@/web/core/app/api';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Avatar from '@/components/Avatar';
import PermissionIconText from '@/components/support/permission/IconText';
import { useI18n } from '@/web/context/I18n';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { useTranslation } from 'next-i18next';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useContextSelector } from 'use-context-selector';
import { AppListContext } from './context';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { useFolderDrag } from '@/components/common/folder/useFolderDrag';
import dynamic from 'next/dynamic';
import type { EditResourceInfoFormType } from '@/components/common/Modal/EditResourceModal';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import {
  AppDefaultPermissionVal,
  AppPermissionList
} from '@fastgpt/global/support/permission/app/constant';
import {
  deleteAppCollaborators,
  getCollaboratorList,
  postUpdateAppCollaborators
} from '@/web/core/app/api/collaborator';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import AppTypeTag from '@/pages/app/list/components/TypeTag';

const EditResourceModal = dynamic(() => import('@/components/common/Modal/EditResourceModal'));
const ConfigPerModal = dynamic(() => import('@/components/support/permission/ConfigPerModal'));

import type { EditHttpPluginProps } from './HttpPluginEditModal';
import { postCopyApp } from '@/web/core/app/api/app';
import { getTeamMembers } from '@/web/support/user/team/api';
import { formatTimeToChatTime } from '@fastgpt/global/common/string/time';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { useSystemStore } from '@/web/common/system/useSystemStore';
const HttpEditModal = dynamic(() => import('./HttpPluginEditModal'));

const ListItem = () => {
  const { t } = useTranslation();
  const { appT } = useI18n();
  const router = useRouter();
  const { isPc } = useSystem();

  const { myApps, loadMyApps, onUpdateApp, setMoveAppId, folderDetail, appType } =
    useContextSelector(AppListContext, (v) => v);
  const [loadingAppId, setLoadingAppId] = useState<string>();

  const [editedApp, setEditedApp] = useState<EditResourceInfoFormType>();
  const [editHttpPlugin, setEditHttpPlugin] = useState<EditHttpPluginProps>();
  const [editPerAppIndex, setEditPerAppIndex] = useState<number>();
  const { feConfigs } = useSystemStore();

  const editPerApp = useMemo(
    () => (editPerAppIndex !== undefined ? myApps[editPerAppIndex] : undefined),
    [editPerAppIndex, myApps]
  );

  const { getBoxProps } = useFolderDrag({
    activeStyles: {
      borderColor: 'primary.600'
    },
    onDrop: async (dragId: string, targetId: string) => {
      setLoadingAppId(dragId);
      try {
        await putAppById(dragId, { parentId: targetId });
        loadMyApps();
      } catch (error) {}
      setLoadingAppId(undefined);
    }
  });

  const { openConfirm: openConfirmDel, ConfirmModal: DelConfirmModal } = useConfirm({
    type: 'delete'
  });
  const { runAsync: onclickDelApp } = useRequest2(
    (id: string) => {
      return delAppById(id);
    },
    {
      onSuccess() {
        loadMyApps();
      },
      successToast: t('common.Delete Success'),
      errorToast: t('common.Delete Failed')
    }
  );

  const { openConfirm: openConfirmCopy, ConfirmModal: ConfirmCopyModal } = useConfirm({
    content: appT('Confirm copy app tip')
  });
  const { runAsync: onclickCopy } = useRequest2(postCopyApp, {
    onSuccess({ appId }) {
      router.push(`/app/detail?appId=${appId}`);
      loadMyApps();
    },
    successToast: appT('Create copy success')
  });

  const { data: members = [] } = useRequest2(getTeamMembers, {
    manual: !feConfigs.isPlus
  });

  return (
    <>
      <Grid
        py={4}
        gridTemplateColumns={[
          '1fr',
          'repeat(2,1fr)',
          'repeat(3,1fr)',
          'repeat(3,1fr)',
          'repeat(4,1fr)'
        ]}
        gridGap={5}
        alignItems={'stretch'}
      >
        {myApps.map((app, index) => {
          const owner = members.find((v) => v.tmbId === app.tmbId);
          return (
            <MyTooltip
              key={app._id}
              h="100%"
              label={
                app.type === AppTypeEnum.folder
                  ? t('common.folder.Open folder')
                  : app.permission.hasWritePer
                    ? appT('Edit app')
                    : appT('Go to chat')
              }
            >
              <MyBox
                isLoading={loadingAppId === app._id}
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
                userSelect={'none'}
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
                  if (app.type === AppTypeEnum.folder || app.type === AppTypeEnum.httpPlugin) {
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
                  <Box className={'textEllipsis2'}>{app.intro || '还没写介绍~'}</Box>
                </Box>
                <Flex
                  h={'24px'}
                  alignItems={'center'}
                  justifyContent={'space-between'}
                  fontSize={'mini'}
                  color={'myGray.500'}
                >
                  <HStack spacing={3.5}>
                    {owner && (
                      <HStack spacing={1}>
                        <Avatar src={owner.avatar} w={'0.875rem'} borderRadius={'50%'} />
                        <Box maxW={'150px'} className="textEllipsis">
                          {owner.memberName}
                        </Box>
                      </HStack>
                    )}

                    <PermissionIconText
                      defaultPermission={app.defaultPermission}
                      color={'myGray.500'}
                      iconColor={'myGray.400'}
                      w={'0.875rem'}
                    />
                  </HStack>

                  <HStack>
                    {isPc && (
                      <HStack spacing={0.5} className="time">
                        <MyIcon name={'history'} w={'0.85rem'} color={'myGray.400'} />
                        <Box color={'myGray.500'}>{formatTimeToChatTime(app.updateTime)}</Box>
                      </HStack>
                    )}
                    {app.permission.hasManagePer && (
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
                            {
                              children: [
                                {
                                  icon: 'edit',
                                  label: '编辑信息',
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
                                ...(folderDetail?.type === AppTypeEnum.httpPlugin
                                  ? []
                                  : [
                                      {
                                        icon: 'common/file/move',
                                        label: t('common.folder.Move to'),
                                        onClick: () => setMoveAppId(app._id)
                                      }
                                    ]),
                                ...(app.permission.hasManagePer
                                  ? [
                                      {
                                        icon: 'support/team/key',
                                        label: t('permission.Permission'),
                                        onClick: () => setEditPerAppIndex(index)
                                      }
                                    ]
                                  : [])
                              ]
                            },
                            {
                              children: [
                                {
                                  icon: 'copy',
                                  label: appT('Copy one app'),
                                  onClick: () =>
                                    openConfirmCopy(() => onclickCopy({ appId: app._id }))()
                                }
                              ]
                            },
                            ...([AppTypeEnum.simple, AppTypeEnum.workflow].includes(app.type)
                              ? [
                                  {
                                    children: [
                                      {
                                        icon: 'core/chat/chatLight',
                                        label: appT('Go to chat'),
                                        onClick: () => {
                                          router.push(`/chat?appId=${app._id}`);
                                        }
                                      }
                                    ]
                                  }
                                ]
                              : []),
                            ...(app.permission.isOwner
                              ? [
                                  {
                                    children: [
                                      {
                                        type: 'danger' as 'danger',
                                        icon: 'delete',
                                        label: t('common.Delete'),
                                        onClick: () =>
                                          openConfirmDel(
                                            () => onclickDelApp(app._id),
                                            undefined,
                                            app.type === AppTypeEnum.folder
                                              ? appT('Confirm delete folder tip')
                                              : appT('Confirm Del App Tip')
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
                </Flex>
              </MyBox>
            </MyTooltip>
          );
        })}
      </Grid>

      {myApps.length === 0 && <EmptyTip text={'还没有应用，快去创建一个吧！'} pt={'30vh'} />}

      <DelConfirmModal />
      <ConfirmCopyModal />
      {!!editedApp && (
        <EditResourceModal
          {...editedApp}
          title="应用信息编辑"
          onClose={() => {
            setEditedApp(undefined);
          }}
          onEdit={({ id, ...data }) => onUpdateApp(id, data)}
        />
      )}
      {!!editPerApp && (
        <ConfigPerModal
          avatar={editPerApp.avatar}
          name={editPerApp.name}
          defaultPer={{
            value: editPerApp.defaultPermission,
            defaultValue: AppDefaultPermissionVal,
            onChange: (e) => {
              return onUpdateApp(editPerApp._id, { defaultPermission: e });
            }
          }}
          managePer={{
            permission: editPerApp.permission,
            onGetCollaboratorList: () => getCollaboratorList(editPerApp._id),
            permissionList: AppPermissionList,
            onUpdateCollaborators: ({
              tmbIds,
              permission
            }: {
              tmbIds: string[];
              permission: number;
            }) => {
              return postUpdateAppCollaborators({
                tmbIds,
                permission,
                appId: editPerApp._id
              });
            },
            onDelOneCollaborator: (tmbId: string) =>
              deleteAppCollaborators({
                appId: editPerApp._id,
                tmbId
              })
          }}
          onClose={() => setEditPerAppIndex(undefined)}
        />
      )}
      {!!editHttpPlugin && (
        <HttpEditModal
          defaultPlugin={editHttpPlugin}
          onClose={() => setEditHttpPlugin(undefined)}
        />
      )}
    </>
  );
};

export default ListItem;
