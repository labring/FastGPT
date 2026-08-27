import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  DrawerOverlay,
  Flex,
  Skeleton,
  SkeletonText,
  VStack
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import Avatar from '../../../common/Avatar';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import MyIconButton from '../../../common/Icon/button';
import MyIcon from '../../../common/Icon';
import MyMenu from '../../../common/MyMenu';
import { type ToolCardItemType } from './ToolCard';
import { useRequest } from '../../../../hooks/useRequest';
import {
  ToolDetailBody,
  useToolDetail,
  drawerScrollbarStyles,
  type ToolDetailFetchResponse,
  type ToolDetailVersionType
} from './ToolDetail';
import { isToolVersionInstalled } from './utils';

const ToolDetailHeaderSkeleton = () => (
  <Flex alignItems={'center'} gap={1.5} flex={1}>
    <Skeleton w={6} h={6} borderRadius={'md'} flexShrink={0} />
    <Skeleton w={'160px'} h={5} borderRadius={'sm'} />
    <Box flex={1} />
    <Skeleton w={'64px'} h={7} borderRadius={'md'} />
  </Flex>
);

const ToolDetailBodySkeleton = () => (
  <VStack align={'stretch'} spacing={4} pt={1}>
    <Flex gap={2}>
      <Skeleton w={'52px'} h={6} borderRadius={'6px'} />
      <Skeleton w={'68px'} h={6} borderRadius={'6px'} />
      <Skeleton w={'44px'} h={6} borderRadius={'6px'} />
    </Flex>
    <SkeletonText noOfLines={2} spacing={2} skeletonHeight={3} />
    <Skeleton w={'96px'} h={3} borderRadius={'sm'} />
    <Skeleton w={'full'} h={10} borderRadius={'sm'} />
    <Flex gap={3}>
      <Skeleton w={'80px'} h={4} borderRadius={'sm'} />
      <Skeleton w={'120px'} h={4} borderRadius={'sm'} />
    </Flex>
    <Skeleton w={'180px'} h={8} borderRadius={'sm'} />
    <SkeletonText noOfLines={6} spacing={3} skeletonHeight={3} />
  </VStack>
);

