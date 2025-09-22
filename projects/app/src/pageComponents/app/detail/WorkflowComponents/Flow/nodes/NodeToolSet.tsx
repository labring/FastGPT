import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import {
  Box,
  Flex,
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverBody,
  Switch,
  Text,
  Checkbox
} from '@chakra-ui/react';
import { type NodeProps } from 'reactflow';
import type { NodeTemplateListItemType } from '@fastgpt/global/core/workflow/type/node';
import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import { getToolVersionList, getSystemPlugTemplates } from '@/web/core/app/api/plugin';
import { WorkflowContext } from '../../context';
import NodeCard from './render/NodeCard';
import IOTitle from '../components/IOTitle';
import Container from '../components/Container';

const NodeToolSet = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { t } = useTranslation();
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);

  const { toolConfig } = data;
  // get tool list from toolConfig
  const toolList = useMemo(
    () => toolConfig?.systemToolSet?.toolList ?? [],
    [toolConfig?.systemToolSet?.toolList]
  );
  // plugin data
  const [pluginData, setPluginData] = useState<{
    toolList: any[];
    toolVersions: Record<string, any>;
  }>({ toolList: [], toolVersions: {} });

  // single tool state
  const [toolState, setToolState] = useState({
    hoveredToolIndex: null as number | null,
    openPopoverIndex: null as number | null,
    allToolsKeepLatest: false
  });

  // all tools state
  const [toolStates, setToolStates] = useState<{
    enabled: Record<string, boolean>;
    versions: Record<string, string>;
    newToolIds: Set<string>;
    updatedVersionToolIds: Set<string>;
  }>({
    enabled: {},
    versions: {},
    newToolIds: new Set(),
    updatedVersionToolIds: new Set()
  });

  // initialize tool states
  useEffect(() => {
    const newStates = toolList.reduce(
      (acc, tool) => {
        acc.enabled[tool.toolId] = tool.enabled ?? true;
        acc.versions[tool.toolId] = tool.selectedVersionId ?? '';
        return acc;
      },
      { enabled: {} as Record<string, boolean>, versions: {} as Record<string, string> }
    );

    setToolStates((prev) => ({
      ...prev,
      enabled: newStates.enabled,
      versions: newStates.versions
    }));
  }, [toolList]);

  // update tool config in node data
  const updateToolConfigInNodeData = useCallback(
    (
      toolId: string,
      updates: {
        enabled?: boolean;
        selectedVersionId?: string;
        storedVersions?: string[];
        type?: 'deprecated' | 'invalid';
        name?: string;
      },
      isNewTool = false
    ) => {
      if (!toolConfig?.systemToolSet) return;

      const updatedToolList = isNewTool
        ? [
            ...toolConfig.systemToolSet.toolList,
            {
              toolId,
              name: updates.name || '',
              enabled: updates.enabled ?? true,
              selectedVersionId: updates.selectedVersionId ?? '',
              storedVersions: updates.storedVersions ?? [],
              ...(updates.type && { type: updates.type })
            }
          ]
        : toolConfig.systemToolSet.toolList.map((tool) =>
            tool.toolId === toolId ? { ...tool, ...updates } : tool
          );

      onChangeNode({
        nodeId: data.nodeId,
        type: 'attr',
        key: 'toolConfig',
        value: {
          ...toolConfig,
          systemToolSet: {
            ...toolConfig.systemToolSet,
            toolList: updatedToolList
          }
        }
      });
    },
    [toolConfig, data.nodeId, onChangeNode]
  );

  const updateToolStoredVersions = useCallback(
    (toolId: string, storedVersions: string[]) => {
      updateToolConfigInNodeData(toolId, { storedVersions: storedVersions });
    },
    [updateToolConfigInNodeData]
  );

  const toolOperations = useMemo(
    () => ({
      setVersion: (toolId: string, versionId: string) => {
        setToolStates((prev) => ({
          ...prev,
          versions: { ...prev.versions, [toolId]: versionId }
        }));
        updateToolConfigInNodeData(toolId, { selectedVersionId: versionId });

        const versionList = pluginData.toolVersions[toolId];
        if (versionList?.length) {
          const storedVersions = versionList.map((v: any) => v.value || v._id);
          updateToolStoredVersions(toolId, storedVersions);
        }
      },

      setEnabled: (toolId: string, enabled: boolean) => {
        setToolStates((prev) => ({
          ...prev,
          enabled: { ...prev.enabled, [toolId]: enabled }
        }));
        updateToolConfigInNodeData(toolId, { enabled });
      },

      toggleAllKeepLatest: (checked: boolean) => {
        setToolState((prev) => ({ ...prev, allToolsKeepLatest: checked }));

        if (checked) {
          const newVersions = toolList.reduce(
            (acc, tool) => {
              acc[tool.toolId] = '';
              updateToolConfigInNodeData(tool.toolId, { selectedVersionId: '' });
              return acc;
            },
            {} as Record<string, string>
          );

          setToolStates((prev) => ({ ...prev, versions: newVersions }));
        }
      },

      getVersionInfo: (toolId: string, tool?: any) => {
        if (toolState.allToolsKeepLatest) return '';
        return tool?.selectedVersionId ?? toolStates.versions[toolId] ?? '';
      }
    }),
    [
      toolState.allToolsKeepLatest,
      toolStates,
      updateToolConfigInNodeData,
      updateToolStoredVersions,
      pluginData.toolVersions,
      toolList
    ]
  );
  // fetch tool data
  useEffect(() => {
    const fetchToolData = async () => {
      const toolSetId = toolConfig?.systemToolSet?.toolId;
      if (!toolSetId) return;

      try {
        const toolList = await getSystemPlugTemplates({
          searchKey: '',
          parentId: toolSetId
        });

        const versionResults = await Promise.allSettled(
          toolList.map(async (tool: NodeTemplateListItemType) => {
            const versionResponse = await getToolVersionList({
              pluginId: tool.id,
              pageSize: 100,
              pageNum: 1
            });
            return { [tool.id]: versionResponse || [] };
          })
        );

        const mergedVersions = versionResults.reduce(
          (acc, result) => {
            if (result.status === 'fulfilled') {
              return { ...acc, ...result.value };
            }
            return acc;
          },
          {} as Record<string, any>
        );

        setPluginData({ toolList, toolVersions: mergedVersions });
      } catch (error) {
        console.error('Failed to fetch tool data:', error);
        setPluginData({ toolList: [], toolVersions: {} });
      }
    };

    fetchToolData();
  }, [toolConfig?.systemToolSet?.toolId]);

  // check version updates
  const checkVersionUpdates = useCallback(
    (tool: any) => {
      const versionList = pluginData.toolVersions[tool.toolId];

      const versionArray = versionList.list;

      if (!versionArray.length) {
        return { hasNewVersion: false };
      }

      const currentVersions = versionArray.map((v: any) => v.value || v._id);
      const storedVersions = tool.storedVersions || [];

      const storedVersionsSet = new Set(storedVersions);
      const hasNewVersion = currentVersions.some(
        (version: string) => !storedVersionsSet.has(version)
      );

      return { hasNewVersion };
    },
    [pluginData.toolVersions]
  );

  // all tools including new tools information
  const toolListWithStatus = useMemo(() => {
    if (!pluginData.toolList.length) {
      return toolList.map((tool) => ({
        ...tool,
        isDeprecated: false,
        isNew: false,
        hasNewVersion: false
      }));
    }

    const pluginToolMap = new Map(
      pluginData.toolList.map((tool: NodeTemplateListItemType) => [tool.id, tool])
    );

    const existingToolsWithStatus = toolList.map((tool) => {
      const isDeprecated = !pluginToolMap.has(tool.toolId);
      const hasNewVersion =
        toolStates.updatedVersionToolIds.has(tool.toolId) ||
        checkVersionUpdates(tool).hasNewVersion;
      const isNew = toolStates.newToolIds.has(tool.toolId);

      return {
        ...tool,
        isDeprecated,
        isNew,
        hasNewVersion
      };
    });

    const newTools = pluginData.toolList
      .filter(
        (latestTool: NodeTemplateListItemType) =>
          !toolList.some((tool) => tool.toolId === latestTool.id)
      )
      .map((newTool: NodeTemplateListItemType) => ({
        toolId: newTool.id,
        name: newTool.name,
        description: newTool.intro,
        enabled: true,
        selectedVersionId: '',
        isDeprecated: false,
        isNew: true,
        hasNewVersion: false
      }));

    // deprecated tools at the bottom
    const allTools = [...existingToolsWithStatus, ...newTools];
    const activeTools = allTools.filter((tool) => !tool.isDeprecated);
    const deprecatedTools = allTools.filter((tool) => tool.isDeprecated);

    return [...activeTools, ...deprecatedTools];
  }, [
    toolList,
    pluginData,
    checkVersionUpdates,
    toolStates.newToolIds,
    toolStates.updatedVersionToolIds
  ]);

  useEffect(() => {
    if (!pluginData.toolList.length || !toolConfig?.systemToolSet) return;

    const pluginToolMap = new Map(
      pluginData.toolList.map((tool: NodeTemplateListItemType) => [tool.id, tool])
    );

    const newToolIdsSet = new Set<string>();
    const updatedVersionToolIdsSet = new Set<string>();

    // check and add new tools
    pluginData.toolList.forEach((pluginTool: NodeTemplateListItemType) => {
      const existingTool = toolConfig.systemToolSet?.toolList.find(
        (tool) => tool.toolId === pluginTool.id
      );

      if (!existingTool) {
        newToolIdsSet.add(pluginTool.id);

        const versionList = pluginData.toolVersions[pluginTool.id];

        const latestVersions = versionList.list.map(
          (v: { _id: string; versionName: string }) => v._id
        ) as string[];

        updateToolConfigInNodeData(
          pluginTool.id,
          {
            name: pluginTool.name,
            enabled: true,
            selectedVersionId: '',
            storedVersions: latestVersions,
            type: 'invalid' as const
          },
          true
        );
      } else {
        // check version updates
        const versionList = pluginData.toolVersions[pluginTool.id];

        const latestVersions = versionList.list.map(
          (v: { _id: string; versionName: string }) => v._id
        ) as string[];

        const currentStoredVersions = existingTool.storedVersions || [];
        const versionsChanged =
          latestVersions.length !== currentStoredVersions.length ||
          latestVersions.some((v) => !currentStoredVersions.includes(v)) ||
          currentStoredVersions.some((v) => !latestVersions.includes(v));

        if (versionsChanged) {
          updatedVersionToolIdsSet.add(pluginTool.id);
          updateToolConfigInNodeData(pluginTool.id, { storedVersions: latestVersions });
        }
      }
    });

    toolList.forEach((tool) => {
      const isDeprecated = !pluginToolMap.has(tool.toolId);

      if (isDeprecated && tool.type !== 'deprecated') {
        updateToolConfigInNodeData(tool.toolId, { type: 'deprecated' });
      }
    });

    if (newToolIdsSet.size > 0 || updatedVersionToolIdsSet.size > 0) {
      setToolStates((prev) => ({
        ...prev,
        newToolIds: newToolIdsSet,
        updatedVersionToolIds: updatedVersionToolIdsSet
      }));
    }
  }, [pluginData.toolList, pluginData.toolVersions, toolConfig, updateToolConfigInNodeData]);

  // check tool set status
  const toolSetStatus = useMemo(() => {
    const hasData = pluginData.toolList.length > 0 && toolList.length > 0;

    if (!hasData) {
      return { hasUpdates: false, hasDeprecated: false };
    }

    const hasUpdates = toolListWithStatus.some(
      (tool) => tool.hasNewVersion || tool.isDeprecated || tool.isNew
    );

    const pluginToolMap = new Map(
      pluginData.toolList.map((tool: NodeTemplateListItemType) => [tool.id, tool])
    );
    const hasDeprecated = toolList.some((tool) => !pluginToolMap.has(tool.toolId));

    return { hasUpdates, hasDeprecated };
  }, [toolListWithStatus, toolList, pluginData.toolList]);

  // update tool set version status
  useEffect(() => {
    const { hasUpdates } = toolSetStatus;
    const shouldUpdate =
      (hasUpdates && data.isLatestVersion !== false) ||
      (!hasUpdates && data.isLatestVersion !== true);

    if (shouldUpdate) {
      onChangeNode({
        nodeId: data.nodeId,
        type: 'attr',
        key: 'isLatestVersion',
        value: !hasUpdates
      });
    }
  }, [toolSetStatus, data.isLatestVersion, data.nodeId, onChangeNode]);

  return (
    <NodeCard minW={'540px'} selected={selected} {...data}>
      <Container>
        <IOTitle text={t('app:MCP_tools_list')} {...data} catchError={undefined} />
        <Box
          maxH="500px"
          overflowY="auto"
          className="nowheel"
          sx={{ '&::-webkit-scrollbar': { display: 'none' } }}
        >
          {toolListWithStatus?.map((toolWithStatus, index) => {
            const {
              toolId,
              isDeprecated,
              isNew,
              hasNewVersion: hasNewVersionAvailable
            } = toolWithStatus;

            const isEnabled = toolWithStatus.enabled ?? toolStates.enabled[toolId] ?? true;

            return (
              <Flex
                key={index}
                borderBottom={'1px solid'}
                borderColor={'myGray.200'}
                alignItems={'center'}
                py={2}
                px={3}
                onMouseEnter={() => setToolState((prev) => ({ ...prev, hoveredToolIndex: index }))}
                onMouseLeave={() => setToolState((prev) => ({ ...prev, hoveredToolIndex: null }))}
                position="relative"
              >
                <Box w="20px" fontSize="14px" color="myGray.500" fontWeight="medium">
                  {(index + 1).toString().padStart(2, '0')}
                </Box>
                <Box maxW="full" pl={2} position="relative" width="400px">
                  <Flex alignItems="center" gap={2}>
                    <Box
                      fontSize="14px"
                      color={isEnabled ? 'myGray.900' : 'myGray.400'}
                      whiteSpace="nowrap"
                      overflow="hidden"
                      textOverflow="ellipsis"
                      textDecoration={isDeprecated ? 'line-through' : 'none'}
                    >
                      {toolWithStatus.name}
                    </Box>
                    <StatusTag
                      isEnabled={isEnabled}
                      isDeprecated={isDeprecated}
                      isNew={isNew}
                      hasNewVersionAvailable={hasNewVersionAvailable}
                    />
                  </Flex>
                  <Box
                    fontSize="12px"
                    color="myGray.500"
                    whiteSpace="nowrap"
                    overflow="hidden"
                    textOverflow="ellipsis"
                  >
                    {toolWithStatus.description || t('app:tools_no_description')}
                  </Box>
                </Box>
                <Box flex={1} />

                {/* version info expand button - show when hover or popover open, only show for system tool set */}
                {(toolState.hoveredToolIndex === index || toolState.openPopoverIndex === index) &&
                  toolConfig?.systemToolSet && (
                    <Popover
                      placement="left"
                      trigger="click"
                      strategy="fixed"
                      gutter={8}
                      onOpen={() => setToolState((prev) => ({ ...prev, openPopoverIndex: index }))}
                      onClose={() => setToolState((prev) => ({ ...prev, openPopoverIndex: null }))}
                    >
                      <PopoverTrigger>
                        <Box
                          p={1}
                          cursor="pointer"
                          borderRadius="sm"
                          _hover={{ bg: 'myGray.100' }}
                          color="primary.600"
                          w="24px"
                          h="24px"
                          display="flex"
                          alignItems="center"
                          justifyContent="center"
                          flexShrink={0}
                        >
                          <MyIcon name="common/ellipsis" w="16px" />
                        </Box>
                      </PopoverTrigger>
                      <PopoverContent
                        width="auto"
                        maxWidth="none"
                        border="1px solid"
                        borderColor="myGray.200"
                        boxShadow="lg"
                        bg="white"
                        zIndex={9999}
                      >
                        <PopoverBody p={0}>
                          <ToolVersionInfo
                            toolId={toolId}
                            isEnabled={isEnabled}
                            selectedVersion={toolOperations.getVersionInfo(toolId, toolWithStatus)}
                            onEnabledChange={(enabled) =>
                              toolOperations.setEnabled(toolId, enabled)
                            }
                            onVersionChange={(versionId) =>
                              toolOperations.setVersion(toolId, versionId)
                            }
                            allToolsKeepLatest={toolState.allToolsKeepLatest}
                          />
                        </PopoverBody>
                      </PopoverContent>
                    </Popover>
                  )}
              </Flex>
            );
          })}
        </Box>
      </Container>
      <Flex alignItems="center" gap={3} pl={3}>
        <Checkbox
          isChecked={toolState.allToolsKeepLatest}
          onChange={(e) => toolOperations.toggleAllKeepLatest(e.target.checked)}
        >
          {t('app:all_tools_keep_latest')}
        </Checkbox>
      </Flex>
    </NodeCard>
  );
};

