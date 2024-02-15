import { Button, ModalBody, ModalFooter, useDisclosure } from '@chakra-ui/react';
import React from 'react';
import { editorStateToText } from './utils';
import Editor from './Editor';
import MyModal from '../../MyModal';
import { useTranslation } from 'next-i18next';
import { $getRoot, EditorState, type LexicalEditor } from 'lexical';
import { EditorVariablePickerType } from './type.d';
import { useCallback, useTransition } from 'react';

const PromptEditor = ({
  showOpenModal = true,
  showResize = true,
  variables = [],
  value,
  onChange,
  onBlur,
  h,
  placeholder,
  title
}: {
  showOpenModal?: boolean;
  showResize?: boolean;
  variables?: EditorVariablePickerType[];
  value?: string;
  onChange?: (text: string) => void;
  onBlur?: (text: string) => void;
  h?: number;
  placeholder?: string;
  title?: string;
}) => {
  const { isOpen, onOpen, onClose } = useDisclosure();

  const [, startSts] = useTransition();

  const { t } = useTranslation();

  const onChangeInput = useCallback((editorState: EditorState) => {
    const text = editorState.read(() => $getRoot().getTextContent());
    const formatValue = text.replaceAll('\n\n', '\n').replaceAll('}}{{', '}} {{');
    onChange?.(formatValue);
  }, []);
  const onBlurInput = useCallback((editor: LexicalEditor) => {
    startSts(() => {
      const text = editorStateToText(editor).replaceAll('\n\n', '\n').replaceAll('}}{{', '}} {{');
      onBlur?.(text);
    });
  }, []);

  return (
    <>
      <Editor
        showResize={showResize}
        showOpenModal={showOpenModal}
        onOpenModal={onOpen}
        variables={variables}
        h={h}
        value={value}
        onChange={onChangeInput}
        onBlur={onBlurInput}
        placeholder={placeholder}
      />
      <MyModal isOpen={isOpen} onClose={onClose} iconSrc="modal/edit" title={title} w={'full'}>
        <ModalBody>
          <Editor
            h={400}
            showResize
            showOpenModal={false}
            variables={variables}
            value={value}
            onChange={onChangeInput}
            onBlur={onBlurInput}
            placeholder={placeholder}
          />
        </ModalBody>
        <ModalFooter>
          <Button mr={2} onClick={onClose}>
            {t('common.Confirm')}
          </Button>
        </ModalFooter>
      </MyModal>
    </>
  );
};
export default React.memo(PromptEditor);
