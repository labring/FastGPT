import { DragHandleIcon } from '@chakra-ui/icons';
import { Box } from '@chakra-ui/react';
import React from 'react';
import { DraggableProvided } from 'react-beautiful-dnd';

const DragIcon = ({ provided }: { provided: DraggableProvided }) => {
  return (
    <Box {...provided.dragHandleProps}>
      <DragHandleIcon color={'myGray.500'} _hover={{ color: 'primary.600' }} />
    </Box>
  );
};

export default DragIcon;
