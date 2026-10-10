import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import React, { useCallback } from 'react';
import { type NodeProps } from 'reactflow';
import NodeCard from './render/NodeCard';
import Container from '../components/Container';
import IOTitle from '../components/IOTitle';
import ToolSetList, { getNodeToolSetList } from './components/ToolSetList';
import { useTranslation } from 'next-i18next';
import { useNodeActions } from '@/web/core/workflow/editor/react/useNode';

const NodeToolSet = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { t } = useTranslation();
  const toolList = getNodeToolSetList(data);
  const nodeActions = useNodeActions(data.nodeId);
  const onSaveDescription = useCallback(
    (index: number, description: string) => {
      // 工具集描述是节点语义数据（toolConfig）：基于派发瞬间的记录整块替换后走 updateNode。
      nodeActions?.updateNode((current) => {
        const toolConfig = current.toolConfig;
        const toolSetKey = (['mcpToolSet', 'httpToolSet', 'systemToolSet'] as const).find(
          (key) => toolConfig?.[key]
        );
        const toolSet = toolSetKey ? toolConfig?.[toolSetKey] : undefined;
        if (!toolConfig || !toolSetKey || !toolSet) return {};

        return {
          toolConfig: {
            ...toolConfig,
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

  return (
    <NodeCard minW={'350px'} selected={selected} {...data}>
      <Container>
        <ToolSetList
          toolList={toolList}
          onSaveDescription={onSaveDescription}
          title={<IOTitle text={t('app:MCP_tools_list')} {...data} catchError={undefined} />}
        />
      </Container>
    </NodeCard>
  );
};

export default React.memo(NodeToolSet);
