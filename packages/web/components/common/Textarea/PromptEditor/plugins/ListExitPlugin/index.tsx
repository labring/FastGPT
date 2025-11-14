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
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) {
        return false;
      }

      const anchorNode = selection.anchor.getNode();
      const listItemNode = $isListItemNode(anchorNode) ? anchorNode : anchorNode.getParent();

      if ($isListItemNode(listItemNode)) {
        // Check if cursor is at the beginning of an empty list item
        const textContent = listItemNode.getTextContent().trim();
        const cursorOffset = selection.anchor.offset;

        // Only handle empty list items with cursor at the beginning
        if (textContent === '' && cursorOffset === 0) {
          // Prevent default backspace behavior
          event.preventDefault();
          event.stopPropagation();

          editor.update(() => {
            const listNode = listItemNode.getParent();

            if ($isListNode(listNode)) {
              // Create a new paragraph
              const paragraph = $createParagraphNode();

              // Always insert after the current list item and remove it
              // This ensures the paragraph appears at the current position
              listItemNode.insertAfter(paragraph);
              listItemNode.remove();

              // If the list is now empty, remove it
              if (listNode.getChildrenSize() === 0) {
                listNode.remove();
              }

              // Focus the new paragraph
              paragraph.select();
            }
          });

          return true;
        }
      }

      return false;
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
