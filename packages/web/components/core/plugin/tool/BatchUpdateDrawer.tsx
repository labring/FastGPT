import React, { useState, useMemo, useCallback, useEffect } from 'react';
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
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import Avatar from '../../../common/Avatar';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import MyIconButton from '../../../common/Icon/button';
import LightRowTabs from '../../../common/Tabs/LightRowTabs';
import type {
  FlowNodeInputItemType,
  FlowNodeOutputItemType
} from '@fastgpt/global/core/workflow/type/io';
import { type ToolCardItemType } from './ToolCard';
import MyBox from '../../../common/MyBox';
import Markdown from '../../../common/Markdown';
import type { ToolDetailType } from '@fastgpt/global/sdk/fastgpt-plugin';
import { FlowValueTypeMap } from '@fastgpt/global/core/workflow/node/constant';
import type { GetTeamToolDetailResponseType } from '@fastgpt/global/openapi/core/plugin/team/toolApi';
import type { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';

type ViewMode = 'list' | 'detail';

type toolDetailType = ToolDetailType & {
  versionList?: Array<{
    value: string;
    description?: string;
    inputs?: Array<FlowNodeInputItemType>;
    outputs?: Array<FlowNodeOutputItemType>;
  }>;
  courseUrl?: string;
  readme?: string;
  userGuide?: string;
  currentCost?: number;
  hasSystemSecret?: boolean;
  secretInputConfig?: Array<{}>;
  inputList?: Array<FlowNodeInputItemType>;
};

interface BatchUpdateDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  updatableTools: ToolCardItemType[];
  onBatchUpdate: (toolIds: string[]) => Promise<void>;
  isBatchUpdating: boolean;
  onFetchDetail?: (toolId: string) => Promise<GetTeamToolDetailResponseType>;
}

const ParamSection = ({
  title,
  params
}: {
  title: string;
  params: (FlowNodeInputItemType | FlowNodeOutputItemType)[];
}) => {
  const { i18n } = useTranslation();

  return (
    <VStack
      align="stretch"
      p={4}
      gap={0}
      border="1px solid"
      borderColor="myGray.200"
      borderRadius="md"
      bg="myGray.50"
    >
      <Flex alignItems="center" gap={2} mb={4}>
        <Box w="4px" h="16px" bg="primary.600" borderRadius="2px" flexShrink={0} />
        <Box fontSize="sm" color="myGray.900">
          {title}
        </Box>
      </Flex>
      {params.map((param, index) => {
        const isInput = 'required' in param;
        return (
          <Box key={index}>
            <Flex alignItems="center" gap={2} mb={1}>
              {isInput && param.required && (
                <Box as="span" color="red.500" fontSize="xs" fontWeight="medium" ml={-2} mr={-1}>
                  *
                </Box>
              )}
              <Box fontWeight={500}>{parseI18nString(param.label || param.key, i18n.language)}</Box>
              <Box
                px={1}
                borderRadius="4px"
                fontSize={'11px'}
                color="myGray.500"
                bg={'myGray.100'}
                border={'1px solid'}
                borderColor={'myGray.200'}
              >
                {FlowValueTypeMap[param.valueType as WorkflowIOValueTypeEnum]?.label || 'String'}
              </Box>
            </Flex>
            {param.description && (
              <Box fontSize="sm" color="myGray.500" mt={1}>
                {parseI18nString(param.description, i18n.language)}
              </Box>
            )}
            {index !== params.length - 1 && <Box h={'1px'} w={'full'} bg={'myGray.200'} my={4} />}
          </Box>
        );
      })}
    </VStack>
  );
};

