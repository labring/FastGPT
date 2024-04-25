import React from 'react';
import { NodeProps } from 'reactflow';
import NodeCard from './render/NodeCard';
import { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/index.d';
import Container from '../components/Container';
import RenderOutput from './render/RenderOutput';
import IOTitle from '../components/IOTitle';
import { useTranslation } from 'next-i18next';

const NodeStart = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { t } = useTranslation();
  const { nodeId, outputs } = data;

  return (
    <NodeCard
      minW={'240px'}
      selected={selected}
      menuForbid={{
        rename: true,
        copy: true,
        delete: true
      }}
      {...data}
    >
      <Container borderTop={'2px solid'} borderTopColor={'myGray.200'} textAlign={'end'}>
        <IOTitle text={t('common.Output')} />
        <RenderOutput nodeId={nodeId} flowOutputList={outputs} />
      </Container>
    </NodeCard>
  );
};

export default React.memo(NodeStart);
