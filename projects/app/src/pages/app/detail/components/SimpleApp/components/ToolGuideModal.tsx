import Markdown from '@/components/Markdown';
import { Box, ModalBody } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import React from 'react';

const ToolGuideModal = ({
  currentTool,
  onClose
}: {
  currentTool: {
    name?: string;
    avatar?: string;
    userGuide?: string;
  };
  onClose: () => void;
}) => {
  return (
    <MyModal
      isOpen
      iconSrc={currentTool.avatar}
      title={currentTool.name}
      onClose={onClose}
      minW={'600px'}
    >
      <ModalBody>
        <Box border={'base'} borderRadius={'10px'} p={4} minH={'500px'}>
          <Markdown source={currentTool.userGuide} />
        </Box>
      </ModalBody>
    </MyModal>
  );
};

export default React.memo(ToolGuideModal);
