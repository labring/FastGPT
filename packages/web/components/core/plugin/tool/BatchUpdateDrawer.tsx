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
import Markdown from '../../../common/Markdown';
import type { GetTeamToolDetailResponseType } from '@fastgpt/global/openapi/core/plugin/team/toolApi';
import { useTableMultipleSelect } from '../../../../hooks/useTableMultipleSelect';
import {
  ParamSection,
  SubToolAccordionItem,
  useToolDetail,
  drawerScrollbarStyles
} from './ToolDetail';

type ViewMode = 'list' | 'detail';

interface BatchUpdateDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  updatableTools: ToolCardItemType[];
  onBatchUpdate: (toolIds: string[]) => Promise<void>;
  isBatchUpdating: boolean;
  onFetchDetail?: (toolId: string) => Promise<GetTeamToolDetailResponseType>;
}

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

  // Reset view mode when drawer closes
  useEffect(() => {
    if (!isOpen) {
      setViewMode('list');
      setSelectedToolForDetail(null);
      setActiveTab('params');
      setSelectedItems([]);
    }
  }, [isOpen, setSelectedItems]);

  const handleViewDetail = useCallback((tool: ToolCardItemType) => {
    setSelectedToolForDetail(tool);
    setViewMode('detail');
  }, []);

  const handleBack = useCallback(() => {
    setViewMode('list');
    setSelectedToolForDetail(null);
    setActiveTab('params');
  }, []);

  const handleUpdateSingle = useCallback(async () => {
    if (!selectedToolForDetail) return;

    setIsUpdatingSingle(true);
    try {
      await onBatchUpdate([selectedToolForDetail.id]);
      // Go back to list view after successful update
      handleBack();
    } finally {
      setIsUpdatingSingle(false);
    }
  }, [selectedToolForDetail, onBatchUpdate, handleBack]);

  return (
    <Drawer isOpen={isOpen} onClose={onClose} placement="right">
      <DrawerOverlay />
      <DrawerContent maxW="480px" borderLeftRadius="md">
        <DrawerHeader pt={6} pb={1}>
          {viewMode === 'list' ? (
            <Flex gap={1.5} alignItems="center">
              <Box fontSize={'16px'} fontWeight={500} color={'myGray.900'}>
                {t('app:toolkit_updatable_plugins')}
              </Box>
              <Box flex={1} />
              <MyIconButton icon={'common/closeLight'} onClick={onClose} />
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
              {updatableTools.map((tool) => (
                <Flex
                  key={tool.id}
                  align="center"
                  p={3}
                  borderRadius="md"
                  borderBottom={'1px solid'}
                  borderColor={'myGray.200'}
                  _hover={{ bg: 'myGray.50' }}
                  cursor="pointer"
                  onClick={() => toggleSelect(tool)}
                >
                  <Flex onClick={(e) => e.stopPropagation()} mr={3} align="center">
                    <Checkbox isChecked={isSelected(tool)} onChange={() => toggleSelect(tool)} />
                  </Flex>
                  <Avatar src={tool.icon} w={6} h={6} borderRadius="md" mr={3} flexShrink={0} />
                  <Box flex={1}>
                    <Box fontSize="sm" fontWeight="medium" color="myGray.900">
                      {parseI18nString(tool.name, i18n.language)}
                    </Box>
                  </Box>
                  <Box
                    as="button"
                    fontSize="sm"
                    color="primary.600"
                    _hover={{ textDecoration: 'underline' }}
                    onClick={(e: any) => {
                      e.stopPropagation();
                      handleViewDetail(tool);
                    }}
                  >
                    {t('common:view_detail')}
                  </Box>
                </Flex>
              ))}

              {/* Bottom action bar - Always visible */}
              <Flex
                position="fixed"
                bottom={0}
                left={0}
                right={0}
                w={'480px'}
                px={8}
                py={2}
                alignItems="center"
                justifyContent="space-between"
                borderLeftRadius="md"
                backgroundColor="white"
              >
                <Flex alignItems="center" gap={2}>
                  <Checkbox size="sm" isChecked={isSelecteAll} onChange={selectAllTrigger} ml={1} />
                  <Box fontSize="sm" color="gray.600">
                    {t('common:select_count_num', { num: selectedItems.length })}
                  </Box>
                </Flex>
                <Button
                  variant="primary"
                  isLoading={isBatchUpdating}
                  isDisabled={!hasSelections}
                  onClick={() =>
                    onBatchUpdate(selectedItems.map((tool: ToolCardItemType) => tool.id))
                  }
                >
                  {t('app:toolkit_batch_update')}
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
