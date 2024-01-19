import { useState, useRef } from 'react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { PlainTextPlugin } from '@lexical/react/LexicalPlainTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import LexicalErrorBoundary from '@lexical/react/LexicalErrorBoundary';
import VariablePickerPlugin from './plugins/VariablePickerPlugin';
import { Box } from '@chakra-ui/react';
import styles from './index.module.scss';
import VariablePlugin from './plugins/VariablePlugin';
import { VariableNode } from './plugins/VariablePlugin/node';
import { EditorState, LexicalEditor } from 'lexical';
import { textToEditorState } from './utils';
import OnBlurPlugin from './plugins/OnBlurPlugin';
import MyIcon from '../../Icon';
import { PickerMenuItemType } from './type.d';
import { getNanoid } from '@fastgpt/global/common/string/tools';

export default function Editor({
  h = 200,
  showResize = true,
  showOpenModal = true,
  onOpenModal,
  variables,
  onChange,
  onBlur,
  defaultValue,
  placeholder = ''
}: {
  h?: number;
  showResize?: boolean;
  showOpenModal?: boolean;
  onOpenModal?: () => void;
  variables: PickerMenuItemType[];
  onChange?: (editorState: EditorState) => void;
  onBlur?: (editor: LexicalEditor) => void;
  defaultValue?: string;
  placeholder?: string;
}) {
  const key = useRef(getNanoid(6));
  const [height, setHeight] = useState(h);
  const [initialConfig, setInitialConfig] = useState({
    namespace: 'promptEditor',
    nodes: [VariableNode],
    editorState: textToEditorState(defaultValue),
    onError: (error: Error) => {
      throw error;
    }
  });
  const initialY = useRef(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    initialY.current = e.clientY;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = e.clientY - initialY.current;
      setHeight((prevHeight) => (prevHeight + deltaY < h * 0.5 ? h * 0.5 : prevHeight + deltaY));
      initialY.current = e.clientY;
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <Box position={'relative'} width={'full'} h={`${height}px`} cursor={'text'}>
      <LexicalComposer initialConfig={initialConfig} key={key.current}>
        <PlainTextPlugin
          contentEditable={<ContentEditable className={styles.contentEditable} />}
          placeholder={
            <Box
              position={'absolute'}
              top={0}
              left={0}
              right={0}
              bottom={0}
              py={3}
              px={4}
              pointerEvents={'none'}
              overflow={'overlay'}
            >
              <Box
                color={'myGray.500'}
                fontSize={'xs'}
                userSelect={'none'}
                whiteSpace={'pre-wrap'}
                wordBreak={'break-all'}
                h={'100%'}
              >
                {placeholder}
              </Box>
            </Box>
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
        <HistoryPlugin />
        <OnChangePlugin onChange={(e) => onChange?.(e)} />
        <VariablePickerPlugin variables={variables} />
        <VariablePlugin variables={variables} />
        <OnBlurPlugin onBlur={onBlur} />
      </LexicalComposer>
      {showResize && (
        <Box
          position={'absolute'}
          right={'0'}
          bottom={'-1'}
          zIndex={9}
          cursor={'ns-resize'}
          px={'2px'}
          onMouseDown={handleMouseDown}
        >
          <MyIcon name={'common/editor/resizer'} width={'14px'} height={'14px'} />
        </Box>
      )}
      {showOpenModal && (
        <Box
          zIndex={10}
          position={'absolute'}
          bottom={1}
          right={2}
          cursor={'pointer'}
          onClick={onOpenModal}
        >
          <MyIcon name={'common/fullScreenLight'} w={'14px'} color={'myGray.600'} />
        </Box>
      )}
    </Box>
  );
}