const ToolVersionInfo = ({
  toolId,
  isEnabled,
  selectedVersion: initialSelectedVersion,
  onEnabledChange,
  onVersionChange,
  allToolsKeepLatest
}: {
  toolId: string;
  isEnabled: boolean;
  selectedVersion: string;
  onEnabledChange: (enabled: boolean) => void;
  onVersionChange: (versionId: string) => void;
  allToolsKeepLatest: boolean;
}) => {
  const { t } = useTranslation();
  const [selectedVersion, setSelectedVersion] = useState<string>(initialSelectedVersion);

  const { data: versionList } = useScrollPagination(getToolVersionList, {
    pageSize: 20,
    params: { pluginId: toolId },
    refreshDeps: [toolId],
    manual: false
  });

  useEffect(() => {
    setSelectedVersion(initialSelectedVersion);
  }, [initialSelectedVersion]);

  useEffect(() => {
    if (allToolsKeepLatest) {
      setSelectedVersion('');
    }
  }, [allToolsKeepLatest]);

  const handleVersionChange = useCallback(
    (versionId: string) => {
      setSelectedVersion(versionId);
      onVersionChange(versionId);
    },
    [onVersionChange]
  );

  return (
    <Box p={3} minWidth="200px" maxWidth="280px">
      <Box fontSize="xs" color="myGray.600">
        <Flex
          alignItems="center"
          justifyContent="space-between"
          mb={2}
          pb={2}
          borderBottom="1px solid"
          borderColor="myGray.200"
        >
          <Text fontSize="xs" fontWeight="medium">
            {t('app:enable_tool')}
          </Text>
          <Switch
            size="sm"
            isChecked={isEnabled}
            onChange={(e) => onEnabledChange(e.target.checked)}
          />
        </Flex>

        {versionList?.length ? (
          <Box>
            {allToolsKeepLatest && (
              <Text fontSize="xs" color="myGray.500" mb={2}>
                {t('app:current_by_global_setting_all_tools_keep_latest')}
              </Text>
            )}
            <Box maxHeight="160px" overflowY="auto">
              <VersionOption
                isSelected={selectedVersion === ''}
                isDisabled={allToolsKeepLatest}
                onClick={() => handleVersionChange('')}
                label={t('app:keep_the_latest')}
                badge={allToolsKeepLatest ? t('app:global_control') : undefined}
              />

              {versionList.map((item, index) => (
                <VersionOption
                  key={item._id}
                  isSelected={selectedVersion === item._id}
                  isDisabled={allToolsKeepLatest}
                  onClick={() => handleVersionChange(item._id)}
                  label={item.versionName}
                  badge={index === 0 ? t('app:newest') : undefined}
                />
              ))}
            </Box>
          </Box>
        ) : (
          <Box fontSize="xs" color="myGray.500">
            {t('app:no_version_info')}
          </Box>
        )}
      </Box>
    </Box>
  );
};

