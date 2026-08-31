import { useEffect, useRef } from 'react';
import { BLUR_COMMAND, COMMAND_PRIORITY_EDITOR, type LexicalEditor } from 'lexical';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';

export default function OnBlurPlugin({ onBlur }: { onBlur?: (editor: LexicalEditor) => void }) {
  const [editor] = useLexicalComposerContext();
  const onBlurRef = useRef(onBlur);

  useEffect(() => {
    onBlurRef.current = onBlur;
  }, [onBlur]);

  useEffect(() => {
    return editor.registerCommand(
      BLUR_COMMAND,
      () => {
        onBlurRef.current?.(editor);

        return false;
      },
      COMMAND_PRIORITY_EDITOR
    );
  }, [editor]);

  return null;
}
