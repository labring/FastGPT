import React from 'react';
import { Box, type StackProps, HStack } from '@chakra-ui/react';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import ToolParamConfig from './ToolParamConfig';

const IOTitle = ({
  text,
  inputs,
  nodeId,
  ...props
}: {
  text?: 'Input' | 'Output' | string;
  inputs?: FlowNodeInputItemType[];
  nodeId?: string;
} & StackProps) => {
  return (
    <HStack fontSize={'md'} alignItems={'center'} fontWeight={'medium'} mb={4} {...props}>
      <Box w={'3px'} h={'14px'} borderRadius={'13px'} bg={'primary.600'} />
      <Box color={'myGray.900'}>{text}</Box>
      <Box flex={1} />
      <ToolParamConfig nodeId={nodeId} inputs={inputs} />
    </HStack>
  );
};

export default React.memo(IOTitle);
