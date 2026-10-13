import React from 'react';
import type { LexicalEditor } from 'lexical';
import { useCallback } from 'react';
import {
  type EditorVariableLabelPickerType,
  type EditorVariablePickerType
} from '../../Textarea/PromptEditor/type';
import Editor from './Editor';
import { editorStateToText } from '../../Textarea/PromptEditor/utils';

const HttpInput = ({
  variables = [],
  variableLabels = [],
  value,
  onChange,
  onBlur,
  h,
  placeholder,
  updateTrigger,
  tabIndex,
  resetOnValueChange = true
}: {
  variables?: EditorVariablePickerType[];
  variableLabels?: EditorVariableLabelPickerType[];
  value?: string;
  onChange?: (text: string) => void;
  onBlur?: (text: string) => void;
  h?: number;
  placeholder?: string;
  updateTrigger?: boolean;
  tabIndex?: number;
  resetOnValueChange?: boolean;
}) => {
  const onChangeInput = useCallback(
    (editor: LexicalEditor) => {
      const text = editorStateToText(editor);
      onChange?.(text);
    },
    [onChange]
  );
  const onBlurInput = useCallback(
    (editor: LexicalEditor) => {
      const text = editorStateToText(editor);
      onBlur?.(text);
    },
    [onBlur]
  );

  return (
    <>
      <Editor
        variables={variables}
        variableLabels={variableLabels}
        h={h}
        value={value}
        onChange={onChange ? onChangeInput : undefined}
        onBlur={onBlurInput}
        placeholder={placeholder}
        updateTrigger={updateTrigger}
        tabIndex={tabIndex}
        resetOnValueChange={resetOnValueChange}
      />
    </>
  );
};
export default React.memo(HttpInput);
