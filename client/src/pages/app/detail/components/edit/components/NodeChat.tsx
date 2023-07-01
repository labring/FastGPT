import React, { useMemo } from 'react';
import { NodeProps } from 'reactflow';
import NodeCard from './modules/NodeCard';
import { FlowModuleItemType } from '@/types/flow';
import Divider from './modules/Divider';
import Container from './modules/Container';
import RenderInput from './render/RenderInput';
import RenderOutput from './render/RenderOutput';
import { FlowOutputItemTypeEnum } from '@/constants/flow';

const NodeChat = ({
  data: { moduleId, inputs, outputs, onChangeNode, ...props }
}: NodeProps<FlowModuleItemType>) => {
  const outputsLen = useMemo(
    () => outputs.filter((item) => item.type !== FlowOutputItemTypeEnum.hidden).length,
    [outputs]
  );
  return (
    <NodeCard minW={'400px'} logo={'/icon/logo.png'} name={'对话'} moduleId={moduleId} {...props}>
      <Divider text="Input" />
      <Container>
        <RenderInput moduleId={moduleId} onChangeNode={onChangeNode} flowInputList={inputs} />
      </Container>
      {outputsLen > 0 && (
        <>
          <Divider text="Output" />
          <Container>
            <RenderOutput flowOutputList={outputs} />
          </Container>
        </>
      )}
    </NodeCard>
  );
};
export default React.memo(NodeChat);