const SubToolAccordionItem = ({ tool }: { tool: any }) => {
  const { t, i18n } = useTranslation();

  return (
    <AccordionItem borderRadius="md" mb={2} border={'none'}>
      <AccordionButton
        px={2}
        py={2}
        _hover={{ bg: 'myGray.50' }}
        borderRadius="md"
        alignItems={'center'}
      >
        <Box flex={1} textAlign="left">
          <Box fontSize="md" color="myGray.900">
            {parseI18nString(tool.name, i18n.language)}
          </Box>
          <Box fontSize={'sm'} color={'myGray.600'}>
            {tool.intro || parseI18nString(tool.description, i18n.language)}
          </Box>
        </Box>
        <AccordionIcon />
      </AccordionButton>

      <AccordionPanel px={2} pb={4} pt={0}>
        {tool.versionList && tool.versionList.length > 0 && (
          <VStack align="stretch" spacing={3} mt={3}>
            {tool.versionList[0]?.inputs && tool.versionList[0].inputs.length > 0 && (
              <ParamSection title={t('app:toolkit_inputs')} params={tool.versionList[0].inputs} />
            )}
            {tool.versionList[0]?.outputs && tool.versionList[0].outputs.length > 0 && (
              <ParamSection title={t('app:toolkit_outputs')} params={tool.versionList[0].outputs} />
            )}
          </VStack>
        )}
      </AccordionPanel>
    </AccordionItem>
  );
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
  const [selectedToolIds, setSelectedToolIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'guide' | 'params'>('params');
  const [toolDetail, setToolDetail] = useState<
    { tools: Array<toolDetailType & { readme: string }>; downloadUrl: string } | undefined
  >(undefined);
  const [loadingDetail, setLoading] = useState(false);
  const [readmeContent, setReadmeContent] = useState<string>('');
  const [isUpdatingSingle, setIsUpdatingSingle] = useState(false);

  // Reset view mode when drawer closes
  useEffect(() => {
    if (!isOpen) {
      setViewMode('list');
      setSelectedToolForDetail(null);
      setToolDetail(undefined);
      setReadmeContent('');
      setActiveTab('params');
    }
  }, [isOpen]);

  // Fetch tool detail when viewing detail
  useEffect(() => {
    const fetchToolDetail = async () => {
      if (onFetchDetail && selectedToolForDetail?.id && viewMode === 'detail') {
        setLoading(true);
        try {
          const detail = await onFetchDetail(selectedToolForDetail.id);
          setToolDetail(detail as any);
        } finally {
          setLoading(false);
        }
      }
    };

    fetchToolDetail();
  }, [selectedToolForDetail, viewMode, onFetchDetail]);

  // Fetch README when tool detail is loaded
  useEffect(() => {
    const fetchReadme = async () => {
      if (!toolDetail) return;
      const parentTool = toolDetail?.tools.find((tool: toolDetailType) => !tool.parentId);
      const readmeUrl = parentTool?.readme;
      if (!readmeUrl) return;

      try {
        const response = await fetch(readmeUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch README: ${response.status}`);
        }
        let content = await response.text();

        const baseUrl = readmeUrl.substring(0, readmeUrl.lastIndexOf('/') + 1);

        content = content.replace(
          /!\[([^\]]*)\]\(\.\/([^)]+)\)/g,
          (match, alt, path) => `![${alt}](${baseUrl}${path})`
        );
        content = content.replace(
          /!\[([^\]]*)\]\((?!http|https|\/\/)([^)]+)\)/g,
          (match, alt, path) => `![${alt}](${baseUrl}${path})`
        );
        setReadmeContent(content);
      } catch (error) {
        console.error('Failed to fetch README:', error);
        setReadmeContent('');
      }
    };

    fetchReadme();
  }, [toolDetail]);

  const isToolSet = useMemo(() => {
    if (!toolDetail?.tools || !Array.isArray(toolDetail?.tools) || toolDetail?.tools.length === 0) {
      return false;
    }
    const subTools = toolDetail?.tools.filter((subTool: any) => subTool.parentId);
    return subTools.length > 0;
  }, [toolDetail?.tools]);

  const parentTool = useMemo(() => {
    const parentTool = toolDetail?.tools.find((tool: toolDetailType) => !tool.parentId);
    return {
      ...parentTool,
      tags: selectedToolForDetail?.tags
    };
  }, [selectedToolForDetail?.tags, toolDetail?.tools]);

  const subTools = useMemo(() => {
    if (!isToolSet || !toolDetail?.tools) return [];
    return toolDetail?.tools.filter((subTool: toolDetailType) => !!subTool.parentId);
  }, [isToolSet, toolDetail?.tools]);

  const handleToggleSelection = useCallback((toolId: string, checked: boolean) => {
    setSelectedToolIds((prev) => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(toolId);
      } else {
        newSet.delete(toolId);
      }
      return newSet;
    });
  }, []);

  const handleSelectAll = useCallback(
    (checked: boolean) => {
      if (checked) {
        setSelectedToolIds(new Set(updatableTools.map((tool) => tool.id)));
      } else {
        setSelectedToolIds(new Set());
      }
    },
    [updatableTools]
  );

  const handleViewDetail = useCallback((tool: ToolCardItemType) => {
    setSelectedToolForDetail(tool);
    setViewMode('detail');
  }, []);

  const handleBack = useCallback(() => {
    setViewMode('list');
    setSelectedToolForDetail(null);
    setToolDetail(undefined);
    setReadmeContent('');
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
      <DrawerContent maxW="480px">
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

        <DrawerBody
          position="relative"
          sx={{
            overflowY: 'overlay' as any,
            '&::-webkit-scrollbar': {
              width: '6px',
              position: 'absolute'
            },
            '&::-webkit-scrollbar-track': {
              background: 'transparent'
            },
            '&::-webkit-scrollbar-thumb': {
              background: 'myGray.300',
              borderRadius: '3px'
            },
            '&::-webkit-scrollbar-thumb:hover': {
              background: 'myGray.400'
            },
            scrollbarWidth: 'thin',
            scrollbarColor: 'var(--chakra-colors-myGray-300) transparent'
          }}
        >
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
                  onClick={() => handleToggleSelection(tool.id, !selectedToolIds.has(tool.id))}
                >
                  <Flex onClick={(e) => e.stopPropagation()} mr={3} align="center">
                    <Checkbox
                      isChecked={selectedToolIds.has(tool.id)}
                      onChange={(e) => handleToggleSelection(tool.id, e.target.checked)}
                    />
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

              {/* Bottom action bar */}
              <Flex
                position="fixed"
                bottom={0}
                left={0}
                right={0}
                maxW="480px"
                p={4}
                bg="white"
                borderTop="1px solid"
                borderColor="myGray.200"
                alignItems="center"
                gap={3}
                boxShadow="0 -2px 8px rgba(0, 0, 0, 0.05)"
              >
                <Checkbox
                  isChecked={
                    selectedToolIds.size === updatableTools.length && updatableTools.length > 0
                  }
                  isIndeterminate={
                    selectedToolIds.size > 0 && selectedToolIds.size < updatableTools.length
                  }
                  onChange={(e) => handleSelectAll(e.target.checked)}
                >
                  {t('common:Select_all')}
                </Checkbox>
                <Button
                  flex={1}
                  variant="primary"
                  isDisabled={selectedToolIds.size === 0}
                  isLoading={isBatchUpdating}
                  onClick={() => onBatchUpdate(Array.from(selectedToolIds))}
                >
                  {t('app:toolkit_batch_update')} ({selectedToolIds.size})
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
                  <VStack align="stretch" spacing={4}>
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
                        maxH="400px"
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
                        {subTools.map((subTool: ToolDetailType) => (
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
