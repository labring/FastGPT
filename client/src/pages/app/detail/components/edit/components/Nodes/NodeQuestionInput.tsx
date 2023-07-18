import React from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Box } from '@chakra-ui/react';
import NodeCard from '../modules/NodeCard';
import { FlowModuleItemType } from '@/types/flow';
import Container from '../modules/Container';
import { SystemInputEnum } from '@/constants/app';

const QuestionInputNode = ({
  data: { inputs, outputs, onChangeNode, ...props }
}: NodeProps<FlowModuleItemType>) => {
  return (
    <NodeCard minW={'220px'} {...props}>
      <Container borderTop={'2px solid'} borderTopColor={'myGray.200'} textAlign={'end'}>
        <Box>用户问题</Box>
        <Handle
          style={{
            bottom: '0',
            right: '0',
            transform: 'translate(50%,-5px)',
            width: '12px',
            height: '12px',
            background: '#9CA2A8'
          }}
          id={SystemInputEnum.userChatInput}
          type="source"
          position={Position.Right}
        />
      </Container>
    </NodeCard>
  );
};
export default React.memo(QuestionInputNode);
