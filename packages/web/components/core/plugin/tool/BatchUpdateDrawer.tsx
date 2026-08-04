import React, { useState, useCallback } from 'react';
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
  VStack,
  Accordion
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import Avatar from '../../../common/Avatar';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import MyIconButton from '../../../common/Icon/button';
import LightRowTabs from '../../../common/Tabs/LightRowTabs';
import { type ToolCardItemType } from './ToolCard';
import MyBox from '../../../common/MyBox';
import MyIcon from '../../../common/Icon';
import MyTooltip from '../../../common/MyTooltip';
import { useTableMultipleSelect } from '../../../../hooks/useTableMultipleSelect';
import { getErrText } from '@fastgpt/global/common/error/utils';
import {
  ParamSection,
  ReadmeBox,
  SubToolAccordionItem,
  useToolDetail,
  drawerScrollbarStyles,
  type ToolDetailFetchResponse
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
  isBatchUpdating: boolean;
  onFetchDetail?: (toolId: string) => Promise<ToolDetailFetchResponse>;
};

const BatchUpdateDrawer: React.FC<BatchUpdateDrawerProps> = ({
  isOpen,
  onClose,
  updatableTools,
  onBatchUpdate,
  isBatchUpdating,
  onFetchDetail
}) => {
  const { t, i18n } = useTranslation();
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedToolForDetail, setSelectedToolForDetail] = useState<ToolCardItemType | null>(null);
  const [activeTab, setActiveTab] = useState<'guide' | 'params'>('params');
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
    setSelectedItems
  } = useTableMultipleSelect<ToolCardItemType>({
    list: updatableTools,
    getItemId: (tool: ToolCardItemType) => tool.id
  });

  // Use tool detail hook
  const { parentTool, isToolSet, subTools, readmeContent, loadingDetail } = useToolDetail({
    toolId: selectedToolForDetail?.id,
    tags: selectedToolForDetail?.tags || undefined,
    onFetchDetail,
    autoFetch: viewMode === 'detail'
  });

  const handleClose = useCallback(() => {
    setViewMode('list');
    setSelectedToolForDetail(null);
    setActiveTab('params');
    setSelectedItems([]);
    setFailureReasons({});
    setUpdatingToolIds(new Set());
    onClose();
  }, [onClose, setSelectedItems]);

  const handleViewDetail = useCallback((tool: ToolCardItemType) => {
    setSelectedToolForDetail(tool);
    setViewMode('detail');
  }, []);

  const handleBack = useCallback(() => {
    setViewMode('list');
    setSelectedToolForDetail(null);
    setActiveTab('params');
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
      await handleUpdateTools([selectedToolForDetail.id]);
      handleBack();
    } finally {
      setIsUpdatingSingle(false);
    }
  }, [selectedToolForDetail, handleUpdateTools, handleBack]);

  return (
    <Drawer isOpen={isOpen} onClose={handleClose} placement="right">
      <DrawerOverlay />
      <DrawerContent maxW="480px" borderLeftRadius="md">
        <DrawerHeader pt={6} pb={1}>
          {viewMode === 'list' ? (
            <Flex gap={1.5} alignItems="center">
              <Box fontSize={'16px'} fontWeight={500} color={'myGray.900'}>
                {t('app:toolkit_plugin_update')}
              </Box>
              <Box flex={1} />
              <MyIconButton icon={'common/closeLight'} onClick={handleClose} />
            </Flex>
          ) : (
            <Flex gap={1.5}>
              <Avatar src={parentTool?.icon || ''} borderRadius={'md'} w={6} />
              <Box fontSize={'16px'} fontWeight={500} color={'myGray.900'}>
                {parseI18nString(parentTool?.name || '', i18n.language)}
              </Box>
              <Box flex={1} />
              <MyIconButton icon={'common/backFill'} onClick={handleBack} />
            </Flex>
          )}
        </DrawerHeader>

        <DrawerBody position="relative" sx={drawerScrollbarStyles}>
          {viewMode === 'list' ? (
            <VStack align="stretch" spacing={0} pb={20}>
              <Grid
                gridTemplateColumns="48px minmax(0, 1fr) 108px"
                h={10}
                alignItems="center"
                bg="myGray.100"
                borderRadius="md"
                color="myGray.600"
                fontSize="xs"
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
                      minW={0}
                      px={3}
                      align="center"
                      gap={2}
                      textAlign="left"
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
                      >
                        {parseI18nString(tool.name, i18n.language)}
                      </Box>
                    </Flex>
                    <Flex px={3} align="center" gap={1} minW={0}>
                      {failureReason ? (
                        <>
                          <Box color="red.600" fontSize="xs" whiteSpace="nowrap">
                            {t('app:toolkit_update_failed')}
                          </Box>
                          <MyTooltip label={failureReason} maxW="240px">
                            <MyIcon name="infoRounded" w={3} color="red.600" />
                          </MyTooltip>
                          <MyIconButton
                            icon="common/refreshLight"
                            size="16px"
                            p={0}
                            isLoading={isUpdating}
                            tip={t('app:toolkit_retry_update')}
                            aria-label={t('app:toolkit_retry_update')}
                            onClick={() => handleUpdateTools([tool.id])}
                          />
                        </>
                      ) : (
                        <Flex align="center" gap={1} color="myGray.600" fontSize="xs">
                          <Box whiteSpace="nowrap">
                            {t(isUpdating ? 'app:toolkit_updating' : 'app:toolkit_update_pending')}
                          </Box>
                          {isUpdating && <MyIcon name="common/loading" w={3} />}
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
                {`by ${parentTool?.author || 'FastGPT'}`}
              </Box>
              <Flex mt={3} gap={2}>
                <Button
                  flex={1}
                  variant="primary"
                  isLoading={isUpdatingSingle || loadingDetail}
                  onClick={handleUpdateSingle}
                >
                  {t('app:custom_plugin_update')}
                </Button>
              </Flex>

              <Flex mt={4} gap={1.5} alignItems={'center'}>
                <Box fontWeight={'medium'} fontSize={'14px'} color={'myGray.900'}>
                  {t('app:toolkit_activation_label')}
                </Box>
                <Box fontSize={'12px'} color={'myGray.600'}>
                  {parentTool?.hasSystemSecret ||
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
                    if (
                      value === 'guide' &&
                      parentTool?.courseUrl &&
                      !parentTool?.readme &&
                      !parentTool?.userGuide
                    ) {
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
                    {(parentTool?.readme || readmeContent || parentTool?.userGuide) && (
                      <ReadmeBox
                        source={readmeContent || parentTool?.userGuide || ''}
                        courseUrl={parentTool?.courseUrl}
                      />
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
                          <SubToolAccordionItem key={subTool.toolId} tool={subTool} />
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
          )}
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
};

export default React.memo(BatchUpdateDrawer);
