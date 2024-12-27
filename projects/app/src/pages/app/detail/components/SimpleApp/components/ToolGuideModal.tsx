import Markdown from '@/components/Markdown';
import { Box, ModalBody, useDisclosure } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import React from 'react';

const ToolGuideModal = ({
  children,
  currentTool
}: {
  children: ({ onOpen }: { onOpen: () => void }) => React.ReactNode;
  currentTool: {
    name?: string;
    avatar?: string;
    userGuide?: string;
  };
}) => {
  const { isOpen, onOpen, onClose } = useDisclosure();

  return (
    <>
      {children({ onOpen })}
      {isOpen && (
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
      )}
    </>
  );
};

export default React.memo(ToolGuideModal);
