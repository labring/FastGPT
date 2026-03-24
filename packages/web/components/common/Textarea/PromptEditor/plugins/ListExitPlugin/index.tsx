import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useEffect } from 'react';
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_HIGH,
  KEY_ENTER_COMMAND,
  KEY_BACKSPACE_COMMAND,
  $createParagraphNode
} from 'lexical';
import { $isListItemNode, $isListNode } from '@lexical/list';

export default function ListExitPlugin(): JSX.Element | null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const handleEnterKey = () => {
      let handled = false;

      editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          return;
        }

        const anchorNode = selection.anchor.getNode();
        const listItemNode = anchorNode.getParent();

        if ($isListItemNode(listItemNode)) {
          // Check if the list item is empty
          const textContent = listItemNode.getTextContent().trim();

          if (textContent === '') {
            // Remove the empty list item and exit list mode
            const listNode = listItemNode.getParent();

            if ($isListNode(listNode)) {
              // If this is the only item in the list, remove the entire list
              if (listNode.getChildrenSize() === 1) {
                listNode.remove();
              } else {
                // Remove just this list item
                listItemNode.remove();
              }

              // Insert a paragraph after the list to exit list mode
              const paragraph = $createParagraphNode();
              if (listNode && !listNode.isAttached()) {
                // If we removed the entire list, replace it with a paragraph
                listNode.getParent()?.append(paragraph);
              } else {
                // Insert paragraph after the list
                listNode?.insertAfter(paragraph);
              }

              paragraph.select();
              handled = true;
            }
          }
        }
      });

      return handled;
    };

    const handleBackspaceKey = (event: KeyboardEvent) => {
      let shouldHandle = false;

      editor.getEditorState().read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          return;
        }

        const anchorNode = selection.anchor.getNode();
        const listItemNode = $isListItemNode(anchorNode) ? anchorNode : anchorNode.getParent();

        if ($isListItemNode(listItemNode)) {
          const textContent = listItemNode.getTextContent().trim();
          const cursorOffset = selection.anchor.offset;

          if (textContent === '' && cursorOffset === 0) {
            shouldHandle = true;
          }
        }
      });

      if (!shouldHandle) {
        return false;
      }

      event.preventDefault();
      event.stopPropagation();

      editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;

        const anchorNode = selection.anchor.getNode();
        const listItemNode = $isListItemNode(anchorNode) ? anchorNode : anchorNode.getParent();

        if (!$isListItemNode(listItemNode)) return;

        const listNode = listItemNode.getParent();

        if ($isListNode(listNode)) {
          const paragraph = $createParagraphNode();

          listItemNode.insertAfter(paragraph);
          listItemNode.remove();

          if (listNode.getChildrenSize() === 0) {
            listNode.remove();
          }

          paragraph.select();
        }
      });

      return true;
    };

    // Register the keyboard event handlers
    const removeEnterListener = editor.registerCommand(
      KEY_ENTER_COMMAND,
      handleEnterKey,
      COMMAND_PRIORITY_HIGH
    );

    const removeBackspaceListener = editor.registerCommand(
      KEY_BACKSPACE_COMMAND,
      handleBackspaceKey,
      COMMAND_PRIORITY_HIGH
    );

    return () => {
      removeEnterListener();
      removeBackspaceListener();
    };
  }, [editor]);

  return null;
}
