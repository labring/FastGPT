import { Box, Button, Flex, Input } from '@chakra-ui/react';
import { getMCPTools } from '@/web/core/app/api/mcpTools';
import HeaderAuthConfig from '@/components/common/secret/HeaderAuthConfig';
import type { StoreSecretValueType } from '@fastgpt/global/common/secret/type';
import type {
  WorkflowNodeActions,
  WorkflowNodeData
} from '@fastgpt/global/core/workflow/editor/types';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import MyIcon from '@fastgpt/web/components/common/Icon';
import {
  HttpToolSetNodeConfigSchema,
  McpToolSetNodeConfigSchema,
  type HttpToolSetNodeConfigType,
  type McpToolSetNodeConfigType
} from '@fastgpt/global/core/workflow/type/node';
import { useTranslation } from 'next-i18next';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { CanvasNodeProps } from '@/web/core/workflow/editor/canvas/canvasTypes';
import { useNode, useNodeActions } from '@/web/core/workflow/editor/react/useNode';
import { useWorkflowRuntime } from '@/web/core/workflow/editor/session/workflowSession';
import SchemaConfigModal from '@/pageComponents/app/detail/Edit/HTTPTools/SchemaConfigModal';
import NodeCard from './render/NodeCard';
import Container from '../components/Container';
import IOTitle from '../components/IOTitle';
import ToolSetList, { getNodeToolSetList } from './components/ToolSetList';

const NodeToolSet = ({ data, selected }: CanvasNodeProps) => {
  const { t } = useTranslation();
  const node = useNode<WorkflowNodeData>(data.nodeId, (current) => current?.data);
  const nodeActions = useNodeActions(data.nodeId);
  const inputs = node?.inputs ?? [];
  const toolConfig = node?.toolConfig ?? data.toolConfig;
  const toolList = getNodeToolSetList({ toolConfig });
  const [isEditingHttpToolSet, setIsEditingHttpToolSet] = useState(false);
  const localMcpToolSet = node?.pluginId
    ? undefined
    : McpToolSetNodeConfigSchema.safeParse(toolConfig?.mcpToolSet).data;
  const localHttpToolSet = node?.pluginId
    ? undefined
    : HttpToolSetNodeConfigSchema.safeParse(toolConfig?.httpToolSet).data;

  const updateToolConfig = useCallback(
    (patch: Partial<NonNullable<WorkflowNodeData['toolConfig']>>) => {
      nodeActions?.updateNode((current) => ({
        toolConfig: {
          ...current.toolConfig,
          ...patch
        }
      }));
    },
    [nodeActions]
  );
  const onSaveDescription = useCallback(
    (index: number, description: string) => {
      nodeActions?.updateNode((current) => {
        const currentToolConfig = current.toolConfig;
        const toolSetKey = (['mcpToolSet', 'httpToolSet', 'systemToolSet'] as const).find(
          (key) => currentToolConfig?.[key]
        );
        const toolSet = toolSetKey ? currentToolConfig?.[toolSetKey] : undefined;
        if (!currentToolConfig || !toolSetKey || !toolSet) return {};

        return {
          toolConfig: {
            ...currentToolConfig,
            [toolSetKey]: {
              ...toolSet,
              toolList: (toolSet.toolList ?? []).map((tool, toolIndex) =>
                toolIndex === index ? { ...tool, description } : tool
              )
            }
          }
        };
      });
    },
    [nodeActions]
  );
  const onSaveHttpToolSet = useCallback(
    (config: HttpToolSetNodeConfigType) => updateToolConfig({ httpToolSet: config }),
    [updateToolConfig]
  );

  const title = (
    <Flex alignItems={'center'} justifyContent={'space-between'} minW={0}>
      <IOTitle
        text={t('app:MCP_tools_list')}
        nodeId={data.nodeId}
        inputs={inputs}
        mb={0}
        minW={0}
      />
      {localHttpToolSet && (
        <Button
          size={'sm'}
          variant={'whitePrimary'}
          ml={3}
          leftIcon={<MyIcon name={'common/setting'} w={'16px'} />}
          onClick={() => setIsEditingHttpToolSet(true)}
        >
          {t('app:toolset_config')}
        </Button>
      )}
    </Flex>
  );

  return (
    <NodeCard minW={'524px'} selected={selected} {...data}>
      <Container>
        {localHttpToolSet && toolList.length === 0 ? (
          <Flex
            minH={'120px'}
            alignItems={'center'}
            justifyContent={'center'}
            flexDirection={'column'}
            gap={3}
          >
            <Box color={'myGray.500'} fontSize={'sm'}>
              {t('app:tool_not_configured')}
            </Box>
            <Button size={'sm'} variant={'primary'} onClick={() => setIsEditingHttpToolSet(true)}>
              {t('app:click_to_config')}
            </Button>
          </Flex>
        ) : (
          <>
            {localMcpToolSet && (
              <McpToolSetForm
                key={data.nodeId}
                nodeId={data.nodeId}
                initialConfig={localMcpToolSet}
                updateNode={nodeActions?.updateNode}
              />
            )}
            <ToolSetList
              toolList={toolList}
              onSaveDescription={onSaveDescription}
              emptyText={localMcpToolSet ? t('app:MCP_tools_empty') : undefined}
              emptyMinH={localMcpToolSet ? '160px' : undefined}
              title={title}
            />
          </>
        )}
      </Container>
      {isEditingHttpToolSet && localHttpToolSet && (
        <SchemaConfigModal
          key={`${data.nodeId}:${JSON.stringify(localHttpToolSet)}`}
          initialConfig={localHttpToolSet}
          onClose={() => setIsEditingHttpToolSet(false)}
          onSaveConfig={onSaveHttpToolSet}
        />
      )}
    </NodeCard>
  );
};