const ToolDetailDrawer = ({
  onClose,
  selectedTool,
  onToggleInstall,
  onDelete,
  onUpdate,
  isUpdating,
  systemTitle,
  onFetchDetail,
  onFetchVersions,
  onFetchInstalledVersions,
  onVersionChange,
  isLoading,
  showPoint,
  mode,
  installedVersion,
  showActionButton = true
}: {
  onClose: () => void;
  selectedTool: ToolCardItemType;
  onToggleInstall?: (installed: boolean, version?: string) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
  onUpdate?: (version?: string) => void | Promise<void>;
  isUpdating?: boolean;
  systemTitle?: string;
  onFetchDetail?: (toolId: string, version?: string) => Promise<ToolDetailFetchResponse>;
  onFetchVersions?: (toolId: string) => Promise<ToolDetailVersionType[]>;
  onFetchInstalledVersions?: (toolId: string) => Promise<ToolDetailVersionType[]>;
  onVersionChange?: (version: string) => void;
  isLoading?: boolean;
  showPoint: boolean;
  mode: 'admin' | 'team' | 'marketplace';
  installedVersion?: string;
  showActionButton?: boolean;
}) => {
  const { t, i18n } = useTranslation();
  const isInstalled = selectedTool.installed;
  const [selectedVersion, setSelectedVersion] = useState<string>();

  const isDownload = useMemo(() => {
    return mode === 'marketplace';
  }, [mode]);

  const {
    data: toolVersions = [],
    loading: loadingVersions,
    run: fetchToolVersions
  } = useRequest(
    async (toolId: string) => {
      if (!onFetchVersions) return [];
      return onFetchVersions(toolId);
    },
    {
      manual: true,
      errorToast: ''
    }
  );

  useEffect(() => {
    if (selectedTool.id && onFetchVersions) {
      fetchToolVersions(selectedTool.id);
    }
  }, [fetchToolVersions, onFetchVersions, selectedTool.id]);

  const {
    data: installedToolVersions,
    loading: loadingInstalledVersions,
    runAsync: fetchInstalledToolVersions
  } = useRequest(
    async (toolId: string) => {
      if (!onFetchInstalledVersions) return [];
      return onFetchInstalledVersions(toolId);
    },
    {
      manual: true,
      errorToast: ''
    }
  );

  useEffect(() => {
    if (selectedTool.id && onFetchInstalledVersions) {
      fetchInstalledToolVersions(selectedTool.id);
    }
  }, [fetchInstalledToolVersions, onFetchInstalledVersions, selectedTool.id]);

  // 未指定版本时由详情接口解析最新版本，避免版本列表返回后再次请求同一份详情。
  const activeVersion = selectedVersion;

  // Use tool detail hook
  const {
    parentTool,
    isToolSet,
    subTools,
    readmeContent,
    loadingDetail,
    loadingReadme,
    detailReady,
    detailError,
    refreshDetail
  } = useToolDetail({
    toolId: selectedTool.id,
    version: activeVersion,
    tags: selectedTool.tags || undefined,
    onFetchDetail
  });

  const currentVersion =
    parentTool?.version || activeVersion || toolVersions[0]?.version || selectedTool.version;
  const currentVersionLabel =
    toolVersions.find((item) => item.version === currentVersion)?.versionDescription ??
    currentVersion;
  const contentReady = detailReady && !loadingVersions;
  const isCurrentVersionInstalled = isToolVersionInstalled({
    isInstalled: !!isInstalled,
    currentVersion,
    installedVersions: installedToolVersions?.map((item) => item.version),
    installedVersion
  });
  const isLatestVersionSelected =
    currentVersion === (toolVersions[0]?.version ?? selectedTool.version);
  const hasUpdateButton =
    !!isInstalled &&
    !!onUpdate &&
    mode !== 'marketplace' &&
    isLatestVersionSelected &&
    (!!selectedTool.update || (!!installedVersion && installedVersion !== currentVersion));
  const showInstallButton = showActionButton && !isCurrentVersionInstalled && !hasUpdateButton;
  const showUninstallButton =
    (mode === 'admin' || mode === 'team') && !!isInstalled && !!onDelete && !showInstallButton;

  return (
    <Drawer isOpen={true} onClose={onClose} placement="right">
      <DrawerOverlay />
      <DrawerContent maxW="480px" borderLeftRadius="md">
        <DrawerHeader pt={6} pb={1}>
          <Flex gap={1.5}>
            {!contentReady && !detailError ? (
              <ToolDetailHeaderSkeleton />
            ) : (
              <>
                <Avatar src={parentTool?.icon || ''} borderRadius={'md'} w={6} />
                <Box fontSize={'16px'} fontWeight={500} color={'myGray.900'}>
                  {parseI18nString(parentTool?.name || '', i18n.language)}
                </Box>
                <Box flex={1} />
                {toolVersions.length > 0 && (
                  <MyMenu
                    trigger="click"
                    placement="bottom-end"
                    menuListProps={{ maxH: '60vh', overflowY: 'auto' }}
                    Button={
                      <Flex
                        alignItems={'center'}
                        gap={1}
                        px={2}
                        h={7}
                        border={'1px solid'}
                        borderColor={'myGray.200'}
                        borderRadius={'md'}
                        cursor={'pointer'}
                        color={'myGray.700'}
                      >
                        <Box fontSize={'12px'}>{currentVersionLabel || t('common:Version')}</Box>
                        <MyIcon name="core/chat/chevronDown" w={4} />
                      </Flex>
                    }
                    menuList={[
                      {
                        children: toolVersions.map((item) => ({
                          label: item.versionDescription ?? item.version,
                          isActive: item.version === currentVersion,
                          onClick: () => {
                            setSelectedVersion(item.version);
                            onVersionChange?.(item.version);
                          }
                        }))
                      }
                    ]}
                  />
                )}
                {loadingVersions && currentVersion && (
                  <Box fontSize={'12px'} color={'myGray.500'}>
                    {currentVersion}
                  </Box>
                )}
              </>
            )}
            <MyIconButton icon={'common/closeLight'} onClick={onClose} />
          </Flex>
        </DrawerHeader>

        <DrawerBody position="relative" sx={drawerScrollbarStyles}>
          {detailError ? (
            <VStack h={'full'} justify={'center'} spacing={4} pb={20}>
              <Box color={'myGray.500'}>{t('common:load_failed')}</Box>
              <Button variant={'whitePrimary'} onClick={refreshDetail}>
                {t('common:refresh')}
              </Button>
            </VStack>
          ) : !contentReady ? (
            <ToolDetailBodySkeleton />
          ) : (
            <ToolDetailBody
              parentTool={parentTool}
              isToolSet={isToolSet}
              subTools={subTools}
              readmeContent={readmeContent}
              loadingReadme={loadingReadme}
              showPoint={showPoint}
              systemTitle={systemTitle}
              actions={
                (showInstallButton || showUninstallButton || hasUpdateButton) && (
                  <Flex gap={2}>
                    {showInstallButton && (
                      <Button
                        flex={'1 1 0'}
                        minW={0}
                        variant={isCurrentVersionInstalled ? 'primaryOutline' : 'primary'}
                        isLoading={isLoading || loadingDetail || loadingInstalledVersions}
                        isDisabled={isUpdating}
                        onClick={async () => {
                          await onToggleInstall?.(!isCurrentVersionInstalled, currentVersion);
                          if (onFetchInstalledVersions) {
                            await fetchInstalledToolVersions(selectedTool.id);
                          }
                        }}
                      >
                        {isDownload
                          ? t('common:Download')
                          : isCurrentVersionInstalled
                            ? t('app:toolkit_uninstall')
                            : t('app:toolkit_install')}
                      </Button>
                    )}
                    {hasUpdateButton && (
                      <Button
                        variant="primary"
                        flex={'1 1 0'}
                        minW={0}
                        isLoading={isUpdating || loadingDetail}
                        onClick={async () => {
                          await onUpdate?.(currentVersion);
                          if (onFetchInstalledVersions) {
                            await fetchInstalledToolVersions(selectedTool.id);
                          }
                        }}
                      >
                        {t('app:custom_plugin_update')}
                      </Button>
                    )}
                    {showUninstallButton && (
                      <Button
                        flex={hasUpdateButton ? '0 0 62px' : '1 1 0'}
                        minW={0}
                        variant="dangerOutline"
                        isLoading={isLoading || loadingDetail}
                        onClick={() => onDelete?.()}
                      >
                        {t('app:toolkit_uninstall')}
                      </Button>
                    )}
                  </Flex>
                )
              }
            />
          )}
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
};

export default React.memo(ToolDetailDrawer);
