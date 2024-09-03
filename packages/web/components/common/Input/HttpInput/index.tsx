import React from 'react';
import { EditorState, type LexicalEditor } from 'lexical';
import { useCallback } from 'react';
import { editorStateToText } from '../../Textarea/PromptEditor/utils';
import {
  EditorVariableLabelPickerType,
  EditorVariablePickerType
} from '../../Textarea/PromptEditor/type';
import Editor from './Editor';

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
    (editorState: EditorState, editor: LexicalEditor) => {
      const text = editorStateToText(editor).replaceAll('}}{{', '}} {{');
      setCurrentValue(text);
      onChange?.(text);
    },
    [onChange]
  );
  const onBlurInput = useCallback(
    (editor: LexicalEditor) => {
      const text = editorStateToText(editor).replaceAll('}}{{', '}} {{');
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
