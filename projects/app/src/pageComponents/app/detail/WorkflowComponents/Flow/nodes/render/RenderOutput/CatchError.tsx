import React from 'react';
import type { FlowNodeOutputItemType } from '@fastgpt/global/core/workflow/type/io.d';
import Container from '../../../components/Container';
import RenderOutput from '.';
import { ConnectionSourceHandle } from '../Handle/ConnectionHandle';
import { Box } from '@chakra-ui/react';

const CatchError = ({
  nodeId,
  errorOutputs
}: {
  nodeId: string;
  errorOutputs: FlowNodeOutputItemType[];
}) => {
  return (
    <Box position={'relative'}>
      <Container>
        <RenderOutput nodeId={nodeId} flowOutputList={errorOutputs} />
      </Container>
      <ConnectionSourceHandle nodeId={nodeId} sourceType="source_catch" />
    </Box>
  );
};

export default React.memo(CatchError);
