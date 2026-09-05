import React, { useState, useCallback, useEffect } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  DrawerOverlay,
  Flex,
  Grid,
  Spinner,
  VStack
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import Avatar from '../../../common/Avatar';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import MyIconButton from '../../../common/Icon/button';
import { type ToolCardItemType } from './ToolCard';
import MyIcon from '../../../common/Icon';
import MyTooltip from '../../../common/MyTooltip';
import MyMenu from '../../../common/MyMenu';
import { useTableMultipleSelect } from '../../../../hooks/useTableMultipleSelect';
import { useRequest } from '../../../../hooks/useRequest';
import { useToast } from '../../../../hooks/useToast';
import { getErrText } from '@fastgpt/global/common/error/utils';
import {
  ToolDetailBody,
  useToolDetail,
  drawerScrollbarStyles,
  type ToolDetailFetchResponse,
  type ToolDetailVersionType
} from './ToolDetail';

type ViewMode = 'list' | 'detail';

export type BatchUpdateFailure = {
  toolId: string;
  reason: string;
};

type BatchUpdateDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  updatableTools: ToolCardItemType[];
  onBatchUpdate: (toolIds: string[]) => Promise<BatchUpdateFailure[]>;
  onUpdate: (tool: ToolCardItemType, version?: string) => Promise<void>;
  onDelete: (tool: ToolCardItemType) => void | Promise<void>;
  isBatchUpdating: boolean;
  singleUpdatingToolIds?: ReadonlySet<string>;
  deletingToolIds?: ReadonlySet<string>;
  onFetchDetail?: (toolId: string, version?: string) => Promise<ToolDetailFetchResponse>;
  onFetchVersions?: (toolId: string) => Promise<ToolDetailVersionType[]>;
};

