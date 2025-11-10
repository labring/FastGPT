import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { KEY_DOWN_COMMAND, COMMAND_PRIORITY_HIGH } from 'lexical';
import { useEffect } from 'react';

export default function KeyDownPlugin({
  onKeyDown
}: {
  onKeyDown?: (e: React.KeyboardEvent) => void;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!onKeyDown) return;

    return editor.registerCommand(
      KEY_DOWN_COMMAND,
      (event: KeyboardEvent) => {
        const syntheticEvent = {
          key: event.key,
          shiftKey: event.shiftKey,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          altKey: event.altKey,
          preventDefault: () => event.preventDefault(),
          stopPropagation: () => event.stopPropagation(),
          nativeEvent: event
        } as React.KeyboardEvent;

        onKeyDown(syntheticEvent);

        return event.defaultPrevented;
      },
      COMMAND_PRIORITY_HIGH
    );
  }, [editor, onKeyDown]);

  return null;
}
