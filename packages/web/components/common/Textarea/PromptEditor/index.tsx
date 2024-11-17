import { Button, ModalBody, ModalFooter, useDisclosure } from '@chakra-ui/react';
import React from 'react';
import { editorStateToText } from './utils';
import Editor from './Editor';
import MyModal from '../../MyModal';
import { useTranslation } from 'next-i18next';
import { EditorState, type LexicalEditor } from 'lexical';
import { EditorVariableLabelPickerType, EditorVariablePickerType } from './type.d';
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
  placeholderPaddingX,
  placeholderPaddingY
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
  placeholderPaddingX?: number;
  placeholderPaddingY?: number;
}) => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { t } = useTranslation();

  const onChangeInput = useCallback(
    (editorState: EditorState, editor: LexicalEditor) => {
      const text = editorStateToText(editor).replaceAll('}}{{', '}} {{');
      onChange?.(text);
    },
    [onChange]
  );
  const onBlurInput = useCallback(
    (editor: LexicalEditor) => {
      const text = editorStateToText(editor).replaceAll('}}{{', '}} {{');
      onBlur?.(text);
    },
    [onBlur]
  );

  return (
    <>
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
        placeholderPaddingX={placeholderPaddingX}
        placeholderPaddingY={placeholderPaddingY}
      />
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
            placeholderPaddingX={placeholderPaddingX}
            placeholderPaddingY={placeholderPaddingY}
          />
        </ModalBody>
        <ModalFooter>
          <Button mr={2} onClick={onClose} px={6}>
            {t('common:common.Confirm')}
          </Button>
        </ModalFooter>
      </MyModal>
    </>
  );
};
export default React.memo(PromptEditor);
