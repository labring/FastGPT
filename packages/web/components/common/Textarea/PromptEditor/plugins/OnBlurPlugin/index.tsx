import { useEffect } from 'react';
import { BLUR_COMMAND, COMMAND_PRIORITY_EDITOR, LexicalEditor } from 'lexical';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';

export default function OnBlurPlugin({ onBlur }: { onBlur?: (editor: LexicalEditor) => void }) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      BLUR_COMMAND,
      () => {
        onBlur?.(editor);

        return true;
      },
      COMMAND_PRIORITY_EDITOR
    );
  }, [editor]);

  return null;
}