export default React.memo(NodeToolSet);

type McpConnection = Pick<McpToolSetNodeConfigType, 'url' | 'headerSecret'>;

const getMcpConnectionKey = ({ url, headerSecret }: McpConnection) =>
  JSON.stringify({ url, headerSecret: headerSecret ?? {} });

// Runtime 的节点 action 跨画布重挂载保持稳定，删除节点后其身份失效。
const pendingMcpParses = new WeakMap<WorkflowNodeActions['updateNode'], symbol>();

const McpToolSetForm = ({
  nodeId,
  initialConfig,
  updateNode
}: {
  nodeId: string;
  initialConfig: McpToolSetNodeConfigType;
  updateNode?: WorkflowNodeActions['updateNode'];
}) => {
  const { t } = useTranslation();
  const runtime = useWorkflowRuntime();
  const [url, setUrl] = useState(initialConfig.url);
  const [headerSecret, setHeaderSecret] = useState<StoreSecretValueType>(
    initialConfig.headerSecret ?? {}
  );
  const lastConfigKeyRef = useRef(getMcpConnectionKey(initialConfig));

  useEffect(() => {
    const configKey = getMcpConnectionKey(initialConfig);
    if (configKey === lastConfigKeyRef.current) return;

    lastConfigKeyRef.current = configKey;
    if (updateNode) pendingMcpParses.delete(updateNode);
    setUrl(initialConfig.url);
    setHeaderSecret(initialConfig.headerSecret ?? {});
  }, [initialConfig, updateNode]);

  const getCurrentConfig = () => {
    const node = runtime && !runtime.isDisposed() ? runtime.getNode(nodeId) : undefined;
    if (!node || node.pluginId) return;
    return McpToolSetNodeConfigSchema.safeParse(node.toolConfig?.mcpToolSet).data;
  };
  const updateConfig = (patch: Partial<McpToolSetNodeConfigType>) => {
    updateNode?.((current) => {
      const config = McpToolSetNodeConfigSchema.safeParse(current.toolConfig?.mcpToolSet).data;
      if (!config || current.pluginId) return {};

      const nextConfig = { ...config, ...patch };
      lastConfigKeyRef.current = getMcpConnectionKey(nextConfig);
      return { toolConfig: { ...current.toolConfig, mcpToolSet: nextConfig } };
    });
  };
  const { run: parseTools, loading } = useRequest(
    async () => {
      const originalConfig = getCurrentConfig();
      if (!runtime || !updateNode || !originalConfig) return;
      const request = Symbol();
      const connection = { url: url.trim(), headerSecret };
      const originalKey = getMcpConnectionKey(originalConfig);
      const requestedKey = getMcpConnectionKey(connection);
      pendingMcpParses.set(updateNode, request);
      const unsubscribe = runtime.subscribe((change) => {
        // 视口外也要让文档替换和本节点的撤销/重做优先于待完成的解析。
        if (
          pendingMcpParses.get(updateNode) === request &&
          (change.kind === 'replace' ||
            (change.kind === 'semantic' &&
              change.origin !== 'command' &&
              change.changedRecords.nodeIds.includes(nodeId)))
        ) {
          pendingMcpParses.delete(updateNode);
        }
      });

      try {
        const tools = await getMCPTools(connection);
        // useRequest 的 onSuccess 随视图取消。请求本身按 Runtime 节点和当前连接配置结算。
        const currentConfig = getCurrentConfig();
        if (
          !currentConfig ||
          pendingMcpParses.get(updateNode) !== request ||
          runtime.getNodeActions(nodeId)?.updateNode !== updateNode
        )
          return;
        const currentKey = getMcpConnectionKey(currentConfig);
        if (currentKey !== originalKey && currentKey !== requestedKey) return;

        const savedDescriptions = new Map(
          currentConfig.toolList.map((tool) => [tool.name, tool.description])
        );
        updateConfig({
          ...connection,
          toolList: tools.map(({ name, description }) => ({
            name,
            description: savedDescriptions.has(name)
              ? (savedDescriptions.get(name) ?? '')
              : (description ?? '')
          }))
        });
      } finally {
        unsubscribe();
        if (pendingMcpParses.get(updateNode) === request) pendingMcpParses.delete(updateNode);
      }
    },
    { errorToast: t('app:MCP_tools_parse_failed') }
  );

  const onUpdateHeaderSecret = (nextHeaderSecret: StoreSecretValueType) => {
    if (updateNode) pendingMcpParses.delete(updateNode);
    setHeaderSecret(nextHeaderSecret);
    updateConfig({ url: url.trim(), headerSecret: nextHeaderSecret });
  };

  return (
    <Box mb={4} className={'nodrag nowheel'}>
      <Flex alignItems={'center'} mb={3}>
        <MyIcon name={'common/linkBlue'} w={'20px'} />
        <Box ml={2} flex={1} fontSize={'sm'} fontWeight={'medium'} color={'myGray.900'}>
          {t('app:MCP_tools_url')}
        </Box>
        <HeaderAuthConfig
          storeHeaderSecretConfig={headerSecret}
          onUpdate={onUpdateHeaderSecret}
          buttonProps={{ size: 'sm' }}
        />
      </Flex>
      <Flex gap={2}>
        <Input
          size={'sm'}
          placeholder={t('app:MCP_tools_url_placeholder')}
          value={url}
          onChange={(event) => {
            if (updateNode) pendingMcpParses.delete(updateNode);
            setUrl(event.target.value);
          }}
          onBlur={() => updateConfig({ url: url.trim(), headerSecret })}
        />
        <Button
          size={'sm'}
          variant={'whitePrimary'}
          flexShrink={0}
          isLoading={loading}
          onClick={() => parseTools()}
        >
          {t('common:Parse')}
        </Button>
      </Flex>
    </Box>
  );
};
