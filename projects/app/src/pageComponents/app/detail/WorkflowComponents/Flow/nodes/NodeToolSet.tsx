import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import React, { useCallback } from 'react';
import { type NodeProps } from 'reactflow';
import NodeCard from './render/NodeCard';
import Container from '../components/Container';
import IOTitle from '../components/IOTitle';
import ToolSetList, { getNodeToolSetList } from './components/ToolSetList';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import { WorkflowActionsContext } from '../../context/workflowActionsContext';

const NodeToolSet = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { t } = useTranslation();
  const toolList = getNodeToolSetList(data);
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);
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
