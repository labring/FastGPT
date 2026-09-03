import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import React from 'react';
import { type NodeProps } from 'reactflow';
import NodeCard from './render/NodeCard';
import Container from '../components/Container';
import IOTitle from '../components/IOTitle';
import ToolSetList, { getNodeToolSetList } from './components/ToolSetList';
import { useTranslation } from 'next-i18next';

const NodeToolSet = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { t } = useTranslation();
  const toolList = getNodeToolSetList(data);

  return (
    <NodeCard minW={'350px'} selected={selected} {...data}>
      <Container>
        <ToolSetList
          toolList={toolList}
          title={<IOTitle text={t('app:MCP_tools_list')} {...data} catchError={undefined} />}
        />
      </Container>
    </NodeCard>
  );
};

export default React.memo(NodeToolSet);
