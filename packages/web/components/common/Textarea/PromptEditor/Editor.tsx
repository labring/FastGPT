/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import { useMemo, useState, useTransition } from 'react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { PlainTextPlugin } from '@lexical/react/LexicalPlainTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import LexicalErrorBoundary from '@lexical/react/LexicalErrorBoundary';
import VariableLabelPickerPlugin from './plugins/VariableLabelPickerPlugin';
import { Box, Flex } from '@chakra-ui/react';
import styles from './index.module.scss';
import VariablePlugin from './plugins/VariablePlugin';
import { VariableNode } from './plugins/VariablePlugin/node';
import type { EditorState, LexicalEditor } from 'lexical';
import OnBlurPlugin from './plugins/OnBlurPlugin';
import MyIcon from '../../Icon';
import type { FormPropsType } from './type.d';
import { type EditorVariableLabelPickerType, type EditorVariablePickerType } from './type.d';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import FocusPlugin from './plugins/FocusPlugin';
import { textToEditorState } from './utils';
import { MaxLengthPlugin } from './plugins/MaxLengthPlugin';
import { VariableLabelNode } from './plugins/VariableLabelPlugin/node';
import VariableLabelPlugin from './plugins/VariableLabelPlugin';
import { useDeepCompareEffect } from 'ahooks';
import VariablePickerPlugin from './plugins/VariablePickerPlugin';

export type EditorProps = {
  variables?: EditorVariablePickerType[];
  variableLabels?: EditorVariableLabelPickerType[];
  value?: string;
  showOpenModal?: boolean;
  minH?: number;
  maxH?: number;
  maxLength?: number;
  placeholder?: string;
  isInvalid?: boolean;

  ExtensionPopover?: ((e: {
    onChangeText: (text: string) => void;
    iconButtonStyle: Record<string, any>;
  }) => React.ReactNode)[];
};

export default function Editor({
  minH = 200,
  maxH = 400,
  maxLength,
  showOpenModal = true,
  onOpenModal,
  variables = [],
  variableLabels = [],
  onChange,
  onChangeText,
  onBlur,
  value,
  placeholder = '',
  bg = 'white',
  isInvalid,

  ExtensionPopover
}: EditorProps &
  FormPropsType & {
    onOpenModal?: () => void;
    onChange: (editorState: EditorState, editor: LexicalEditor) => void;
    onChangeText?: ((text: string) => void) | undefined;
    onBlur: (editor: LexicalEditor) => void;
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

  const showFullScreenIcon = useMemo(() => {
    return showOpenModal && scrollHeight > maxH;
  }, [showOpenModal, scrollHeight, maxH]);

  const iconButtonStyle = useMemo(
    () => ({
      position: 'absolute' as const,
      bottom: 1,
      right: showFullScreenIcon ? '34px' : 2,
      zIndex: 10,
      cursor: 'pointer',
      borderRadius: '6px',
      background: 'rgba(255, 255, 255, 0.01)',
      backdropFilter: 'blur(6.6666669845581055px)',
      alignItems: 'center',
      justifyContent: 'center',
      w: 6,
      h: 6
    }),
    [showFullScreenIcon]
  );

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
              className={isInvalid ? styles.contentEditable_invalid : styles.contentEditable}
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

      {onChangeText &&
        ExtensionPopover?.map((Item, index) => (
          <Item key={index} iconButtonStyle={iconButtonStyle} onChangeText={onChangeText} />
        ))}
      {showFullScreenIcon && (
        <Flex onClick={onOpenModal} {...iconButtonStyle} right={2}>
          <MyIcon name={'common/fullScreenLight'} w={'1rem'} color={'myGray.500'} />
        </Flex>
      )}
    </Box>
  );
}
