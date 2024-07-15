import React from 'react';
import { ModalBody, Box, useTheme } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { DispatchNodeResponseType } from '@fastgpt/global/core/workflow/runtime/type.d';

const ContextModal = ({
  context = [],
  onClose
}: {
  context: DispatchNodeResponseType['historyPreview'];
  onClose: () => void;
}) => {
  const theme = useTheme();

  return (
    <MyModal
      isOpen={true}
      onClose={onClose}
      iconSrc="/imgs/modal/chatHistory.svg"
      title={`上下文预览(${context.length}条)`}
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
            <Box>{item.value}</Box>
          </Box>
        ))}
      </ModalBody>
    </MyModal>
  );
};

export default ContextModal;
