import { DragHandleIcon } from '@chakra-ui/icons';
import { Box, BoxProps } from '@chakra-ui/react';
import React from 'react';
import { DraggableProvided } from 'react-beautiful-dnd';

const DragIcon = ({ provided, ...props }: { provided: DraggableProvided } & BoxProps) => {
  return (
    <Box {...provided.dragHandleProps} {...props} lineHeight={1}>
      <DragHandleIcon color={'myGray.500'} _hover={{ color: 'primary.600' }} />
    </Box>
  );
};

export default DragIcon;
