import React, { useCallback, useMemo, useState } from 'react';
import { Box, Grid, IconButton, HStack, type UseToastOptions, Flex } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Avatar from '@fastgpt/web/components/common/Avatar';
import PermissionIconText from '@/components/support/permission/IconText';
import { useTranslation } from 'next-i18next';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useContextSelector } from 'use-context-selector';
import { AppListContext } from './context';
import {
  AppFolderTypeList,
  AppTypeEnum,
  AppTypeList,
  ToolTypeList
} from '@fastgpt/global/core/app/constants';
import type { EditResourceInfoFormType } from '@/components/common/Modal/EditResourceModal';
import MyMenu, { type MenuItemType } from '@fastgpt/web/components/common/MyMenu';
import AppTypeTag from './TypeTag';
import { formatTimeToChatTime } from '@fastgpt/global/common/string/time';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import UserBox from '@fastgpt/web/components/common/UserBox';
import { ChatSidebarPaneEnum } from '@/pageComponents/chat/constants';
import { type AppListItemType } from '@fastgpt/global/core/app/type';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import dynamic from 'next/dynamic';

const ExportConfigPopover = dynamic(() => import('./ExportConfigPopover'));

type OpenConfirmFn = (params: {
  onConfirm?: Function;
  onCancel?: any;
  customContent?: string | React.ReactNode;
  inputConfirmText?: string;
}) => () => void;

export type AppCardProps = {
  app: AppListItemType;
  parentApp: AppListItemType | undefined;
  getBoxProps: (params: { dataId: string; isFolder: boolean }) => Record<string, any>;
  setEditedApp: (app: EditResourceInfoFormType) => void;
  setEditPerAppId: (id: string) => void;
  setExportSkillApp: (app: { id: string; name: string; intro?: string }) => void;
  openConfirmDel: OpenConfirmFn;
  openConfirmCopy: OpenConfirmFn;
  onclickDelApp: (id: string) => Promise<any>;
  onclickCopy: (params: { appId: string }) => Promise<any>;
  toast: (params: UseToastOptions) => void;
};

const AppCard = React.memo(function AppCard({
  app,
  parentApp,
  getBoxProps,
  setEditedApp,
  setEditPerAppId,
  setExportSkillApp,
  openConfirmDel,
  openConfirmCopy,
  onclickDelApp,
  onclickCopy,
  toast
}: AppCardProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { isPc } = useSystem();
  const { folderDetail, setMoveAppId, setSearchKey } = useContextSelector(AppListContext, (v) => v);

  const [isHovered, setIsHovered] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleOpenExportSkill = useCallback(() => {
    setIsMenuOpen(false);
    setExportSkillApp({
      id: app._id,
      name: app.name,
      intro: app.intro
    });
  }, [app._id, app.name, app.intro, setExportSkillApp]);

  const isAgent = AppTypeList.includes(app.type);
  const isTool = ToolTypeList.includes(app.type);
  const isFolder = AppFolderTypeList.includes(app.type);

  const hasBtnPer = AppFolderTypeList.includes(app.type)
    ? app.permission.hasManagePer
    : app.permission.hasWritePer || app.permission.hasReadChatLogPer;

  const menuList = useMemo(
    () => [
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
                !(parentApp ? parentApp.permission : app.permission).hasManagePer
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
                ...([AppTypeEnum.simple, AppTypeEnum.workflow, AppTypeEnum.assistant].includes(
                  app.type
                )
                  ? [
                      {
                        icon: 'core/skill/skill',
                        type: 'grayBg' as MenuItemType,
                        label: t('skill:export_as_skill'),
                        onClick: handleOpenExportSkill
                      },
                      {
                        type: 'grayBg' as MenuItemType,
                        label: (
                          <Flex>
                            <ExportConfigPopover appName={app.name} appId={app._id} />
                          </Flex>
                        )
                      }
                    ]
                  : []),
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
                        if (isFolder) return t('app:confirm_delete_folder_tip');
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
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [app, folderDetail, parentApp, isFolder, isAgent, isTool]
  );

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
        borderRadius={'8px'}
        position={'relative'}
        display={'flex'}
        flexDirection={'column'}
        onMouseEnter={() => {
          setIsHovered(true);
        }}
        onMouseLeave={() => setIsHovered(false)}
        _hover={{
          borderColor: 'primary.300',
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
          <Box
            color={'myGray.900'}
            fontWeight={'medium'}
            minWidth={0}
            overflow="hidden"
            lineHeight={'24px'}
          >
            <Box className={'textEllipsis'}>{app.name}</Box>
          </Box>
          <Box justifySelf="end" mr={-5} display={'flex'} alignItems={'center'}>
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
            {hasBtnPer && (isHovered || !isPc) && (
              <Box display={'flex'} onClick={(e) => e.stopPropagation()}>
                <MyMenu
                  Button={
                    <IconButton
                      size={'xsSquare'}
                      variant={'transparentBase'}
                      icon={<MyIcon name={'more'} w={'0.875rem'} color={'myGray.500'} />}
                      aria-label={''}
                    />
                  }
                  menuList={menuList}
                  isOpen={isMenuOpen}
                  onOpenChange={setIsMenuOpen}
                />
              </Box>
            )}
          </HStack>
        </HStack>
      </MyBox>
    </MyTooltip>
  );
});

export default AppCard;
