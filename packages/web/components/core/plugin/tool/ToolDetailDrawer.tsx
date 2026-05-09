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
  VStack,
  Accordion
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import Avatar from '../../../common/Avatar';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import MyIconButton from '../../../common/Icon/button';
import MyIcon from '../../../common/Icon';
import MyMenu from '../../../common/MyMenu';
import LightRowTabs from '../../../common/Tabs/LightRowTabs';
import { type ToolCardItemType } from './ToolCard';
import MyBox from '../../../common/MyBox';
import Markdown from '../../../common/Markdown';
import { useRequest } from '../../../../hooks/useRequest';
import {
  ParamSection,
  SubToolAccordionItem,
  useToolDetail,
  drawerScrollbarStyles,
  type ToolDetailFetchResponse,
  type ToolDetailVersionType
} from './ToolDetail';

const ToolDetailDrawer = ({
  onClose,
  selectedTool,
  onToggleInstall,
  onUpdate,
  isUpdating,
  systemTitle,
  onFetchDetail,
  onFetchVersions,
  isLoading,
  showPoint,
  mode,
  showActionButton = true
}: {
  onClose: () => void;
  selectedTool: ToolCardItemType;
  onToggleInstall?: (installed: boolean, version?: string) => void | Promise<void>;
  onUpdate?: (version?: string) => void;
  isUpdating?: boolean;
  systemTitle?: string;
  onFetchDetail?: (toolId: string, version?: string) => Promise<ToolDetailFetchResponse>;
  onFetchVersions?: (toolId: string) => Promise<ToolDetailVersionType[]>;
  isLoading?: boolean;
  showPoint: boolean;
  mode: 'admin' | 'team' | 'marketplace';
  showActionButton?: boolean;
}) => {
  const { t, i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState<'guide' | 'params'>('params');
  const [isInstalled, setIsInstalled] = useState(selectedTool.installed);
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
  }, [selectedTool.id]);

  useEffect(() => {
    if (!selectedVersion && toolVersions[0]?.version) {
      setSelectedVersion(toolVersions[0].version);
    }
  }, [selectedVersion, toolVersions]);

  // Use tool detail hook
  const { parentTool, isToolSet, subTools, readmeContent, loadingDetail } = useToolDetail({
    toolId: selectedTool.id,
    version: selectedVersion,
    tags: selectedTool.tags || undefined,
    onFetchDetail
  });

  const currentVersion = selectedVersion || parentTool?.version || selectedTool.version;

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
                      onClick: () => setSelectedVersion(item.version)
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
          <MyBox>
            <Flex gap={2} flexWrap="wrap">
              {parentTool?.tags?.map((tag: string) => (
                <Box
                  key={tag}
                  px={2}
                  py={1}
                  border={'1px solid'}
                  borderRadius={'6px'}
                  borderColor={'myGray.200'}
                  fontSize={'10px'}
                  fontWeight={'medium'}
                  color={'myGray.700'}
                >
                  {tag}
                </Box>
              ))}
            </Flex>
            <Box fontSize={'12px'} color="myGray.500" mt={3}>
              {parseI18nString(parentTool?.description || '', i18n.language)}
            </Box>
            <Box fontSize={'12px'} color="myGray.500" mt={3}>
              {`by ${parentTool?.author || systemTitle || 'FastGPT'}`}
            </Box>
            {(showActionButton || (selectedTool.update && onUpdate && mode !== 'marketplace')) && (
              <Flex mt={3} gap={2}>
                {/* Determine if we have two buttons */}
                {(() => {
                  const hasUpdateButton = selectedTool.update && onUpdate && mode !== 'marketplace';

                  return (
                    <>
                      {showActionButton && (
                        <Button
                          flex={1}
                          variant={isInstalled ? 'primaryOutline' : 'primary'}
                          isLoading={isLoading || loadingDetail}
                          isDisabled={isUpdating}
                          onClick={async () => {
                            await onToggleInstall?.(!isInstalled, currentVersion);
                            if (mode === 'marketplace') return;
                            setIsInstalled(!isInstalled);
                          }}
                        >
                          {isDownload
                            ? t('common:Download')
                            : isInstalled
                              ? t('app:toolkit_uninstall')
                              : t('app:toolkit_install')}
                        </Button>
                      )}
                      {hasUpdateButton && (
                        <Button
                          variant="primary"
                          flex={1}
                          isLoading={isUpdating || loadingDetail}
                          onClick={() => onUpdate?.(currentVersion)}
                        >
                          {t('app:custom_plugin_update')}
                        </Button>
                      )}
                    </>
                  );
                })()}
              </Flex>
            )}

            {showPoint && (
              <Flex mt={4} gap={1.5} alignItems={'center'}>
                <Box fontWeight={'medium'} fontSize={'14px'} color={'myGray.900'}>
                  {t('app:toolkit_call_points_label')}
                </Box>
                <Box fontSize={'12px'} color={'myGray.600'}>
                  {!!parentTool?.currentCost
                    ? parentTool?.currentCost
                    : t('app:toolkit_no_call_points')}
                </Box>
              </Flex>
            )}

            <Flex mt={4} gap={1.5} alignItems={'center'}>
              <Box fontWeight={'medium'} fontSize={'14px'} color={'myGray.900'}>
                {t('app:toolkit_activation_label')}
              </Box>
              <Box fontSize={'12px'} color={'myGray.600'}>
                {parentTool?.hasSystemSecret ||
                (parentTool?.secrets && parentTool?.secrets.length > 0) ||
                (parentTool?.secretInputConfig && parentTool?.secretInputConfig.length > 0) ||
                (parentTool?.inputList && parentTool?.inputList.length > 0)
                  ? t('app:toolkit_activation_required')
                  : t('app:toolkit_activation_not_required')}
              </Box>
            </Flex>

            <Box mt={4}>
              <LightRowTabs
                list={[
                  {
                    label: isToolSet
                      ? t('app:toolkit_tool_list')
                      : t('app:toolkit_params_description'),
                    value: 'params'
                  },
                  ...(parentTool?.courseUrl || parentTool?.readme || parentTool?.userGuide
                    ? [{ label: t('app:toolkit_user_guide'), value: 'guide' }]
                    : [])
                ]}
                value={activeTab}
                onChange={(value) => {
                  if (value === 'guide' && parentTool?.courseUrl) {
                    window.open(parentTool?.courseUrl, '_blank');
                  } else {
                    setActiveTab(value as 'guide' | 'params');
                  }
                }}
                gap={4}
              />
              <Box h={'1px'} w={'full'} bg={'myGray.200'} mt={'-5px'} mx={1} />
            </Box>

            <Box mt={4}>
              {activeTab === 'guide' && (
                <VStack align="stretch" spacing={4} flex="1" minH="0">
                  {(readmeContent || parentTool?.userGuide) && (
                    <Box
                      px={4}
                      py={3}
                      border="1px solid"
                      borderColor="myGray.200"
                      borderRadius="md"
                      bg="myGray.50"
                      fontSize="sm"
                      color="myGray.900"
                      flex="1"
                      overflowY="auto"
                    >
                      <Markdown source={readmeContent || parentTool?.userGuide || ''} />
                    </Box>
                  )}
                </VStack>
              )}

              {activeTab === 'params' && (
                <VStack align="stretch" spacing={4}>
                  {isToolSet && subTools.length > 0 && (
                    <Accordion
                      allowMultiple
                      {...(subTools.length === 1 ? { defaultIndex: [0] } : {})}
                    >
                      {subTools.map((subTool) => (
                        <SubToolAccordionItem key={subTool.pluginId} tool={subTool} />
                      ))}
                    </Accordion>
                  )}

                  {!isToolSet && (
                    <>
                      {parentTool?.versionList?.[0]?.inputs &&
                        parentTool?.versionList?.[0]?.inputs.length > 0 && (
                          <ParamSection
                            title={t('app:toolkit_inputs')}
                            params={parentTool?.versionList?.[0]?.inputs}
                          />
                        )}
                      {parentTool?.versionList?.[0]?.outputs &&
                        parentTool?.versionList?.[0]?.outputs.length > 0 && (
                          <ParamSection
                            title={t('app:toolkit_outputs')}
                            params={parentTool?.versionList?.[0]?.outputs}
                          />
                        )}
                    </>
                  )}
                </VStack>
              )}
            </Box>
          </MyBox>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
};

export default React.memo(ToolDetailDrawer);
