import { Box, Button, ModalBody, ModalFooter, useDisclosure } from '@chakra-ui/react';
import React from 'react';
import { editorStateToText } from './utils';
import Editor from './Editor';
import MyModal from '../../MyModal';
import { useTranslation } from 'next-i18next';
import type { EditorState, LexicalEditor } from 'lexical';
import { type EditorVariableLabelPickerType, type EditorVariablePickerType } from './type.d';
import { useCallback } from 'react';

const PromptEditor = ({
  showOpenModal = true,
  variables = [],
  variableLabels = [],
  value,
  onChange,
  onBlur,
  minH,
  maxH,
  maxLength,
  placeholder,
  title,
  bg = 'white',

  isInvalid,
  isDisabled
}: {
  showOpenModal?: boolean;
  variables?: EditorVariablePickerType[];
  variableLabels?: EditorVariableLabelPickerType[];
  value?: string;
  onChange?: (text: string) => void;
  onBlur?: (text: string) => void;
  minH?: number;
  maxH?: number;
  maxLength?: number;
  placeholder?: string;
  title?: string;
  bg?: string;

  isInvalid?: boolean;
  isDisabled?: boolean;
}) => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { t } = useTranslation();

  const onChangeInput = useCallback(
    (editorState: EditorState, editor: LexicalEditor) => {
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

  return (
    <>
      <Box position="relative">
        <Editor
          showOpenModal={showOpenModal}
          onOpenModal={onOpen}
          variables={variables}
          variableLabels={variableLabels}
          minH={minH}
          maxH={maxH}
          maxLength={maxLength}
          value={value}
          onChange={onChangeInput}
          onBlur={onBlurInput}
          placeholder={placeholder}
          bg={bg}
          isInvalid={isInvalid}
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
      <MyModal isOpen={isOpen} onClose={onClose} iconSrc="modal/edit" title={title} w={'full'}>
        <ModalBody>
          <Editor
            minH={400}
            maxH={400}
            maxLength={maxLength}
            showOpenModal={false}
            variables={variables}
            variableLabels={variableLabels}
            value={value}
            onChange={onChangeInput}
            onBlur={onBlurInput}
            placeholder={placeholder}
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
