import { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { NodeProps } from 'reactflow';
import NodeCard from './render/NodeCard';
import Reference from './render/RenderInput/templates/Reference';
import { Box } from '@chakra-ui/react';
import React from 'react';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';

const NodeLoopEnd = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { nodeId, inputs } = data;
  const inputItem = inputs.find((input) => input.key === NodeInputKeyEnum.loopOutputArrayElement);

  if (!inputItem) return null;
  return (
    <NodeCard
      selected={selected}
      {...data}
      w={'420px'}
      menuForbid={{
        copy: true,
        delete: true,
        debug: true
      }}
    >
      <Box px={4} pb={4}>
        <Reference item={inputItem} nodeId={nodeId} />
      </Box>
    </NodeCard>
  );
};

export default React.memo(NodeLoopEnd);
