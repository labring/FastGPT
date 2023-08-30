import React from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Flex, Box } from '@chakra-ui/react';
import NodeCard from '../modules/NodeCard';
import { SystemInputEnum } from '@/constants/app';
import { FlowModuleItemType } from '@/types/flow';
import Divider from '../modules/Divider';
import Container from '../modules/Container';
import Label from '../modules/Label';

const NodeTFSwitch = ({ data: { inputs, outputs, ...props } }: NodeProps<FlowModuleItemType>) => {
  return (
    <NodeCard minW={'220px'} {...props}>
      <Divider text="input Output" />
      <Container h={'100px'} py={0} px={0} display={'flex'} alignItems={'center'}>
        <Box flex={1} pl={'12px'}>
          <Label
            required
            description="When receiving false, 0, null, undefined or an empty string, execute False, otherwise execute True"
          >
            {'enter'}
          </Label>
          <Handle
            style={{
              top: '50%',
              left: '0',
              transform: 'translate(-50%,-50%)',
              width: '12px',
              height: '12px',
              background: '#9CA2A8'
            }}
            id={SystemInputEnum.switch}
            type="target"
            position={Position.Left}
            onConnect={(params) => console.log('input onConnect', params)}
          />
        </Box>
        <Box flex={1} pr={'12px'}>
          <Flex alignItems={'center'} justifyContent={'flex-end'} mb={'26px'} position={'relative'}>
            <Label>True</Label>
            <Handle
              style={{
                top: '0',
                right: '-12px',
                transform: 'translate(50%,5px)',
                width: '12px',
                height: '12px',
                background: '#9CA2A8'
              }}
              id={'true'}
              type="source"
              position={Position.Right}
              onConnect={(params) => console.log('handle onConnect', params)}
            />
          </Flex>
          <Flex alignItems={'center'} justifyContent={'flex-end'} position={'relative'}>
            <Label>False</Label>
            <Handle
              style={{
                bottom: '0',
                right: '-12px',
                transform: 'translate(50%,-5px)',
                width: '12px',
                height: '12px',
                background: '#9CA2A8'
              }}
              id={'false'}
              type="source"
              position={Position.Right}
              onConnect={(params) => console.log('handle onConnect', params)}
            />
          </Flex>
        </Box>
      </Container>
    </NodeCard>
  );
};
export default React.memo(NodeTFSwitch);
