import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  KEY_TAB_COMMAND,
  COMMAND_PRIORITY_HIGH,
  $getSelection,
  $isRangeSelection,
  $isTextNode
} from 'lexical';
import { $createTextNode } from 'lexical';
import { $isListNode, $isListItemNode } from '@lexical/list';
import { useEffect } from 'react';

export default function TabToSpacesPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      KEY_TAB_COMMAND,
      (event) => {
        try {
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) {
            return false;
          }

          // Check if we're in a list context
          let isInList = false;
          try {
            const nodes = selection.getNodes();
            isInList = nodes.some((node) => {
              // Check if current node or any of its ancestors is a list or list item
              let currentNode = node;
              while (currentNode) {
                try {
                  if ($isListNode(currentNode) || $isListItemNode(currentNode)) {
                    return true;
                  }
                  // @ts-ignore
                  currentNode = currentNode.getParent();
                } catch (e) {
                  // If node is no longer valid, break the loop
                  break;
                }
              }
              return false;
            });
          } catch (e) {
            // If we can't get nodes safely, assume we're not in a list
            isInList = false;
          }

          // If we're in a list, let the built-in list indentation handle it
          if (isInList) {
            return false;
          }

          // Only handle tab for non-list contexts
          event.preventDefault();

          const isShiftTab = event.shiftKey;

          // Handle Shift+Tab (outdent)
          if (isShiftTab) {
            if (!selection.isCollapsed()) {
              // For selected text, remove 2 spaces from the beginning of each line
              try {
                const selectedText = selection.getTextContent();
                const lines = selectedText.split('\n');

                const outdentedText = lines
                  .map((line) => {
                    // Remove up to 2 spaces from the beginning of the line
                    if (line.startsWith('  ')) {
                      return line.slice(2);
                    } else if (line.startsWith(' ')) {
                      return line.slice(1);
                    }
                    return line;
                  })
                  .join('\n');

                // Insert the outdented text and let Lexical handle cursor positioning
                selection.insertText(outdentedText);

                // Schedule selection restoration in the next update cycle
                setTimeout(() => {
                  editor.update(() => {
                    const currentSelection = $getSelection();
                    if ($isRangeSelection(currentSelection) && !currentSelection.isCollapsed()) {
                      // Selection is already maintained, do nothing
                      return;
                    }

                    // If selection was lost, try to select the inserted text
                    if ($isRangeSelection(currentSelection)) {
                      const currentOffset = currentSelection.anchor.offset;
                      const selectionStart = Math.max(0, currentOffset - outdentedText.length);

                      currentSelection.anchor.set(
                        currentSelection.anchor.key,
                        selectionStart,
                        'text'
                      );
                      currentSelection.focus.set(currentSelection.focus.key, currentOffset, 'text');
                    }
                  });
                }, 0);

                return true;
              } catch (e) {
                // If operation fails, do nothing
                return true;
              }
            } else {
              // For cursor position, try to remove spaces before cursor
              try {
                const anchorNode = selection.anchor.getNode();
                const anchorOffset = selection.anchor.offset;

                if ($isTextNode(anchorNode)) {
                  const textContent = anchorNode.getTextContent();
                  const beforeCursor = textContent.slice(0, anchorOffset);
                  const afterCursor = textContent.slice(anchorOffset);

                  // Check if there are spaces before cursor to remove
                  let spacesToRemove = 0;
                  for (let i = beforeCursor.length - 1; i >= 0 && spacesToRemove < 2; i--) {
                    if (beforeCursor[i] === ' ') {
                      spacesToRemove++;
                    } else {
                      break;
                    }
                  }

                  if (spacesToRemove > 0) {
                    const newTextContent =
                      beforeCursor.slice(0, beforeCursor.length - spacesToRemove) + afterCursor;
                    anchorNode.setTextContent(newTextContent);
                    selection.anchor.set(
                      anchorNode.getKey(),
                      anchorOffset - spacesToRemove,
                      'text'
                    );
                    selection.focus.set(anchorNode.getKey(), anchorOffset - spacesToRemove, 'text');
                  }
                }
                return true;
              } catch (e) {
                return true;
              }
            }
          } else {
            // Handle regular Tab (indent)
            if (!selection.isCollapsed()) {
              try {
                const selectedText = selection.getTextContent();
                const lines = selectedText.split('\n');
                const indentedText = lines.map((line) => '  ' + line).join('\n');

                // Insert the indented text and let Lexical handle cursor positioning
                selection.insertText(indentedText);

                // Schedule selection restoration in the next update cycle
                setTimeout(() => {
                  editor.update(() => {
                    const currentSelection = $getSelection();
                    if ($isRangeSelection(currentSelection) && !currentSelection.isCollapsed()) {
                      // Selection is already maintained, do nothing
                      return;
                    }

                    // If selection was lost, try to select the inserted text
                    if ($isRangeSelection(currentSelection)) {
                      const currentOffset = currentSelection.anchor.offset;
                      const selectionStart = Math.max(0, currentOffset - indentedText.length);

                      currentSelection.anchor.set(
                        currentSelection.anchor.key,
                        selectionStart,
                        'text'
                      );
                      currentSelection.focus.set(currentSelection.focus.key, currentOffset, 'text');
                    }
                  });
                }, 0);

                return true;
              } catch (e) {
                // If selection operation fails, fall back to simple space insertion
                const textNode = $createTextNode('  ');
                selection.insertNodes([textNode]);
                return true;
              }
            } else {
              // For cursor position (no selection), insert 2 spaces
              const textNode = $createTextNode('  '); // 2 spaces
              selection.insertNodes([textNode]);
              return true;
            }
          }
        } catch (e) {
          // If anything fails, just let the default behavior handle it
          console.warn('TabToSpacesPlugin error:', e);
          return false;
        }
      },
      COMMAND_PRIORITY_HIGH
    );
  }, [editor]);

  return null;
}
