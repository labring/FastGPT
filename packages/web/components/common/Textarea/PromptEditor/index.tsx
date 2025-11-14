import { Box, Button, ModalBody, ModalFooter, useDisclosure } from '@chakra-ui/react';
import React, { useMemo, useCallback } from 'react';
import { editorStateToText } from './utils';
import type { EditorProps } from './Editor';
import Editor from './Editor';
import MyModal from '../../MyModal';
import { useTranslation } from 'next-i18next';
import type { LexicalEditor } from 'lexical';
import type { FormPropsType } from './type';

const PromptEditor = ({
  showOpenModal = true,
  value,
  onChange,
  onBlur,
  onKeyDown,
  title,
  isDisabled,
  ...props
}: FormPropsType &
  Omit<EditorProps, 'value'> & {
    value?: string;
    title?: string;
    isDisabled?: boolean;
    onChange?: (text: string) => void;
    onBlur?: (text: string) => void;
  }) => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { t } = useTranslation();

  const onChangeInput = useCallback(
    (editor: LexicalEditor) => {
      const text = editorStateToText(editor);
      onChange?.(text);
    },
    [onChange]
  );

  const onBlurInput = useCallback(
    (editor: LexicalEditor) => {
      const text = editorStateToText(editor);
      onBlur?.(text);
    },
    [onBlur]
  );

  const formattedValue = useMemo(() => {
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }

    if (value === undefined || value === null) {
      return '';
    }

    return String(value || '');
  }, [value]);

  return (
    <>
      <Box position="relative">
        <Editor
          {...props}
          showOpenModal={showOpenModal}
          onOpenModal={onOpen}
          value={formattedValue}
          onChange={onChangeInput}
          onChangeText={onChange}
          onBlur={onBlurInput}
          onKeyDown={onKeyDown}
        />
        {isDisabled && (
          <Box
            position="absolute"
            top={0}
            left={0}
            right={0}
            bottom={0}
            bg="rgba(255, 255, 255, 0.4)"
            borderRadius="md"
            zIndex={1}
            cursor="not-allowed"
          />
        )}
      </Box>

      <MyModal
        isOpen={isOpen}
        onClose={onClose}
        iconSrc="modal/edit"
        title={title || t('common:Edit')}
        w={'full'}
      >
        <ModalBody>
          <Editor
            {...props}
            minH={400}
            maxH={400}
            showOpenModal={false}
            value={formattedValue}
            onChange={onChangeInput}
            onChangeText={onChange}
            onBlur={onBlurInput}
            onKeyDown={onKeyDown}
          />
        </ModalBody>
        <ModalFooter>
          <Button mr={2} onClick={onClose} px={6}>
            {t('common:Confirm')}
          </Button>
        </ModalFooter>
      </MyModal>
    </>
  );
};

export default React.memo(PromptEditor);
