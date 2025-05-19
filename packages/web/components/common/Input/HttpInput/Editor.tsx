/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import { useState, useRef, useTransition, useEffect, useMemo } from 'react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { PlainTextPlugin } from '@lexical/react/LexicalPlainTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import LexicalErrorBoundary from '@lexical/react/LexicalErrorBoundary';
import { Box, Flex } from '@chakra-ui/react';
import styles from './index.module.scss';
import { EditorState, LexicalEditor } from 'lexical';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import {
  EditorVariableLabelPickerType,
  EditorVariablePickerType
} from '../../Textarea/PromptEditor/type';
import { VariableNode } from '../../Textarea/PromptEditor/plugins/VariablePlugin/node';
import { textToEditorState } from '../../Textarea/PromptEditor/utils';
import { SingleLinePlugin } from '../../Textarea/PromptEditor/plugins/SingleLinePlugin';
import OnBlurPlugin from '../../Textarea/PromptEditor/plugins/OnBlurPlugin';
import VariablePlugin from '../../Textarea/PromptEditor/plugins/VariablePlugin';
import VariablePickerPlugin from '../../Textarea/PromptEditor/plugins/VariablePickerPlugin';
import FocusPlugin from '../../Textarea/PromptEditor/plugins/FocusPlugin';
import VariableLabelPlugin from '../../Textarea/PromptEditor/plugins/VariableLabelPlugin';
import { VariableLabelNode } from '../../Textarea/PromptEditor/plugins/VariableLabelPlugin/node';
import VariableLabelPickerPlugin from '../../Textarea/PromptEditor/plugins/VariableLabelPickerPlugin';

export default function Editor({
  h = 40,
  variables,
  variableLabels,
  onChange,
  onBlur,
  value,
  currentValue,
  placeholder = '',
  updateTrigger
}: {
  h?: number;
  variables: EditorVariablePickerType[];
  variableLabels: EditorVariableLabelPickerType[];
  onChange?: (editorState: EditorState, editor: LexicalEditor) => void;
  onBlur?: (editor: LexicalEditor) => void;
  value?: string;
  currentValue?: string;
  placeholder?: string;
  updateTrigger?: boolean;
}) {
  const [key, setKey] = useState(getNanoid(6));
  const [_, startSts] = useTransition();
  const [focus, setFocus] = useState(false);

  const initialConfig = {
    namespace: 'HttpInput',
    nodes: [VariableNode, VariableLabelNode],
    editorState: textToEditorState(value),
    onError: (error: Error) => {
      throw error;
    }
  };

  useEffect(() => {
    if (focus) return;
    setKey(getNanoid(6));
  }, [value, variables.length]);

  useEffect(() => {
    setKey(getNanoid(6));
    setFocus(false);
  }, [updateTrigger]);

  return (
    <Flex
      position={'relative'}
      width={'full'}
      minH={`${h}px`}
      h={'full'}
      flexDirection={'column'}
      cursor={'text'}
      overflowY={'visible'}
    >
      <LexicalComposer initialConfig={initialConfig} key={key}>
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
              px={2}
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
        <FocusPlugin focus={focus} setFocus={setFocus} />
        <OnChangePlugin
          onChange={(editorState: EditorState, editor: LexicalEditor) => {
            startSts(() => {
              onChange?.(editorState, editor);
            });
          }}
        />
        <VariablePlugin variables={variables} />
        <VariableLabelPlugin variables={variableLabels} />
        <VariableLabelPickerPlugin variables={variableLabels} isFocus={focus} />
        <OnBlurPlugin onBlur={onBlur} />
        <SingleLinePlugin />
      </LexicalComposer>
    </Flex>
  );
}
