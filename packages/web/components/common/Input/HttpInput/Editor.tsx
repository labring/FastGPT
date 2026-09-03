/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import { useRef, useState, useTransition } from 'react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { PlainTextPlugin } from '@lexical/react/LexicalPlainTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import LexicalErrorBoundary from '@lexical/react/LexicalErrorBoundary';
import { Box, Flex } from '@chakra-ui/react';
import styles from './index.module.scss';
import type { EditorState, LexicalEditor } from 'lexical';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import {
  type EditorVariableLabelPickerType,
  type EditorVariablePickerType
} from '../../Textarea/PromptEditor/type';
import { VariableNode } from '../../Textarea/PromptEditor/plugins/VariablePlugin/node';
import { editorStateToText, textToEditorState } from '../../Textarea/PromptEditor/utils';
import { SingleLinePlugin } from '../../Textarea/PromptEditor/plugins/SingleLinePlugin';
import OnBlurPlugin from '../../Textarea/PromptEditor/plugins/OnBlurPlugin';
import VariablePlugin from '../../Textarea/PromptEditor/plugins/VariablePlugin';
import FocusPlugin from '../../Textarea/PromptEditor/plugins/FocusPlugin';
import VariableLabelPlugin from '../../Textarea/PromptEditor/plugins/VariableLabelPlugin';
import { VariableLabelNode } from '../../Textarea/PromptEditor/plugins/VariableLabelPlugin/node';
import VariableLabelPickerPlugin from '../../Textarea/PromptEditor/plugins/VariableLabelPickerPlugin';
import { useDeepCompareEffect } from 'ahooks';
import type { WorkflowReferenceSnapshot } from '@fastgpt/global/core/workflow/type/io';

export default function Editor({
  h = 40,
  variables,
  variableLabels,
  referenceSnapshots,
  onChange,
  onBlur,
  value,
  placeholder = '',
  updateTrigger,
  tabIndex,
  resetOnValueChange = true
}: {
  h?: number;
  variables: EditorVariablePickerType[];
  variableLabels: EditorVariableLabelPickerType[];
  referenceSnapshots?: WorkflowReferenceSnapshot[];
  onChange?: (editor: LexicalEditor) => void;
  onBlur?: (editor: LexicalEditor) => void;
  value?: string;
  placeholder?: string;
  updateTrigger?: boolean;
  tabIndex?: number;
  resetOnValueChange?: boolean;
}) {
  const [key, setKey] = useState(getNanoid(6));
  const [_, startSts] = useTransition();
  const [focus, setFocus] = useState(false);
  const editorOutputRef = useRef(value);

  const initialConfig = {
    namespace: 'HttpInput',
    nodes: [VariableNode, VariableLabelNode],
    editorState: textToEditorState(value),
    onError: (error: Error) => {
      console.error('Lexical errror', error);
    }
  };

  // 本地失焦回写时两者已同步，外部替换值不一致时强制重建 Lexical。
  useDeepCompareEffect(() => {
    if (value !== editorOutputRef.current) {
      editorOutputRef.current = value;
      setKey(getNanoid(6));
      return;
    }
    if (!resetOnValueChange || focus) return;
    setKey(getNanoid(6));
  }, [resetOnValueChange, value, variables.length]);

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
      <LexicalComposer initialConfig={initialConfig} key={`${key}-${updateTrigger ?? ''}`}>
        <PlainTextPlugin
          contentEditable={
            <ContentEditable className={styles.contentEditable} tabIndex={tabIndex} />
          }
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
            editorOutputRef.current = editorStateToText(editor);
            if (!onChange) return;

            startSts(() => {
              onChange(editor);
            });
          }}
        />
        <VariablePlugin variables={variables} />
        <VariableLabelPlugin variables={variableLabels} referenceSnapshots={referenceSnapshots} />
        <VariableLabelPickerPlugin variables={variableLabels} isFocus={focus} />
        <OnBlurPlugin onBlur={onBlur} />
        <SingleLinePlugin />
      </LexicalComposer>
    </Flex>
  );
}
