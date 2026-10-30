import { Box, Button, Flex, Input } from '@chakra-ui/react';
import { getMCPTools } from '@/web/core/app/api/mcpTools';
import HeaderAuthConfig from '@/components/common/secret/HeaderAuthConfig';
import type { StoreSecretValueType } from '@fastgpt/global/common/secret/type';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import MyIcon from '@fastgpt/web/components/common/Icon';
import {
  HttpToolSetNodeConfigSchema,
  McpToolSetNodeConfigSchema,
  type FlowNodeItemType,
  type HttpToolSetNodeConfigType,
  type McpToolSetNodeConfigType
} from '@fastgpt/global/core/workflow/type/node';
import { useTranslation } from 'next-i18next';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { type NodeProps } from 'reactflow';
import { useContextSelector } from 'use-context-selector';
import { WorkflowActionsContext } from '../../context/workflowActionsContext';
import Container from '../components/Container';
import IOTitle from '../components/IOTitle';
import SchemaConfigModal from '@/pageComponents/app/detail/Edit/HTTPTools/SchemaConfigModal';
import ToolSetList, { getNodeToolSetList } from './components/ToolSetList';
import NodeCard from './render/NodeCard';

const NodeToolSet = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { t } = useTranslation();
  const toolList = getNodeToolSetList(data);
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);
  const [editingToolSet, setEditingToolSet] = useState<'mcp' | 'http'>();
  const localMcpToolSet = data.pluginId
    ? undefined
    : McpToolSetNodeConfigSchema.safeParse(data.toolConfig?.mcpToolSet).data;
  const localHttpToolSet = data.pluginId
    ? undefined
    : HttpToolSetNodeConfigSchema.safeParse(data.toolConfig?.httpToolSet).data;

  const updateToolConfig = useCallback(
    (toolConfig: FlowNodeItemType['toolConfig']) => {
      if (!toolConfig) return;
      onChangeNode({
        nodeId: data.nodeId,
        type: 'attr',
        key: 'toolConfig',
        value: {
          ...data.toolConfig,
          ...toolConfig
        }
      });
    },
    [data.nodeId, data.toolConfig, onChangeNode]
  );
  const onSaveDescription = useCallback(
    (index: number, description: string) => {
      const toolSetKey = (['mcpToolSet', 'httpToolSet', 'systemToolSet'] as const).find(
        (key) => data.toolConfig?.[key]
      );
      if (!toolSetKey || !data.toolConfig) return;

      const toolSet = data.toolConfig[toolSetKey];
      if (!toolSet) return;

      updateToolConfig({
        [toolSetKey]: {
          ...toolSet,
          toolList: (toolSet.toolList ?? []).map((tool, toolIndex) =>
            toolIndex === index ? { ...tool, description } : tool
          )
        }
      });
    },
    [data.toolConfig, updateToolConfig]
  );
  const onSaveMcpToolSet = useCallback(
    (config: McpToolSetNodeConfigType) => updateToolConfig({ mcpToolSet: config }),
    [updateToolConfig]
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
        inputs={data.inputs}
        mb={0}
        minW={0}
      />
      {(localMcpToolSet || localHttpToolSet) && (
        <Button
          size={'sm'}
          variant={'primary'}
          ml={3}
          leftIcon={<MyIcon name={'common/setting'} w={'16px'} />}
          onClick={() => setEditingToolSet(localMcpToolSet ? 'mcp' : 'http')}
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
            <Button size={'sm'} variant={'primary'} onClick={() => setEditingToolSet('http')}>
              {t('app:click_to_config')}
            </Button>
          </Flex>
        ) : (
          <>
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
      {editingToolSet === 'mcp' && localMcpToolSet && (
        <McpToolSetForm
          key={`${data.nodeId}:${JSON.stringify(localMcpToolSet)}`}
          initialConfig={localMcpToolSet}
          onUpdateConfig={onSaveMcpToolSet}
          onClose={() => setEditingToolSet(undefined)}
        />
      )}
      {editingToolSet === 'http' && localHttpToolSet && (
        <SchemaConfigModal
          key={`${data.nodeId}:${JSON.stringify(localHttpToolSet)}`}
          initialConfig={localHttpToolSet}
          onClose={() => setEditingToolSet(undefined)}
          onSaveConfig={onSaveHttpToolSet}
        />
      )}
    </NodeCard>
  );
};

export default React.memo(NodeToolSet);

const McpToolSetForm = ({
  initialConfig,
  onUpdateConfig,
  onClose
}: {
  initialConfig: McpToolSetNodeConfigType;
  onUpdateConfig: (config: McpToolSetNodeConfigType) => void;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const [url, setUrl] = useState(initialConfig.url);
  const [headerSecret, setHeaderSecret] = useState<StoreSecretValueType>(
    initialConfig.headerSecret ?? {}
  );
  const closingRef = useRef(false);
  useEffect(
    () => () => {
      closingRef.current = true;
    },
    []
  );
  const { runAsync: parseTools, loading } = useRequest(
    async () =>
      getMCPTools({
        url: url.trim(),
        headerSecret
      }),
    {
      manual: true,
      onSuccess: (tools) => {
        if (closingRef.current) return;

        const savedDescriptions = new Map(
          initialConfig.toolList.map((tool) => [tool.name, tool.description])
        );
        onUpdateConfig({
          ...initialConfig,
          url: url.trim(),
          headerSecret,
          toolList: tools.map(({ name, description }) => ({
            name,
            description: savedDescriptions.has(name)
              ? (savedDescriptions.get(name) ?? '')
              : (description ?? '')
          }))
        });
      },
      errorToast: t('app:MCP_tools_parse_failed')
    }
  );
  const onUpdateHeaderSecret = (nextHeaderSecret: StoreSecretValueType) => {
    setHeaderSecret(nextHeaderSecret);
    onUpdateConfig({ ...initialConfig, url: url.trim(), headerSecret: nextHeaderSecret });
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
          buttonProps={{ size: 'sm', variant: 'primary' }}
        />
      </Flex>
      <Flex gap={2}>
        <Input
          size={'sm'}
          placeholder={t('app:MCP_tools_url_placeholder')}
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          onBlur={() => {
            if (closingRef.current) return;
            onUpdateConfig({ ...initialConfig, url: url.trim(), headerSecret });
          }}
        />
        <Button
          size={'sm'}
          variant={'whiteBase'}
          onClick={() => {
            closingRef.current = true;
            onClose();
          }}
        >
          {t('common:Close')}
        </Button>
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
