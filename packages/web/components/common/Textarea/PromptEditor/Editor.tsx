import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { PlainTextPlugin } from '@lexical/react/LexicalPlainTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import LexicalErrorBoundary from '@lexical/react/LexicalErrorBoundary';
import VariablePickerPlugin from './plugins/VariablePickerPlugin';
import { Box } from '@chakra-ui/react';
import styles from './index.module.scss';
import VariablePlugin from './plugins/VariablePlugin';
import { VariableNode } from './plugins/VariablePlugin/node';
import { VariableItemType } from '@fastgpt/global/core/module/type';
import { LexicalEditor } from 'lexical';
import { textToEditorState } from './utils';
import { useMemo } from 'react';
import OnBlurPlugin from './plugins/OnBlurPlugin';

export default function Editor({
  variables,
  onBlur,
  defaultValue,
  placeholder = ''
}: {
  variables: VariableItemType[];
  onBlur?: (editor: LexicalEditor) => void;
  defaultValue: string;
  placeholder?: string;
}) {
  const initialConfig = useMemo(
    () => ({
      namespace: 'promptEditor',
      nodes: [VariableNode],
      editorState: textToEditorState(defaultValue),
      onError: (error: Error) => {
        throw error;
      }
    }),
    [defaultValue]
  );

  return (
    <LexicalComposer initialConfig={initialConfig} key={defaultValue}>
      <Box width={'full'} className={styles.editorWrapper}>
        <PlainTextPlugin
          contentEditable={<ContentEditable className={styles.contentEditable} />}
          placeholder={<div className={styles.placeholder}>{placeholder}</div>}
          ErrorBoundary={LexicalErrorBoundary}
        />
        <HistoryPlugin />
        <VariablePickerPlugin variables={variables} />
        <VariablePlugin />
        <OnBlurPlugin onBlur={onBlur} />
      </Box>
    </LexicalComposer>
  );
}
