import { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { useTranslation } from 'react-i18next';
import { NodeProps } from 'reactflow';
import NodeCard from './render/NodeCard';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import Reference from './render/RenderInput/templates/Reference';
import { Box } from '@chakra-ui/react';

const NodeLoopEnd = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { t } = useTranslation();
  const { nodeId, inputs, outputs } = data;
  const inputItem = inputs.find((input) => input.key === 'loopOutputArray');

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
        {inputItem && <Reference item={inputItem} nodeId={nodeId} />}
      </Box>
    </NodeCard>
  );
};

export default NodeLoopEnd;
