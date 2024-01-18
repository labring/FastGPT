import { Box, Button, ModalBody, ModalFooter, useDisclosure } from '@chakra-ui/react';
import { VariableItemType } from '@fastgpt/global/core/module/type';
import { useCallback, useRef, useState } from 'react';
import { editorStateToText } from './utils';
import Editor from './Editor';
import ComfirmVar from './modules/ComfirmVar';
import MyIcon from '../../Icon';
import MyModal from '../../MyModal';
import { useTranslation } from 'next-i18next';

export default function PromptEditor({
  variables,
  defaultValue,
  onBlur,
  // defaultVariable,
  // setVariable,
  showOpenModal = true,
  h = 200,
  showResize = true,
  placeholder,
  title
}: {
  variables: VariableItemType[];
  defaultValue: string;
  onBlur: (text: string) => void;
  // defaultVariable: VariableItemType;
  // setVariable: (variables: VariableItemType[]) => void;
  showOpenModal?: boolean;
  h?: number;
  showResize?: boolean;
  placeholder?: string;
  title: string;
}) {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [height, setHeight] = useState(h);

  const [newVariables] = useState<string[]>([]);
  const [showConfirmVar, setShowConfirmVar] = useState(false);

  const [newDefaultValue, setNewDefaultValue] = useState(defaultValue);

  const initialY = useRef(0);
  const { t } = useTranslation();

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    initialY.current = e.clientY;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = e.clientY - initialY.current;
      setHeight((prevHeight) => (prevHeight + deltaY < h ? h : prevHeight + deltaY));
      initialY.current = e.clientY;
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, []);

  return (
    <>
      <Box position={'relative'} w={'full'} h={height}>
        <Editor
          variables={variables}
          defaultValue={newDefaultValue}
          onBlur={(editor) => {
            const text = editorStateToText(editor);
            onBlur(text);
            setNewDefaultValue(text);
          }}
          placeholder={placeholder}
        />
        {/* {showConfirmVar && (
          <ComfirmVar
            newVariables={newVariables}
            onCancel={() => {
              setShowConfirmVar(false);
              newVariables.splice(0, newVariables.length);
            }}
            onConfirm={() => {
              const newVariablesList = [
                ...variables,
                ...newVariables.map((item) => ({ ...defaultVariable, label: item as string }))
              ];
              setVariable(newVariablesList);
              setShowConfirmVar(false);
              newVariables.splice(0, newVariables.length);
            }}
          />
        )} */}
        {showResize && (
          <Box
            position={'absolute'}
            right={'0'}
            bottom={'-1'}
            zIndex={999}
            cursor={'ns-resize'}
            px={'2px'}
            onMouseDown={handleMouseDown}
          >
            <MyIcon name={'common/editor/resizer'} width={'14px'} height={'14px'} />
          </Box>
        )}
        {showOpenModal && (
          <Box
            zIndex={1}
            position={'absolute'}
            bottom={1}
            right={2}
            cursor={'pointer'}
            onClick={onOpen}
          >
            <MyIcon name={'common/fullScreenLight'} w={'14px'} color={'myGray.600'} />
          </Box>
        )}
      </Box>
      <MyModal
        isOpen={isOpen}
        onClose={onClose}
        iconSrc="/imgs/modal/readFeedback.svg"
        title={title}
        w={'full'}
        h={'full'}
      >
        <ModalBody>
          <Box position={'relative'} w={'full'} h={'full'}>
            <Editor
              variables={variables}
              defaultValue={newDefaultValue}
              onBlur={(editor) => {
                const text = editorStateToText(editor);
                onBlur(text);
                setNewDefaultValue(text);
              }}
              placeholder={placeholder}
            />
            {/* {showConfirmVar && (
              <ComfirmVar
                newVariables={newVariables}
                onCancel={() => {
                  setShowConfirmVar(false);
                  newVariables.splice(0, newVariables.length);
                }}
                onConfirm={() => {
                  const newVariablesList = [
                    ...variables,
                    ...newVariables.map((item) => ({ ...defaultVariable, label: item as string }))
                  ];
                  setVariable(newVariablesList);
                  setShowConfirmVar(false);
                  newVariables.splice(0, newVariables.length);
                }}
              />
            )} */}
          </Box>
        </ModalBody>
        <ModalFooter>
          <Button mr={2} onClick={onClose}>
            {t('common.Back')}
          </Button>
        </ModalFooter>
      </MyModal>
    </>
  );
}
