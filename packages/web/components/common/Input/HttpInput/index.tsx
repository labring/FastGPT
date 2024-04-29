import React, { useEffect } from 'react';
import { $getRoot, EditorState, type LexicalEditor } from 'lexical';
import { useCallback, useTransition } from 'react';
import { editorStateToText } from '../../Textarea/PromptEditor/utils';
import { EditorVariablePickerType } from '../../Textarea/PromptEditor/type';
import Editor from './Editor';

const HttpInput = ({
  hasVariablePlugin = true,
  hasDropDownPlugin = false,
  variables = [],
  value,
  onChange,
  onBlur,
  h,
  placeholder,
  setDropdownValue,
  updateTrigger
}: {
  hasVariablePlugin?: boolean;
  hasDropDownPlugin?: boolean;
  variables?: EditorVariablePickerType[];
  value?: string;
  onChange?: (text: string) => void;
  onBlur?: (text: string) => void;
  h?: number;
  placeholder?: string;
  setDropdownValue?: (value: string) => void;
  updateTrigger?: boolean;
}) => {
  const [currentValue, setCurrentValue] = React.useState(value);

  const [, startSts] = useTransition();

  const onChangeInput = useCallback((editorState: EditorState, editor: LexicalEditor) => {
    const text = editorStateToText(editor).replaceAll('}}{{', '}} {{');
    setCurrentValue(text);
    onChange?.(text);
  }, []);
  const onBlurInput = useCallback((editor: LexicalEditor) => {
    startSts(() => {
      const text = editorStateToText(editor).replaceAll('}}{{', '}} {{');
      onBlur?.(text);
    });
  }, []);

  return (
    <>
      <Editor
        hasVariablePlugin={hasVariablePlugin}
        hasDropDownPlugin={hasDropDownPlugin}
        variables={variables}
        h={h}
        value={value}
        currentValue={currentValue}
        onChange={onChangeInput}
        onBlur={onBlurInput}
        placeholder={placeholder}
        setDropdownValue={setDropdownValue}
        updateTrigger={updateTrigger}
      />
    </>
  );
};
export default React.memo(HttpInput);
