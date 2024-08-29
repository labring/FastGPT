import { Box, Button, ModalBody, ModalFooter, useDisclosure } from '@chakra-ui/react';
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
  showResize = true,
  variables = [],
  variableLabels = [],
  value,
  onChange,
  onBlur,
  h,
  maxLength,
  placeholder,
  title,
  isFlow,
  bg = 'white'
}: {
  showOpenModal?: boolean;
  showResize?: boolean;
  variables?: EditorVariablePickerType[];
  variableLabels?: EditorVariableLabelPickerType[];
  value?: string;
  onChange?: (text: string) => void;
  onBlur?: (text: string) => void;
  h?: number;
  maxLength?: number;
  placeholder?: string;
  title?: string;
  isFlow?: boolean;
  bg?: string;
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
        showResize={showResize}
        showOpenModal={showOpenModal}
        onOpenModal={onOpen}
        variables={variables}
        variableLabels={variableLabels}
        h={h}
        maxLength={maxLength}
        value={value}
        onChange={onChangeInput}
        onBlur={onBlurInput}
        placeholder={placeholder}
        isFlow={isFlow}
        bg={bg}
      />
      <MyModal isOpen={isOpen} onClose={onClose} iconSrc="modal/edit" title={title} w={'full'}>
        <ModalBody>
          <Editor
            h={400}
            maxLength={maxLength}
            showResize
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
            {t('common:common.Confirm')}
          </Button>
        </ModalFooter>
      </MyModal>
    </>
  );
};
export default React.memo(PromptEditor);
