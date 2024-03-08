import React from 'react';
import { ModalBody, Box, useTheme } from '@chakra-ui/react';
import { moduleDispatchResType } from '@fastgpt/global/core/chat/type';
import MyModal from '../MyModal';

const ContextModal = ({
  context = [],
  onClose
}: {
  context: moduleDispatchResType['historyPreview'];
  onClose: () => void;
}) => {
  const theme = useTheme();

  return (
    <MyModal
      isOpen={true}
      onClose={onClose}
      iconSrc="/imgs/modal/chatHistory.svg"
      title={`完整对话记录(${context.length}条)`}
      h={['90vh', '80vh']}
      minW={['90vw', '600px']}
      isCentered
    >
      <ModalBody
        whiteSpace={'pre-wrap'}
        textAlign={'justify'}
        wordBreak={'break-all'}
        fontSize={'sm'}
      >
        {context.map((item, i) => (
          <Box
            key={i}
            p={2}
            borderRadius={'md'}
            border={theme.borders.base}
            _notLast={{ mb: 2 }}
            position={'relative'}
          >
            <Box fontWeight={'bold'}>{item.obj}</Box>
            <Box>{JSON.stringify(item.value)}</Box>
          </Box>
        ))}
      </ModalBody>
    </MyModal>
  );
};

export default ContextModal;
