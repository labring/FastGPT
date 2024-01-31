import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useEffect } from 'react';
import { textToEditorState } from '../../utils';
import { CLEAR_HISTORY_COMMAND } from 'lexical';

export default function InitValuePlugin({ defaultValue }: { defaultValue: string | undefined }) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const hasFocus = editor.getRootElement() === document.activeElement;
    if (!hasFocus && defaultValue) {
      const initialEditorState = editor.parseEditorState(textToEditorState(defaultValue));
      editor.setEditorState(initialEditorState);
      editor.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined);
      editor.update(() => {
        editor.setEditorState(editor.parseEditorState(textToEditorState(defaultValue)));
        editor.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined);
      });
    }
  }, [defaultValue]);

  return null;
}
