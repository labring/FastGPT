import React from 'react';
import { NodeProps } from 'reactflow';
import NodeCard from '../render/NodeCard';
import { FlowModuleItemType } from '@fastgpt/global/core/module/type.d';
import Divider from '../modules/Divider';
import Container from '../modules/Container';
import RenderInput from '../render/RenderInput';
import { Box, Button } from '@chakra-ui/react';
import { SmallAddIcon } from '@chakra-ui/icons';
import RenderOutput from '../render/RenderOutput';

import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum
} from '@fastgpt/global/core/module/node/constant';
import { ModuleIOValueTypeEnum } from '@fastgpt/global/core/module/constants';
import { customAlphabet } from 'nanoid';
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 6);

const NodeHttp = React.memo(function NodeHttp({ data }: { data: FlowModuleItemType }) {
  const { moduleId, inputs, outputs } = data;

  return (
    <NodeCard minW={'350px'} {...data}>
      <Container borderTop={'2px solid'} borderTopColor={'myGray.200'}>
        <RenderInput moduleId={moduleId} flowInputList={inputs} />
      </Container>
      <Divider text="Output" />
      <Container>
        <RenderOutput moduleId={moduleId} flowOutputList={outputs} />
      </Container>
    </NodeCard>
  );
});
export default function Node({ data }: NodeProps<FlowModuleItemType>) {
  return <NodeHttp data={data} />;
}
