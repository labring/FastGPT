import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import React, { useCallback, useMemo, useState } from 'react';
import { type NodeProps } from 'reactflow';
import NodeCard from './render/NodeCard';
import Container from '../components/Container';
import IOTitle from '../components/IOTitle';
import ToolSetList, { getNodeToolSetList } from './components/ToolSetList';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import { WorkflowActionsContext } from '../../context/workflowActionsContext';
import { Box, Button, Flex, Input } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import HeaderAuthConfig from '@/components/common/secret/HeaderAuthConfig';
import HttpSchemaConfigModal from '@/pageComponents/app/detail/Edit/HTTPTools/SchemaConfigModal';
import { HttpToolDetailModal } from '@/pageComponents/app/detail/Edit/HTTPTools/EditForm';
import { McpToolDetailModal } from '@/pageComponents/app/detail/Edit/MCPTools/EditForm';
import type { McpToolConfigType } from '@fastgpt/global/core/app/tool/mcpTool/type';
import type { HttpToolConfigType } from '@fastgpt/global/core/app/tool/httpTool/type';
import type { StoreSecretValueType } from '@fastgpt/global/common/secret/type';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { getMCPTools } from '@/web/core/app/api/mcpTools';
import type {
  HttpToolSetRuntimeConfigType,
  McpToolSetRuntimeConfigType
} from '@fastgpt/global/core/workflow/type/node';

const NodeToolSet = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { t } = useTranslation();
  const toolList = getNodeToolSetList(data);
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [toolDetailIndex, setToolDetailIndex] = useState<number | null>(null);
  const mcpToolSet = data.toolConfig?.mcpToolSet;
  const httpToolSet = data.toolConfig?.httpToolSet;
  const localMcpToolSet =
    !data.pluginId && mcpToolSet && 'url' in mcpToolSet ? mcpToolSet : undefined;
  const localHttpToolSet =
    !data.pluginId && httpToolSet && !('toolId' in httpToolSet) ? httpToolSet : undefined;
  const toolDetail = toolDetailIndex === null ? undefined : toolList[toolDetailIndex];
  const onSaveDescription = useCallback(
    (index: number, description: string) => {
      const toolSetKey = (['mcpToolSet', 'httpToolSet', 'systemToolSet'] as const).find(
        (key) => data.toolConfig?.[key]
      );
      if (!toolSetKey || !data.toolConfig) return;

      const toolSet = data.toolConfig[toolSetKey];
      if (!toolSet) return;

      onChangeNode({
        nodeId: data.nodeId,
        type: 'attr',
        key: 'toolConfig',
        value: {
          ...data.toolConfig,
          [toolSetKey]: {
            ...toolSet,
            toolList: (toolSet.toolList ?? []).map((tool, toolIndex) =>
              toolIndex === index ? { ...tool, description } : tool
            )
          }
        }
      });
    },
    [data.nodeId, data.toolConfig, onChangeNode]
  );
  const onParseMcpTools = useCallback(
    (config: McpToolSetRuntimeConfigType) => {
      if (!localMcpToolSet || !data.toolConfig) return;

      onChangeNode({
        nodeId: data.nodeId,
        type: 'attr',
        key: 'toolConfig',
        value: {
          ...data.toolConfig,
          mcpToolSet: config
        }
      });
    },
    [data.nodeId, data.toolConfig, localMcpToolSet, onChangeNode]
  );
  const onSaveHttpToolList = useCallback(
    (nextToolList: HttpToolConfigType[]) => {
      if (!localHttpToolSet || !data.toolConfig) return;

      onChangeNode({
        nodeId: data.nodeId,
        type: 'attr',
        key: 'toolConfig',
        value: {
          ...data.toolConfig,
          httpToolSet: {
            ...localHttpToolSet,
            toolList: nextToolList.map(({ headerSecret: _headerSecret, ...tool }) => tool)
          }
        }
      });
    },
    [data.nodeId, data.toolConfig, localHttpToolSet, onChangeNode]
  );
  const onSaveMcpToolList = useCallback(
    (nextToolList: McpToolConfigType[]) => {
      if (!localMcpToolSet || !data.toolConfig) return;

      onChangeNode({
        nodeId: data.nodeId,
        type: 'attr',
        key: 'toolConfig',
        value: {
          ...data.toolConfig,
          mcpToolSet: {
            ...localMcpToolSet,
            toolList: nextToolList
          }
        }
      });
    },
    [data.nodeId, data.toolConfig, localMcpToolSet, onChangeNode]
  );
  const onSaveHttpToolSet = useCallback(
    (config: HttpToolSetRuntimeConfigType) => {
      onChangeNode({
        nodeId: data.nodeId,
        type: 'attr',
        key: 'toolConfig',
        value: {
          ...data.toolConfig,
          httpToolSet: config
        }
      });
      setIsConfigOpen(false);
    },
    [data.nodeId, data.toolConfig, onChangeNode]
  );

  const title = useMemo(
    () => (
      <Flex alignItems={'center'} justifyContent={'space-between'} minW={0}>
        <IOTitle text={t('app:MCP_tools_list')} {...data} catchError={undefined} mb={0} minW={0} />
        {localHttpToolSet && (
          <Button
            size={'sm'}
            variant={'primary'}
            ml={3}
            leftIcon={<MyIcon name={'common/setting'} w={'16px'} />}
            onClick={() => setIsConfigOpen(true)}
          >
            {t('app:toolset_config')}
          </Button>
        )}
      </Flex>
    ),
    [data, localHttpToolSet, t]
  );

  return (
    <NodeCard minW={'350px'} maxW={'520px'} selected={selected} {...data}>
      <Container>
        {localMcpToolSet && (
          <McpToolSetForm initialConfig={localMcpToolSet} onParse={onParseMcpTools} />
        )}
        <ToolSetList
          toolList={toolList}
          onSaveDescription={data.pluginId ? onSaveDescription : undefined}
          onOpenTool={
            localMcpToolSet || localHttpToolSet ? (index) => setToolDetailIndex(index) : undefined
          }
          emptyText={localMcpToolSet ? t('app:MCP_tools_empty') : t('app:tools_no_data')}
          emptyMinH={localMcpToolSet ? '160px' : '120px'}
          title={title}
        />
      </Container>
      {isConfigOpen && localHttpToolSet && (
        <HttpSchemaConfigModal
          initialConfig={localHttpToolSet}
          onClose={() => setIsConfigOpen(false)}
          onSaveConfig={onSaveHttpToolSet}
        />
      )}
      {toolDetail && localHttpToolSet && (
        <HttpToolDetailModal
          tool={toolDetail as HttpToolConfigType}
          toolList={localHttpToolSet.toolList}
          baseUrl={localHttpToolSet.baseUrl || ''}
          apiSchemaStr={localHttpToolSet.apiSchemaStr || ''}
          headerSecret={localHttpToolSet.headerSecret || {}}
          customHeaders={localHttpToolSet.customHeaders || '{}'}
          isCustomToolSet
          onClose={() => setToolDetailIndex(null)}
          onSaveToolList={onSaveHttpToolList}
        />
      )}
      {toolDetail && localMcpToolSet && (
        <McpToolDetailModal
          tool={toolDetail as McpToolConfigType}
          showIcon={false}
          toolList={localMcpToolSet.toolList ?? []}
          onSaveToolList={onSaveMcpToolList}
          onClose={() => setToolDetailIndex(null)}
        />
      )}
    </NodeCard>
  );
};

