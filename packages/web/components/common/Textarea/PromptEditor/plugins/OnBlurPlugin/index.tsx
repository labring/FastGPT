import { useEffect, useRef } from 'react';
import { $setSelection, BLUR_COMMAND, COMMAND_PRIORITY_EDITOR, type LexicalEditor } from 'lexical';
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
        // 清理原生 selection，避免外部输入更新时 Lexical 根据旧 selection 恢复焦点。
        editor.blur();
        editor.update(() => {
          $setSelection(null);
        });
        onBlurRef.current?.(editor);

        return false;
      },
      COMMAND_PRIORITY_EDITOR
    );
  }, [editor]);

  return null;
}
