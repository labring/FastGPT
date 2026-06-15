import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Grid,
  IconButton,
  HStack,
  type UseToastOptions,
  Flex,
  Spacer
} from '@chakra-ui/react';
import { useRouter } from 'next/router';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Avatar from '@fastgpt/web/components/common/Avatar';
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
import { ChatSidebarPaneEnum } from '@/pageComponents/chat/constants';
import { type AppListItemType } from '@fastgpt/global/core/app/type';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyPopover from '@fastgpt/web/components/common/MyPopover';
import dynamic from 'next/dynamic';
import { getAppsByToolId } from '@/web/core/app/api';
import type { AppsByToolIdItem } from '@/pages/api/core/app/appsByToolId';

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

// ─── RelatedAppsContent ───────────────────────────────────────────────────────

const RELATED_APPS_MAX_H = '248px';

const RelatedAppsContent = ({ appId }: { appId: string }) => {
  const { t } = useTranslation();
  const [apps, setApps] = useState<AppsByToolIdItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getAppsByToolId(appId)
      .then(setApps)
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [appId]);

  return (
    <MyBox isLoading={isLoading} minH={isLoading ? '80px' : 'auto'} px={'14px'} py={'8px'}>
      <Box maxH={RELATED_APPS_MAX_H} overflowY={'auto'}>
        {apps.map((relatedApp, index) => (
          <Box key={relatedApp._id}>
            {index > 0 && <Box h={'1px'} bg={'#E8EBF0'} my={'8px'} />}
            <Flex h={'36px'} px={'8px'} align={'center'} justify={'space-between'}>
              <Flex align={'center'} gap={'8px'} overflow={'hidden'}>
                <Avatar
                  src={relatedApp.avatar}
                  w={'20px'}
                  h={'20px'}
                  borderRadius={'sm'}
                  flexShrink={0}
                />
                <Box
                  fontSize={'14px'}
                  fontWeight={'600'}
                  lineHeight={'20px'}
                  color={'#333'}
                  overflow={'hidden'}
                  textOverflow={'ellipsis'}
                  whiteSpace={'nowrap'}
                >
                  {relatedApp.name}
                </Box>
              </Flex>
              {relatedApp.sourceMember && (
                <HStack spacing={'4px'} flexShrink={0} ml={'8px'}>
                  <MyIcon name={'common/user'} w={'16px'} color={'#B4B9BF'} />
                  <Box
                    color={'#999'}
                    maxW={'80px'}
                    overflow={'hidden'}
                    textOverflow={'ellipsis'}
                    whiteSpace={'nowrap'}
                    fontSize={'xs'}
                  >
                    {relatedApp.sourceMember.name}
                  </Box>
                </HStack>
              )}
            </Flex>
          </Box>
        ))}
      </Box>
    </MyBox>
  );
};

const RelatedAppsPopover = ({ appId, count }: { appId: string; count: number }) => {
  const { t } = useTranslation();

  return (
    <MyPopover
      trigger={'hover'}
      placement={'bottom-start'}
      w={'260px'}
      p={0}
      border={'none'}
      boxShadow={'0 4px 16px 0 #E8EBF0'}
      Trigger={
        <HStack spacing={'4px'} cursor={'pointer'}>
          <Box color={'#666'} fontSize={'mini'}>
            {t('app:related_agent')}
          </Box>
          <Box color={'#333'} fontWeight={'bold'} fontSize={'sm'}>
            {count}
          </Box>
        </HStack>
      }
    >
      {() => <RelatedAppsContent appId={appId} />}
    </MyPopover>
  );
};

