import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  DrawerOverlay,
  Flex
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
  onVersionChange?: (version: string) => void;
  isLoading?: boolean;
  showPoint: boolean;
  mode: 'admin' | 'team' | 'marketplace';
  installedVersion?: string;
  showActionButton?: boolean;
}) => {
  const { t, i18n } = useTranslation();
  const isInstalled = selectedTool.installed;
  const [selectedVersion, setSelectedVersion] = useState<string | undefined>(selectedTool.version);

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

  const activeVersion = selectedVersion || toolVersions[0]?.version;

  // Use tool detail hook
  const { parentTool, isToolSet, subTools, readmeContent, loadingDetail } = useToolDetail({
    toolId: selectedTool.id,
    version: activeVersion,
    tags: selectedTool.tags || undefined,
    onFetchDetail
  });

  const currentVersion = activeVersion || parentTool?.version || selectedTool.version;
  const isCurrentVersionInstalled = installedVersion
    ? installedVersion === currentVersion
    : !!isInstalled;
  const isLatestVersionSelected = currentVersion === selectedTool.version;
  const hasUpdateButton =
    !!isInstalled &&
    !!onUpdate &&
    mode !== 'marketplace' &&
    isLatestVersionSelected &&
    (!!selectedTool.update || (!!installedVersion && installedVersion !== currentVersion));
  const showInstallButton = showActionButton && !isCurrentVersionInstalled && !hasUpdateButton;
  const showUninstallButton = mode === 'admin' && !!isInstalled && !!onDelete && !showInstallButton;

  return (
    <Drawer isOpen={true} onClose={onClose} placement="right">
      <DrawerOverlay />
      <DrawerContent maxW="480px" borderLeftRadius="md">
        <DrawerHeader pt={6} pb={1}>
          <Flex gap={1.5}>
            <Avatar src={parentTool?.icon || ''} borderRadius={'md'} w={6} />
            <Box fontSize={'16px'} fontWeight={500} color={'myGray.900'}>
              {parseI18nString(parentTool?.name || '', i18n.language)}
            </Box>
            <Box flex={1} />
            {toolVersions.length > 0 && (
              <MyMenu
                trigger="hover"
                placement="bottom-end"
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
                    <Box fontSize={'12px'}>{currentVersion || t('common:Version')}</Box>
                    <MyIcon name="core/chat/chevronDown" w={4} />
                  </Flex>
                }
                menuList={[
                  {
                    children: toolVersions.map((item) => ({
                      label: item.version,
                      description: item.versionDescription,
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
            <MyIconButton icon={'common/closeLight'} onClick={onClose} />
          </Flex>
        </DrawerHeader>

        <DrawerBody position="relative" sx={drawerScrollbarStyles}>
          <ToolDetailBody
            parentTool={parentTool}
            isToolSet={isToolSet}
            subTools={subTools}
            readmeContent={readmeContent}
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
                      isLoading={isLoading || loadingDetail}
                      isDisabled={isUpdating}
                      onClick={async () => {
                        await onToggleInstall?.(!isCurrentVersionInstalled, currentVersion);
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
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
};

export default React.memo(ToolDetailDrawer);
