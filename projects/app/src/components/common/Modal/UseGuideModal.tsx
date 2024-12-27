import { Box, ModalBody, useDisclosure } from '@chakra-ui/react';
import Markdown from '@/components/Markdown';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { getDocPath } from '@/web/common/system/doc';
import React from 'react';

const UseGuideModal = ({
  children,
  title,
  iconSrc,
  text,
  link
}: {
  children: ({ onClick }: { onClick: () => void }) => React.ReactNode;
  title?: string;
  iconSrc?: string;
  text?: string;
  link?: string;
}) => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const onClick = () => {
    if (link) {
      return window.open(getDocPath(link), '_blank');
    }
    if (text) {
      return onOpen();
    }
  };

  return (
    <>
      {children({ onClick })}
      {isOpen && (
        <MyModal isOpen iconSrc={iconSrc} title={title} onClose={onClose} minW={'600px'}>
          <ModalBody>
            <Box border={'base'} borderRadius={'10px'} p={4} minH={'500px'}>
              <Markdown source={text} />
            </Box>
          </ModalBody>
        </MyModal>
      )}
    </>
  );
};

export default React.memo(UseGuideModal);
