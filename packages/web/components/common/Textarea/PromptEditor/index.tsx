import { Button, ModalBody, ModalFooter, useDisclosure } from '@chakra-ui/react';
import { VariableItemType } from '@fastgpt/global/core/module/type';
import { useState } from 'react';
import { editorStateToText } from './utils';
import Editor from './Editor';
import MyModal from '../../MyModal';
import { useTranslation } from 'next-i18next';
import { $getRoot } from 'lexical';

export default function PromptEditor({
  variables,
  defaultValue,
  onChange,
  onBlur,
  h,
  placeholder,
  title
}: {
  variables: VariableItemType[];
  defaultValue: string;
  onChange?: (text: string) => void;
  onBlur: (text: string) => void;
  h?: number;
  placeholder?: string;
  title: string;
}) {
  const { isOpen, onOpen, onClose } = useDisclosure();

  const [newDefaultValue, setNewDefaultValue] = useState(defaultValue);

  const { t } = useTranslation();

  return (
    <>
      <Editor
        showResize
        showOpenModal
        onOpenModal={onOpen}
        variables={variables}
        h={h}
        defaultValue={newDefaultValue}
        onChange={(editorState) => {
          const text = editorState.read(() => $getRoot().getTextContent());
          if (onChange) onChange(text.replaceAll('\n\n', '\n'));
        }}
        onBlur={(editor) => {
          const text = editorStateToText(editor);
          onBlur(text);
          setNewDefaultValue(text);
        }}
        placeholder={placeholder}
      />
      <MyModal isOpen={isOpen} onClose={onClose} iconSrc="modal/edit" title={title} w={'full'}>
        <ModalBody>
          <Editor
            h={400}
            showResize
            showOpenModal={false}
            variables={variables}
            defaultValue={newDefaultValue}
            onChange={(editorState) => {
              const text = editorState.read(() => $getRoot().getTextContent());
              if (onChange) onChange(text.replaceAll('\n\n', '\n'));
            }}
            onBlur={(editor) => {
              const text = editorStateToText(editor);
              onBlur(text);
              setNewDefaultValue(text);
            }}
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
}
