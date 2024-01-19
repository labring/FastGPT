import { useEffect } from 'react';
import { BLUR_COMMAND, COMMAND_PRIORITY_EDITOR, LexicalEditor } from 'lexical';
import { mergeRegister } from '@lexical/utils';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';

export default function OnBlurPlugin({ onBlur }: { onBlur?: (editor: LexicalEditor) => void }) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        BLUR_COMMAND,
        () => {
          if (onBlur) onBlur(editor);

          return true;
        },
        COMMAND_PRIORITY_EDITOR
      )
    );
  }, [editor, onBlur]);

  return null;
}
