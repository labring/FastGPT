/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import { useState, useTransition } from 'react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { PlainTextPlugin } from '@lexical/react/LexicalPlainTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import LexicalErrorBoundary from '@lexical/react/LexicalErrorBoundary';
import VariableLabelPickerPlugin from './plugins/VariableLabelPickerPlugin';
import { Box } from '@chakra-ui/react';
import styles from './index.module.scss';
import VariablePlugin from './plugins/VariablePlugin';
import { VariableNode } from './plugins/VariablePlugin/node';
import { EditorState, LexicalEditor } from 'lexical';
import OnBlurPlugin from './plugins/OnBlurPlugin';
import MyIcon from '../../Icon';
import { EditorVariableLabelPickerType, EditorVariablePickerType } from './type.d';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import FocusPlugin from './plugins/FocusPlugin';
import { textToEditorState } from './utils';
import { MaxLengthPlugin } from './plugins/MaxLengthPlugin';
import { VariableLabelNode } from './plugins/VariableLabelPlugin/node';
import VariableLabelPlugin from './plugins/VariableLabelPlugin';
import { useDeepCompareEffect } from 'ahooks';
import VariablePickerPlugin from './plugins/VariablePickerPlugin';

export default function Editor({
  minH = 200,
  maxH = 400,
  maxLength,
  showOpenModal = true,
  onOpenModal,
  variables,
  variableLabels,
  onChange,
  onBlur,
  value,
  placeholder = '',
  bg = 'white'
}: {
  minH?: number;
  maxH?: number;
  maxLength?: number;
  showOpenModal?: boolean;
  onOpenModal?: () => void;
  variables: EditorVariablePickerType[];
  variableLabels: EditorVariableLabelPickerType[];
  onChange?: (editorState: EditorState, editor: LexicalEditor) => void;
  onBlur?: (editor: LexicalEditor) => void;
  value?: string;
  placeholder?: string;
  bg?: string;
}) {
  const [key, setKey] = useState(getNanoid(6));
  const [_, startSts] = useTransition();
  const [focus, setFocus] = useState(false);
  const [scrollHeight, setScrollHeight] = useState(0);

  const initialConfig = {
    namespace: 'promptEditor',
    nodes: [VariableNode, VariableLabelNode],
    editorState: textToEditorState(value),
    onError: (error: Error) => {
      throw error;
    }
  };

  useDeepCompareEffect(() => {
    if (focus) return;
    setKey(getNanoid(6));
  }, [value, variables, variableLabels]);

  return (
    <Box
      className="nowheel"
      position={'relative'}
      width={'full'}
      cursor={'text'}
      color={'myGray.700'}
      bg={focus ? 'white' : bg}
      borderRadius={'md'}
    >
      <LexicalComposer initialConfig={initialConfig} key={key}>
        <PlainTextPlugin
          contentEditable={
            <ContentEditable
              className={styles.contentEditable}
              style={{
                minHeight: `${minH}px`,
                maxHeight: `${maxH}px`
              }}
            />
          }
          placeholder={
            <Box
              position={'absolute'}
              top={0}
              left={0}
              right={0}
              bottom={0}
              py={3}
              px={3.5}
              pointerEvents={'none'}
              overflow={'hidden'}
            >
              <Box
                color={'myGray.400'}
                fontSize={'mini'}
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
        <MaxLengthPlugin maxLength={maxLength || 999999} />
        <FocusPlugin focus={focus} setFocus={setFocus} />
        <OnChangePlugin
          onChange={(editorState, editor) => {
            const rootElement = editor.getRootElement();
            setScrollHeight(rootElement?.scrollHeight || 0);
            startSts(() => {
              onChange?.(editorState, editor);
            });
          }}
        />
        <VariableLabelPlugin variables={variableLabels} />
        <VariablePlugin variables={variables} />
        <VariableLabelPickerPlugin variables={variableLabels} isFocus={focus} />
        <VariablePickerPlugin variables={variableLabels.length > 0 ? [] : variables} />
        <OnBlurPlugin onBlur={onBlur} />
      </LexicalComposer>
      {showOpenModal && scrollHeight > maxH && (
        <Box
          zIndex={10}
          position={'absolute'}
          bottom={-1}
          right={2}
          cursor={'pointer'}
          onClick={onOpenModal}
        >
          <MyIcon name={'common/fullScreenLight'} w={'14px'} color={'myGray.500'} />
        </Box>
      )}
    </Box>
  );
}