const VersionOption = ({
  isSelected,
  isDisabled,
  onClick,
  label,
  badge
}: {
  isSelected: boolean;
  isDisabled: boolean;
  onClick: () => void;
  label: string;
  badge?: string;
}) => (
  <Box
    mb={1}
    p={2}
    bg={isSelected ? 'primary.50' : 'white'}
    borderRadius="sm"
    cursor={isDisabled ? 'not-allowed' : 'pointer'}
    opacity={isDisabled ? 0.6 : 1}
    _hover={{
      bg: isDisabled
        ? isSelected
          ? 'primary.50'
          : 'white'
        : isSelected
          ? 'primary.50'
          : 'myGray.50'
    }}
    onClick={isDisabled ? undefined : onClick}
  >
    <Flex alignItems="center" gap={2}>
      <Text fontSize="xs" color={isSelected ? 'primary.600' : 'myGray.700'}>
        {label}
      </Text>
      {badge && (
        <Box px={2} py={0.5} fontSize="xs" color="primary.600" bg="primary.50" borderRadius="sm">
          {badge}
        </Box>
      )}
    </Flex>
  </Box>
);

// show status tag
const StatusTag = ({
  isEnabled,
  isDeprecated,
  isNew,
  hasNewVersionAvailable
}: {
  isEnabled: boolean;
  isDeprecated: boolean;
  isNew: boolean;
  hasNewVersionAvailable: boolean;
}) => {
  const { t } = useTranslation();
  const tagConfigs = [
    { condition: !isEnabled, text: t('app:disabled'), color: 'myGray.600', bg: 'myGray.100' },
    { condition: isDeprecated, text: t('app:invalid'), color: 'red.600', bg: 'red.50' },
    { condition: isNew, text: t('app:new_tool'), color: 'green.600', bg: 'green.50' },
    {
      condition: hasNewVersionAvailable,
      text: t('app:new_version'),
      color: 'blue.600',
      bg: 'blue.50'
    }
  ];

  const activeTag = tagConfigs.find((config) => config.condition);

  if (!activeTag) return null;

  return (
    <Box px={2} py={0.5} fontSize="xs" color={activeTag.color} borderRadius="sm" bg={activeTag.bg}>
      {activeTag.text}
    </Box>
  );
};

export default React.memo(NodeToolSet);