// ─── AppCard ──────────────────────────────────────────────────────────────────

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
  const folderDetail = useContextSelector(AppListContext, (v) => v.folderDetail);
  const setMoveAppId = useContextSelector(AppListContext, (v) => v.setMoveAppId);
  const setSearchKey = useContextSelector(AppListContext, (v) => v.setSearchKey);
  const onUpdateApp = useContextSelector(AppListContext, (v) => v.onUpdateApp);

  const [isHovered, setIsHovered] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const isAgent = AppTypeList.includes(app.type);
  const isTool = ToolTypeList.includes(app.type);
  const isFolder = AppFolderTypeList.includes(app.type);

  const relatedAppCount = app.relatedAppCount;

  const handleOpenExportSkill = useCallback(() => {
    setIsMenuOpen(false);
    setExportSkillApp({
      id: app._id,
      name: app.name,
      intro: app.intro
    });
  }, [app._id, app.name, app.intro, setExportSkillApp]);

  const hasBtnPer = AppFolderTypeList.includes(app.type)
    ? app.permission.hasManagePer
    : app.permission.hasWritePer || app.permission.hasReadChatLogPer;

  const menuList = useMemo(
    () => [
      ...([AppTypeEnum.simple, AppTypeEnum.workflow, AppTypeEnum.assistant].includes(app.type)
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
                  icon: 'core/chat/setTopLight',
                  type: 'grayBg' as MenuItemType,
                  label: app.isPinned ? t('common:core.chat.Unpin') : t('common:core.chat.Pin'),
                  onClick: () => onUpdateApp(app._id, { isPinned: !app.isPinned })
                },
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
                ...([
                  AppTypeEnum.simple,
                  AppTypeEnum.workflow,
                  AppTypeEnum.assistant,
                  AppTypeEnum.chatAgent
                ].includes(app.type)
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
                  disabled:
                    (isTool && !isFolder && (relatedAppCount ?? 0) > 0) ||
                    (app.type === AppTypeEnum.toolFolder && (relatedAppCount ?? 0) > 0),
                  disabledTip:
                    app.type === AppTypeEnum.toolFolder && (relatedAppCount ?? 0) > 0
                      ? t('app:folder_delete_disabled_tip')
                      : isTool && !isFolder && (relatedAppCount ?? 0) > 0
                        ? t('common:delete_disabled_by_related_apps')
                        : undefined,
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

  const updateTimeStr = app.updateTime
    ? t(formatTimeToChatTime(new Date(app.updateTime)) as any).replace('#', ':')
    : '';

  const updateTimeFullStr = app.updateTime
    ? (() => {
        const d = new Date(app.updateTime);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      })()
    : '';

  return (
    <MyBox
      display={'flex'}
      flexDirection={'column'}
      h={'140px'}
      pt={'18px'}
      pb={4}
      px={5}
      cursor={'pointer'}
      bg={'white'}
      borderRadius={'8px'}
      position={'relative'}
      boxShadow={'0 0 0 1px #EBEDF0'}
      _hover={{
        boxShadow: '0 0 0 2px #91BBF2',
        zIndex: 1,
        '& .more': {
          visibility: 'visible',
          opacity: 1
        },
        '& .type-tag': {
          visibility: 'hidden',
          opacity: 0
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
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      {...getBoxProps({
        dataId: app._id,
        isFolder: app.type === AppTypeEnum.folder || app.type === AppTypeEnum.toolFolder
      })}
    >
      {/* 标题行：头像 + 名称 + 类型标签/菜单按钮 */}
      <Flex alignItems={'center'} gap={2}>
        <Avatar src={app.avatar} borderRadius={6} w={'28px'} flexShrink={0} />
        <Flex width="0" flex="1" alignItems="center" gap={1} overflow="hidden">
          <Box
            className="textEllipsis"
            color={'myGray.900'}
            fontWeight={'medium'}
            flexShrink={1}
            minW={0}
          >
            {app.name}
          </Box>
          {app.isPinned && (
            <Box
              flexShrink={0}
              borderRadius={'355.67px'}
              color="blue.600"
              bg="blue.50"
              height="16px"
              fontSize="12px"
              px={2}
              lineHeight="16px"
            >
              {t('common:core.chat.Pin')}
            </Box>
          )}
        </Flex>
        {/* 右侧：类型 tag 和菜单按钮叠加切换 */}
        <Box flexShrink={0} position={'relative'}>
          <Box className="type-tag">
            <AppTypeTag type={app.type} />
          </Box>
          {hasBtnPer && (
            <Box
              className="more"
              position={'absolute'}
              right={0}
              top={'50%'}
              transform={'translateY(-50%)'}
              visibility={'hidden'}
              opacity={0}
              onClick={(e) => e.stopPropagation()}
            >
              <MyMenu
                Button={
                  <IconButton
                    size={'xsSquare'}
                    variant={'whitePrimary'}
                    icon={<MyIcon name={'more'} w={'12px'} color={'myGray.500'} />}
                    aria-label={''}
                  />
                }
                menuList={menuList}
                isOpen={isMenuOpen}
                onOpenChange={setIsMenuOpen}
              />
            </Box>
          )}
        </Box>
      </Flex>

      {/* 描述 */}
      {app.intro && (
        <Box
          flex={'1 0 40px'}
          mt={'10px'}
          textAlign={'justify'}
          wordBreak={'break-all'}
          fontSize={'xs'}
          color={'#666'}
        >
          <Box className={'textEllipsis2'} whiteSpace={'pre-wrap'} lineHeight={'20px'}>
            {app.intro}
          </Box>
        </Box>
      )}

      {/* 底部行 */}
      <HStack
        h={'24px'}
        fontSize={'mini'}
        color={'myGray.500'}
        w="full"
        mt={app.intro ? 2 : 'auto'}
        pt={app.intro ? 0 : 3}
      >
        {/* Tool 场景左侧：关联 Agent 数量 */}
        {isTool && !isFolder ? (
          <Box onClick={(e) => e.stopPropagation()}>
            {relatedAppCount !== undefined && relatedAppCount > 0 ? (
              <RelatedAppsPopover appId={app._id} count={relatedAppCount} />
            ) : (
              <HStack spacing={'4px'}>
                <Box color={'#666'} fontSize={'mini'}>
                  {t('app:related_agent')}
                </Box>
                <Box color={'#333'} fontWeight={'bold'} fontSize={'sm'}>
                  {relatedAppCount ?? 0}
                </Box>
              </HStack>
            )}
          </Box>
        ) : (
          /* Agent 场景左侧：创建人 + 更新时间 */
          <HStack spacing={'12px'}>
            {app.sourceMember?.name && (
              <MyTooltip label={t('common:creator_tooltip', { creator: app.sourceMember.name })}>
                <HStack spacing={'4px'}>
                  <MyIcon name={'common/user'} w={'16px'} color={'#B4B9BF'} />
                  <Box
                    color={'#999'}
                    maxW={'60px'}
                    lineHeight={'16px'}
                    overflow={'hidden'}
                    textOverflow={'ellipsis'}
                    whiteSpace={'nowrap'}
                  >
                    {app.sourceMember.name}
                  </Box>
                </HStack>
              </MyTooltip>
            )}
            {app.updateTime && (
              <MyTooltip label={t('common:update_time_tooltip', { updateTime: updateTimeFullStr })}>
                <HStack spacing={'4px'}>
                  <MyIcon name={'history'} w={'14px'} color={'#B4B9BF'} />
                  <Box color={'#999'}>{updateTimeStr}</Box>
                </HStack>
              </MyTooltip>
            )}
          </HStack>
        )}

        <Spacer />

        {/* Tool 场景右侧：创建人 + 更新时间 */}
        {isTool && !isFolder && (
          <HStack spacing={'12px'}>
            {app.sourceMember?.name && (
              <MyTooltip label={t('common:creator_tooltip', { creator: app.sourceMember.name })}>
                <HStack spacing={'4px'}>
                  <MyIcon name={'common/user'} w={'16px'} color={'#B4B9BF'} />
                  <Box
                    color={'#999'}
                    maxW={'60px'}
                    lineHeight={'16px'}
                    overflow={'hidden'}
                    textOverflow={'ellipsis'}
                    whiteSpace={'nowrap'}
                  >
                    {app.sourceMember.name}
                  </Box>
                </HStack>
              </MyTooltip>
            )}
            {app.updateTime && (
              <MyTooltip label={t('common:update_time_tooltip', { updateTime: updateTimeFullStr })}>
                <HStack spacing={'4px'}>
                  <MyIcon name={'history'} w={'14px'} color={'#B4B9BF'} />
                  <Box color={'#999'}>{updateTimeStr}</Box>
                </HStack>
              </MyTooltip>
            )}
          </HStack>
        )}
      </HStack>
    </MyBox>
  );
});

export default AppCard;
