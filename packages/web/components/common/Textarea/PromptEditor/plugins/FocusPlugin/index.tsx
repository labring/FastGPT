import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useEffect } from 'react';
import { BLUR_COMMAND, COMMAND_PRIORITY_LOW, FOCUS_COMMAND } from 'lexical';

export default function FocusPlugin({
  focus,
  setFocus,
  isDisabled
}: {
  focus: Boolean;
  setFocus: any;
  isDisabled?: boolean;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(
    () =>
      editor.registerCommand(
        BLUR_COMMAND,
        () => {
          if (!isDisabled) {
            setFocus(false);
          }
          return false;
        },
        COMMAND_PRIORITY_LOW
      ),
    [isDisabled]
  );

  useEffect(
    () =>
      editor.registerCommand(
        FOCUS_COMMAND,
        () => {
          if (!isDisabled) {
            setFocus(true);
          }
          return false;
        },
        COMMAND_PRIORITY_LOW
      ),
    [isDisabled]
  );

  // useEffect(() => {
  //   if (focus) {
  //     editor.focus();
  //   }
  // }, [focus]);

  return null;
}