const BatchUpdateDrawer: React.FC<BatchUpdateDrawerProps> = ({
  isOpen,
  onClose,
  updatableTools,
  onBatchUpdate,
  onUpdate,
  onDelete,
  isBatchUpdating,
  singleUpdatingToolIds,
  deletingToolIds,
  onFetchDetail,
  onFetchVersions
}) => {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedToolForDetail, setSelectedToolForDetail] = useState<ToolCardItemType | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<string>();
  const [isUpdatingSingle, setIsUpdatingSingle] = useState(false);
  const [failureReasons, setFailureReasons] = useState<Record<string, string>>({});
  const [updatingToolIds, setUpdatingToolIds] = useState<Set<string>>(new Set());

  // Use table multiple select hook
  const {
    selectedItems,
    isSelecteAll,
    selectAllTrigger,
    hasSelections,
    toggleSelect,
    isSelected,
    getRowSelectionProps,
    setSelectedItems
  } = useTableMultipleSelect<ToolCardItemType>({
    list: updatableTools,
    getItemId: (tool: ToolCardItemType) => tool.id
  });

  const {
    data: toolVersionsResult,
    loading: loadingVersions,
    run: fetchToolVersions
  } = useRequest(
    async (toolId: string) => {
      if (!onFetchVersions) return { toolId, versions: [] };
      return { toolId, versions: await onFetchVersions(toolId) };
    },
    {
      manual: true,
      errorToast: ''
    }
  );

  useEffect(() => {
    if (!selectedToolForDetail?.id || !onFetchVersions) return;

    fetchToolVersions(selectedToolForDetail.id);
  }, [fetchToolVersions, onFetchVersions, selectedToolForDetail?.id]);

  const toolVersions =
    toolVersionsResult?.toolId === selectedToolForDetail?.id
      ? (toolVersionsResult?.versions ?? [])
      : [];
  const activeVersion =
    selectedVersion ?? toolVersions[0]?.version ?? selectedToolForDetail?.version;
  const isSelectedToolUpdating = selectedToolForDetail
    ? (singleUpdatingToolIds?.has(selectedToolForDetail.id) ?? false)
    : false;
  const isSelectedToolDeleting = selectedToolForDetail
    ? (deletingToolIds?.has(selectedToolForDetail.id) ?? false)
    : false;
  const isDetailView =
    viewMode === 'detail' &&
    Boolean(
      selectedToolForDetail && updatableTools.some((tool) => tool.id === selectedToolForDetail.id)
    );

  // Use tool detail hook
  const { parentTool, isToolSet, subTools, readmeContent, loadingDetail } = useToolDetail({
    toolId: selectedToolForDetail?.id,
    version: activeVersion,
    tags: selectedToolForDetail?.tags ?? undefined,
    onFetchDetail,
    autoFetch: isDetailView
  });

  const handleClose = useCallback(() => {
    setViewMode('list');
    setSelectedToolForDetail(null);
    setSelectedVersion(undefined);
    setSelectedItems([]);
    setFailureReasons({});
    setUpdatingToolIds(new Set());
    onClose();
  }, [onClose, setSelectedItems]);

  const handleViewDetail = useCallback((tool: ToolCardItemType) => {
    setSelectedVersion(undefined);
    setSelectedToolForDetail(tool);
    setViewMode('detail');
  }, []);

  const handleBack = useCallback(() => {
    setViewMode('list');
    setSelectedToolForDetail(null);
    setSelectedVersion(undefined);
  }, []);

  /** 执行选中插件更新，并把插件级失败原因留在当前列表中供用户重试。 */
  const handleUpdateTools = useCallback(
    async (toolIds: string[]) => {
      if (toolIds.length === 0) return [];

      setUpdatingToolIds((previous) => new Set([...previous, ...toolIds]));
      setFailureReasons((previous) => {
        const next = { ...previous };
        toolIds.forEach((toolId) => delete next[toolId]);
        return next;
      });

      try {
        const failures = await onBatchUpdate(toolIds);
        const failedToolIds = new Set(failures.map((failure) => failure.toolId));

        setFailureReasons((previous) => ({
          ...previous,
          ...Object.fromEntries(failures.map((failure) => [failure.toolId, failure.reason]))
        }));
        setSelectedItems((previous) =>
          previous.filter((tool) => !toolIds.includes(tool.id) || failedToolIds.has(tool.id))
        );

        return failures;
      } catch (error) {
        const reason = getErrText(error, t('app:toolkit_update_failed'));
        const failures = toolIds.map((toolId) => ({ toolId, reason }));

        setFailureReasons((previous) => ({
          ...previous,
          ...Object.fromEntries(failures.map((failure) => [failure.toolId, failure.reason]))
        }));
        return failures;
      } finally {
        setUpdatingToolIds((previous) => {
          const next = new Set(previous);
          toolIds.forEach((toolId) => next.delete(toolId));
          return next;
        });
      }
    },
    [onBatchUpdate, setSelectedItems, t]
  );

  const handleUpdateSingle = useCallback(async () => {
    if (!selectedToolForDetail) return;

    setIsUpdatingSingle(true);
    try {
      await onUpdate(selectedToolForDetail, activeVersion);
      setFailureReasons((previous) => {
        const next = { ...previous };
        delete next[selectedToolForDetail.id];
        return next;
      });
      toast({
        title: t('common:update_success'),
        status: 'success'
      });
    } catch (error) {
      const reason = getErrText(error, t('app:toolkit_update_failed'));
      setFailureReasons((previous) => ({
        ...previous,
        [selectedToolForDetail.id]: reason
      }));
      toast({
        title: reason,
        status: 'error'
      });
    } finally {
      setIsUpdatingSingle(false);
    }
  }, [activeVersion, onUpdate, selectedToolForDetail, t, toast]);

  return (
    <Drawer isOpen={isOpen} onClose={handleClose} placement="right">
      <DrawerOverlay />
      <DrawerContent maxW="480px" borderLeftRadius="md">
        <DrawerHeader pt={6} pb={1}>
          {!isDetailView ? (
            <Flex gap={1.5} alignItems="center">
              <Box fontSize={'16px'} fontWeight={500} color={'myGray.900'}>
                {t('app:toolkit_plugin_update')}
              </Box>
              <Box flex={1} />
              <MyIconButton icon={'common/closeLight'} onClick={handleClose} />
            </Flex>
          ) : (
            <Flex gap={1.5}>
              <Avatar src={parentTool?.icon ?? ''} borderRadius={'md'} w={6} />
              <Box fontSize={'16px'} fontWeight={500} color={'myGray.900'}>
                {parseI18nString(parentTool?.name ?? '', i18n.language)}
              </Box>
              <Box flex={1} />
              {toolVersions.length > 0 && (
                <MyMenu
                  trigger="hover"
                  placement="bottom-end"
                  Button={
                    <Flex
                      alignItems="center"
                      gap={1}
                      px={2}
                      h={7}
                      border="1px solid"
                      borderColor="myGray.200"
                      borderRadius="md"
                      cursor="pointer"
                      color="myGray.700"
                    >
                      <Box fontSize="12px">{activeVersion ?? t('common:Version')}</Box>
                      <MyIcon name="core/chat/chevronDown" w={4} />
                    </Flex>
                  }
                  menuList={[
                    {
                      children: toolVersions.map((item) => ({
                        label: item.version,
                        description: item.versionDescription,
                        isActive: item.version === activeVersion,
                        onClick: () => setSelectedVersion(item.version)
                      }))
                    }
                  ]}
                />
              )}
              {loadingVersions && activeVersion && (
                <Box fontSize="12px" color="myGray.500">
                  {activeVersion}
                </Box>
              )}
              <MyIconButton icon={'common/backFill'} onClick={handleBack} />
            </Flex>
          )}
        </DrawerHeader>

        <DrawerBody position="relative" sx={drawerScrollbarStyles}>
          {!isDetailView ? (
            <VStack align="stretch" spacing={0} pb={20}>
              <Grid
                gridTemplateColumns="48px minmax(0, 1fr) 108px"
                h={10}
                alignItems="center"
                bg="myGray.100"
                borderRadius="md"
                color="myGray.600"
                fontSize="12px"
              >
                <Box px={3}>{t('app:toolkit_select')}</Box>
                <Box px={3}>{t('common:Name')}</Box>
                <Box px={3}>{t('common:Status')}</Box>
              </Grid>

              {updatableTools.map((tool) => {
                const failureReason = failureReasons[tool.id];
                const isUpdating = updatingToolIds.has(tool.id);

                return (
                  <Grid
                    key={tool.id}
                    gridTemplateColumns="48px minmax(0, 1fr) 108px"
                    minH={12}
                    alignItems="center"
                    borderBottom="1px solid"
                    borderColor="myGray.200"
                    {...getRowSelectionProps(tool, { isDisabled: isUpdating })}
                  >
                    <Flex px={3} align="center">
                      <Checkbox
                        size="sm"
                        isChecked={isSelected(tool)}
                        isDisabled={isUpdating}
                        onChange={() => toggleSelect(tool)}
                      />
                    </Flex>
                    <Flex
                      as="button"
                      role="group"
                      minW={0}
                      px={3}
                      align="center"
                      gap={2}
                      textAlign="left"
                      cursor="pointer"
                      onClick={() => handleViewDetail(tool)}
                    >
                      <Avatar src={tool.icon} w={5} h={5} borderRadius="md" flexShrink={0} />
                      <Box
                        minW={0}
                        overflow="hidden"
                        textOverflow="ellipsis"
                        whiteSpace="nowrap"
                        fontSize="sm"
                        fontWeight="medium"
                        color="myGray.900"
                        _groupHover={{
                          color: 'primary.600',
                          textDecoration: 'underline'
                        }}
                      >
                        {parseI18nString(tool.name, i18n.language)}
                      </Box>
                    </Flex>
                    <Flex px={3} align="center" gap={1} minW={0}>
                      {failureReason ? (
                        <>
                          <Box color="red.600" fontSize="xs" lineHeight="16px" whiteSpace="nowrap">
                            {t('app:toolkit_update_failed')}
                          </Box>
                          <MyTooltip label={failureReason} maxW="240px" shouldWrapChildren={false}>
                            <Box w={3} h={3} display="flex" alignItems="center">
                              <MyIcon name="infoRounded" w={3} h={3} color="red.600" />
                            </Box>
                          </MyTooltip>
                          <MyIconButton
                            icon="common/refreshLight"
                            size="12px"
                            w="16px"
                            h="16px"
                            minW="16px"
                            p={0}
                            isLoading={isUpdating}
                            tip={t('app:toolkit_retry_update')}
                            aria-label={t('app:toolkit_retry_update')}
                            onClick={() => handleUpdateTools([tool.id])}
                          />
                        </>
                      ) : (
                        <Flex align="center" gap={1} color="myGray.600" fontSize="xs">
                          {isUpdating ? (
                            <Spinner size="xs" color="primary.500" />
                          ) : (
                            <Box whiteSpace="nowrap">{t('app:toolkit_update_pending')}</Box>
                          )}
                        </Flex>
                      )}
                    </Flex>
                  </Grid>
                );
              })}

              <Flex
                position="fixed"
                bottom={0}
                right={0}
                w="min(480px, 100vw)"
                px={6}
                py={3}
                alignItems="center"
                justifyContent="space-between"
                borderLeftRadius="md"
                backgroundColor="white"
                borderTop="1px solid"
                borderColor="myGray.100"
              >
                <Flex alignItems="center" gap={2}>
                  <Checkbox
                    size="sm"
                    isChecked={isSelecteAll}
                    isDisabled={isBatchUpdating}
                    onChange={selectAllTrigger}
                  />
                  <Box fontSize="sm" color="myGray.700">
                    {t('common:Select_all')}
                  </Box>
                </Flex>
                <Button
                  variant="primary"
                  isLoading={isBatchUpdating}
                  isDisabled={!hasSelections}
                  onClick={() =>
                    handleUpdateTools(selectedItems.map((tool: ToolCardItemType) => tool.id))
                  }
                >
                  {t('app:toolkit_update_selected', { count: selectedItems.length })}
                </Button>
              </Flex>
            </VStack>
          ) : (
            <ToolDetailBody
              parentTool={parentTool}
              isToolSet={isToolSet}
              subTools={subTools}
              readmeContent={readmeContent}
              actions={
                <Flex gap={2}>
                  <Button
                    flex="1 1 0"
                    minW={0}
                    variant="primary"
                    isLoading={isUpdatingSingle || isSelectedToolUpdating || loadingDetail}
                    isDisabled={isSelectedToolDeleting}
                    onClick={handleUpdateSingle}
                  >
                    {t('app:custom_plugin_update')}
                  </Button>
                  <Button
                    flex="0 0 62px"
                    minW={0}
                    variant="dangerOutline"
                    isLoading={isSelectedToolDeleting}
                    isDisabled={isUpdatingSingle || isSelectedToolUpdating}
                    onClick={() => selectedToolForDetail && onDelete(selectedToolForDetail)}
                  >
                    {t('app:toolkit_uninstall')}
                  </Button>
                </Flex>
              }
            />
          )}
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
};

export default React.memo(BatchUpdateDrawer);