export default React.memo(NodeToolSet);

const McpToolSetForm = ({
  initialConfig,
  onParse
}: {
  initialConfig: McpToolSetRuntimeConfigType;
  onParse: (config: McpToolSetRuntimeConfigType) => void;
}) => {
  const { t } = useTranslation();
  const [url, setUrl] = useState(initialConfig.url);
  const [headerSecret, setHeaderSecret] = useState<StoreSecretValueType>(
    initialConfig.headerSecret ?? {}
  );
  const { runAsync: parseTools, loading } = useRequest(
    async ({ url, headerSecret }: { url: string; headerSecret: StoreSecretValueType }) =>
      await getMCPTools({ url, headerSecret }),
    {
      manual: true,
      onSuccess: (toolList, [config]) => onParse({ ...config, toolList }),
      errorToast: t('app:MCP_tools_parse_failed')
    }
  );

  return (
    <Box mb={4} className={'nodrag nowheel'}>
      <Flex alignItems={'center'} mb={3}>
        <MyIcon name={'common/linkBlue'} w={'20px'} />
        <Box ml={2} flex={1} fontSize={'sm'} fontWeight={'medium'} color={'myGray.900'}>
          {t('app:MCP_tools_url')}
        </Box>
        <HeaderAuthConfig
          storeHeaderSecretConfig={headerSecret}
          onUpdate={setHeaderSecret}
          buttonProps={{ size: 'sm', variant: 'primary' }}
        />
      </Flex>
      <Flex gap={2}>
        <Input
          size={'sm'}
          placeholder={t('app:MCP_tools_url_placeholder')}
          value={url}
          onChange={(event) => setUrl(event.target.value)}
        />
        <Button
          size={'sm'}
          variant={'whitePrimary'}
          flexShrink={0}
          isLoading={loading}
          onClick={() => parseTools({ url, headerSecret })}
        >
          {t('common:Parse')}
        </Button>
      </Flex>
    </Box>
  );
};
