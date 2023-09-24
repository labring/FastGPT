import React from 'react';
import { NodeProps } from 'reactflow';
import NodeCard from '../modules/NodeCard';
import { FlowModuleItemType } from '@/types/flow';
import Divider from '../modules/Divider';
import Container from '../modules/Container';
import RenderInput from '../render/RenderInput';
import { Box, Button } from '@chakra-ui/react';
import { SmallAddIcon } from '@chakra-ui/icons';
import RenderOutput from '../render/RenderOutput';

import { FlowInputItemTypeEnum, FlowOutputItemTypeEnum, FlowValueTypeEnum } from '@/constants/flow';
import { customAlphabet } from 'nanoid';
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 6);

const NodeHttp = ({ data }: NodeProps<FlowModuleItemType>) => {
  const { moduleId, inputs, outputs, onChangeNode } = data;
  return (
    <NodeCard minW={'350px'} {...data}>
      <Container borderTop={'2px solid'} borderTopColor={'myGray.200'}>
        <RenderInput moduleId={moduleId} onChangeNode={onChangeNode} flowInputList={inputs} />
        <Button
          variant={'base'}
          mt={5}
          leftIcon={<SmallAddIcon />}
          onClick={() => {
            const key = nanoid();
            onChangeNode({
              moduleId,
              type: 'addInput',
              key,
              value: {
                key,
                valueType: FlowValueTypeEnum.string,
                type: FlowInputItemTypeEnum.target,
                label: `入参${inputs.length - 1}`,
                edit: true
              }
            });
          }}
        >
          添加入参
        </Button>
      </Container>
      <Divider text="Output" />
      <Container>
        <RenderOutput onChangeNode={onChangeNode} moduleId={moduleId} flowOutputList={outputs} />
        <Box textAlign={'right'} mt={5}>
          <Button
            variant={'base'}
            leftIcon={<SmallAddIcon />}
            onClick={() => {
              const key = nanoid();
              onChangeNode({
                moduleId,
                type: 'outputs',
                key,
                value: [
                  {
                    key,
                    label: `出参${outputs.length}`,
                    valueType: FlowValueTypeEnum.string,
                    type: FlowOutputItemTypeEnum.source,
                    edit: true,
                    targets: []
                  }
                ].concat(outputs as any)
              });
            }}
          >
            添加出参
          </Button>
        </Box>
      </Container>
    </NodeCard>
  );
};
export default React.memo(NodeHttp);
