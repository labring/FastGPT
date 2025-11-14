import React from 'react';
import type { EditorState, LexicalEditor } from 'lexical';
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
  updateTrigger
}: {
  variables?: EditorVariablePickerType[];
  variableLabels?: EditorVariableLabelPickerType[];
  value?: string;
  onChange?: (text: string) => void;
  onBlur?: (text: string) => void;
  h?: number;
  placeholder?: string;
  updateTrigger?: boolean;
}) => {
  const [currentValue, setCurrentValue] = React.useState(value);

  const onChangeInput = useCallback(
    (editor: LexicalEditor) => {
      const text = editorStateToText(editor);
      setCurrentValue(text);
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
        currentValue={currentValue}
        onChange={onChangeInput}
        onBlur={onBlurInput}
        placeholder={placeholder}
        updateTrigger={updateTrigger}
      />
    </>
  );
};
export default React.memo(HttpInput);
