import React from 'react';
import { NodeProps } from 'reactflow';
import NodeCard from './modules/NodeCard';
import { FlowModuleItemType } from '@/types/flow';
import Divider from './modules/Divider';
import Container from './modules/Container';
import RenderInput from './render/RenderInput';
import RenderOutput from './render/RenderOutput';
import KBSelect from './Plugins/KBSelect';

const NodeKbSearch = ({
  data: { moduleId, inputs, outputs, onChangeNode, ...props }
}: NodeProps<FlowModuleItemType>) => {
  return (
    <NodeCard minW={'400px'} moduleId={moduleId} {...props}>
      <Divider text="Input" />
      <Container>
        <RenderInput
          moduleId={moduleId}
          onChangeNode={onChangeNode}
          flowInputList={inputs}
          CustomComponent={{
            kb_ids: ({ key, value }) => (
              <KBSelect
                relatedKbs={value}
                onChange={(e) => {
                  onChangeNode({
                    moduleId,
                    key,
                    value: e
                  });
                }}
              />
            )
          }}
        />
      </Container>
      <Divider text="Output" />
      <Container>
        <RenderOutput flowOutputList={outputs} />
      </Container>
    </NodeCard>
  );
};
export default React.memo(NodeKbSearch);
