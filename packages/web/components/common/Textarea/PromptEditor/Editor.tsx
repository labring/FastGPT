/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type { CSSProperties } from 'react';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { PlainTextPlugin } from '@lexical/react/LexicalPlainTextPlugin';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { CheckListPlugin } from '@lexical/react/LexicalCheckListPlugin';
import { TabIndentationPlugin } from '@lexical/react/LexicalTabIndentationPlugin';
import LexicalErrorBoundary from '@lexical/react/LexicalErrorBoundary';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { ListItemNode, ListNode } from '@lexical/list';
import { CodeHighlightNode, CodeNode } from '@lexical/code';
import VariableLabelPickerPlugin from './plugins/VariableLabelPickerPlugin';
import ListDisplayFixPlugin from './plugins/ListDisplayFixPlugin';
import { Box, Flex } from '@chakra-ui/react';
import styles from './index.module.scss';
import VariablePlugin from './plugins/VariablePlugin';
import { VariableNode } from './plugins/VariablePlugin/node';
import type { EditorState, LexicalEditor } from 'lexical';
import OnBlurPlugin from './plugins/OnBlurPlugin';
import type { FormPropsType } from './type';
import { type EditorVariableLabelPickerType, type EditorVariablePickerType } from './type';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import FocusPlugin from './plugins/FocusPlugin';
import { textToEditorState } from './utils';
import { MaxLengthPlugin } from './plugins/MaxLengthPlugin';
import { VariableLabelNode } from './plugins/VariableLabelPlugin/node';
import VariableLabelPlugin from './plugins/VariableLabelPlugin';
import { useDeepCompareEffect } from 'ahooks';
import VariablePickerPlugin from './plugins/VariablePickerPlugin';
import MarkdownPlugin from './plugins/MarkdownPlugin';
import MyIcon from '../../Icon';
import ListExitPlugin from './plugins/ListExitPlugin';
import KeyDownPlugin from './plugins/KeyDownPlugin';

const Placeholder = ({ children, padding }: { children: React.ReactNode; padding: string }) => (
  <Box
    position={'absolute'}
    top={0}
    left={0}
    right={0}
    bottom={0}
    p={padding}
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
      {children}
    </Box>
  </Box>
);

export type EditorProps = {
  isRichText?: boolean;
  variables?: EditorVariablePickerType[];
  variableLabels?: EditorVariableLabelPickerType[];
  value: string;
  showOpenModal?: boolean;
  minH?: number;
  maxH?: number;
  maxLength?: number;
  placeholder?: string;
  placeholderPadding?: string;
  isInvalid?: boolean;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  ExtensionPopover?: ((e: {
    onChangeText: (text: string) => void;
    iconButtonStyle: Record<string, any>;
  }) => React.ReactNode)[];
  boxStyle?: CSSProperties;
};

export default function Editor({
  isRichText = false,
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
  value = '',
  placeholder = '',
  placeholderPadding = '12px 14px',
  bg = 'white',
  isInvalid,
  onKeyDown,
  ExtensionPopover,
  boxStyle
}: EditorProps &
  FormPropsType & {
    onOpenModal?: () => void;
    onChange: (editor: LexicalEditor) => void;
    onChangeText?: ((text: string) => void) | undefined;
    onBlur?: (editor: LexicalEditor) => void;
  }) {
  const [key, setKey] = useState(getNanoid(6));
  const [_, startSts] = useTransition();
  const [focus, setFocus] = useState(false);
  const [scrollHeight, setScrollHeight] = useState(0);

  const initialConfig = {
    namespace: isRichText ? 'richPromptEditor' : 'promptEditor',
    nodes: [
      VariableNode,
      VariableLabelNode,
      // Only register rich text nodes when in rich text mode
      ...(isRichText
        ? [HeadingNode, ListNode, ListItemNode, QuoteNode, CodeNode, CodeHighlightNode]
        : [])
    ],
    editorState: textToEditorState(value, isRichText),
    onError: (error: Error) => {
      console.error('Lexical errror', error);
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
        {/* Text type */}
        {isRichText ? (
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                className={`${isInvalid ? styles.contentEditable_invalid : styles.contentEditable} ${styles.richText}`}
                style={{
                  minHeight: `${minH}px`,
                  maxHeight: `${maxH}px`,
                  ...boxStyle
                }}
              />
            }
            placeholder={<Placeholder padding={placeholderPadding}>{placeholder}</Placeholder>}
            ErrorBoundary={LexicalErrorBoundary}
          />
        ) : (
          <PlainTextPlugin
            contentEditable={
              <ContentEditable
                className={isInvalid ? styles.contentEditable_invalid : styles.contentEditable}
                style={{
                  minHeight: `${minH}px`,
                  maxHeight: `${maxH}px`,
                  ...boxStyle
                }}
              />
            }
            placeholder={<Placeholder padding={placeholderPadding}>{placeholder}</Placeholder>}
            ErrorBoundary={LexicalErrorBoundary}
          />
        )}

        {/* Basic Plugin */}
        <>
          <HistoryPlugin />
          <MaxLengthPlugin maxLength={maxLength || 999999} />
          <FocusPlugin focus={focus} setFocus={setFocus} />
          <KeyDownPlugin onKeyDown={onKeyDown} />

          {variableLabels.length > 0 && (
            <>
              <VariableLabelPlugin variables={variableLabels} />
              <VariableLabelPickerPlugin variables={variableLabels} isFocus={focus} />
            </>
          )}
          {variables.length > 0 && (
            <>
              <VariablePlugin variables={variables} />
              {/* <VariablePickerPlugin variables={variables} /> */}
            </>
          )}
          <OnBlurPlugin onBlur={onBlur} />
          <OnChangePlugin
            onChange={(editorState, editor) => {
              const rootElement = editor.getRootElement();
              setScrollHeight(rootElement?.scrollHeight || 0);
              startSts(() => {
                onChange?.(editor);
              });
            }}
          />

          {isRichText && (
            <>
              <ListDisplayFixPlugin />
              <TabIndentationPlugin />
              <ListPlugin />
              <CheckListPlugin />
              <ListExitPlugin />
              <MarkdownPlugin />
            </>
          )}
        </>
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
