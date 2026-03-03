/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type { Klass, LexicalEditor, LexicalNode } from 'lexical';
import type { EntityMatch } from '@lexical/text';
import { $createTextNode, $isTextNode, TextNode } from 'lexical';
import { useCallback } from 'react';
import type { VariableLabelNode } from './plugins/VariableLabelPlugin/node';
import type { VariableNode } from './plugins/VariablePlugin/node';
import type {
  ListItemEditorNode,
  ListEditorNode,
  ParagraphEditorNode,
  EditorState,
  ListItemInfo,
  ChildEditorNode
} from './type';
import { TabStr } from './constants';

export function registerLexicalTextEntity<T extends TextNode | VariableLabelNode | VariableNode>(
  editor: LexicalEditor,
  getMatch: (text: string) => null | EntityMatch,
  targetNode: Klass<T>,
  createNode: (textNode: TextNode) => T
): Array<() => void> {
  const isTargetNode = (node: LexicalNode | null | undefined): node is T => {
    return node instanceof targetNode;
  };

  const replaceWithSimpleText = (node: TextNode | VariableLabelNode | VariableNode): void => {
    const textNode = $createTextNode(node.getTextContent());
    textNode.setFormat(node.getFormat());
    node.replace(textNode);
  };

  const getMode = (node: TextNode): number => {
    return node.getLatest().__mode;
  };

  const textNodeTransform = (node: TextNode) => {
    if (!node.isSimpleText()) {
      return;
    }

    const prevSibling = node.getPreviousSibling();
    let text = node.getTextContent();
    let currentNode = node;
    let match;

    if ($isTextNode(prevSibling)) {
      const previousText = prevSibling.getTextContent();
      const combinedText = previousText + text;
      const prevMatch = getMatch(combinedText);

      if (isTargetNode(prevSibling)) {
        if (prevMatch === null || getMode(prevSibling) !== 0) {
          replaceWithSimpleText(prevSibling);

          return;
        } else {
          const diff = prevMatch.end - previousText.length;

          if (diff > 0) {
            const concatText = text.slice(0, diff);
            const newTextContent = previousText + concatText;
            prevSibling.select();
            prevSibling.setTextContent(newTextContent);

            if (diff === text.length) {
              node.remove();
            } else {
              const remainingText = text.slice(diff);
              node.setTextContent(remainingText);
            }

            return;
          }
        }
      } else if (prevMatch === null || prevMatch.start < previousText.length) {
        return;
      }
    }

    // eslint-disable-next-line no-constant-condition
    while (true) {
      match = getMatch(text);
      let nextText = match === null ? '' : text.slice(match.end);
      text = nextText;

      if (nextText === '') {
        const nextSibling = currentNode.getNextSibling();

        if ($isTextNode(nextSibling)) {
          nextText = currentNode.getTextContent() + nextSibling.getTextContent();
          const nextMatch = getMatch(nextText);

          if (nextMatch === null) {
            if (isTargetNode(nextSibling)) {
              replaceWithSimpleText(nextSibling);
            } else {
              nextSibling.markDirty();
            }

            return;
          } else if (nextMatch.start !== 0) {
            return;
          }
        }
      }

      if (match === null) {
        return;
      }

      if (match.start === 0 && $isTextNode(prevSibling) && prevSibling.isTextEntity()) {
        continue;
      }

      let nodeToReplace;

      if (match.start === 0) {
        [nodeToReplace, currentNode] = currentNode.splitText(match.end);
      } else {
        [, nodeToReplace, currentNode] = currentNode.splitText(match.start, match.end);
      }

      const replacementNode = createNode(nodeToReplace);
      replacementNode.setFormat(nodeToReplace.getFormat());
      nodeToReplace.replace(replacementNode);

      if (currentNode == null) {
        return;
      }
    }
  };

  const reverseNodeTransform = (node: T) => {
    const text = node.getTextContent();
    const match = getMatch(text);

    if (match === null || match.start !== 0) {
      replaceWithSimpleText(node);

      return;
    }

    if (text.length > match.end && $isTextNode(node)) {
      // This will split out the rest of the text as simple text
      node.splitText(match.end);

      return;
    }

    const prevSibling = node.getPreviousSibling();

    if ($isTextNode(prevSibling) && prevSibling.isTextEntity()) {
      replaceWithSimpleText(prevSibling);
      replaceWithSimpleText(node);
    }

    const nextSibling = node.getNextSibling();

    if ($isTextNode(nextSibling) && nextSibling.isTextEntity()) {
      replaceWithSimpleText(nextSibling);

      // This may have already been converted in the previous block
      if (isTargetNode(node)) {
        replaceWithSimpleText(node);
      }
    }
  };

  const removePlainTextTransform = editor.registerNodeTransform(TextNode, textNodeTransform);
  const removeReverseNodeTransform = editor.registerNodeTransform<any>(
    targetNode,
    reverseNodeTransform
  );

  return [removePlainTextTransform, removeReverseNodeTransform];
}

// text to editor state
const parseTextLine = (line: string) => {
  const trimmed = line.trimStart();
  const leadingSpaces = line.length - trimmed.length;
  const indentLevel = Math.floor(leadingSpaces / TabStr.length);

  const bulletMatch = trimmed.match(/^- (.*)$/);
  if (bulletMatch) {
    return { type: 'bullet', text: bulletMatch[1], indent: indentLevel };
  }

  const numberMatch = trimmed.match(/^(\d+)\. (.*)$/);
  if (numberMatch) {
    return {
      type: 'number',
      text: numberMatch[2],
      indent: indentLevel,
      numberValue: parseInt(numberMatch[1])
    };
  }

  // For paragraphs, preserve original leading spaces in text (don't use indent)
  return { type: 'paragraph', text: line, indent: 0 };
};

const buildListStructure = (items: ListItemInfo[]) => {
  const result: ListEditorNode[] = [];

  let i = 0;
  while (i < items.length) {
    const currentListType = items[i].type;
    const currentIndent = items[i].indent;
    const currentListItems: ListItemEditorNode[] = [];

    // Collect consecutive items of the same type
    while (i < items.length && items[i].type === currentListType) {
      const listItem: ListItemEditorNode = {
        children: [
          {
            detail: 0,
            format: 0,
            mode: 'normal',
            style: '',
            text: items[i].text,
            type: 'text' as const,
            version: 1
          }
        ],
        direction: 'ltr',
        format: '',
        indent: 0,
        type: 'listitem' as const,
        version: 1,
        value: items[i].numberValue || 1
      };

      // Collect nested items
      const nestedItems: ListItemInfo[] = [];
      let j = i + 1;
      while (j < items.length && items[j].indent > currentIndent) {
        nestedItems.push(items[j]);
        j++;
      }

      // recursively build nested lists and add them to the current item's children
      if (nestedItems.length > 0) {
        const nestedLists = buildListStructure(nestedItems);
        listItem.children.push(...nestedLists);
      }

      currentListItems.push(listItem);
      i = j;
    }

    result.push({
      children: currentListItems,
      direction: 'ltr',
      format: '',
      indent: 0,
      type: 'list' as const,
      version: 1,
      listType: currentListType,
      start: 1,
      tag: currentListType === 'bullet' ? 'ul' : ('ol' as const)
    });
  }

  return result;
};

export const textToEditorState = (text = '', isRichText = false) => {
  const lines = text.split('\n');
  const children: Array<ParagraphEditorNode | ListEditorNode> = [];

  if (!isRichText) {
    return JSON.stringify({
      root: {
        children: lines.map((p) => {
          return {
            children: [
              {
                detail: 0,
                format: 0,
                mode: 'normal',
                style: '',
                text: p,
                type: 'text',
                version: 1
              }
            ],
            direction: 'ltr',
            format: '',
            indent: 0,
            type: 'paragraph',
            version: 1
          };
        }),
        direction: 'ltr',
        format: '',
        indent: 0,
        type: 'root',
        version: 1
      }
    });
  }

  let i = 0;
  while (i < lines.length) {
    const parsed = parseTextLine(lines[i]);

    if (parsed.type === 'paragraph') {
      children.push({
        children: [
          {
            detail: 0,
            format: 0,
            mode: 'normal',
            style: '',
            text: parsed.text,
            type: 'text',
            version: 1
          }
        ],
        direction: 'ltr',
        format: '',
        indent: 0, // Always use 0 for paragraphs, spaces are in text content
        type: 'paragraph',
        version: 1
      });
      i++;
    } else {
      const listItems: ListItemInfo[] = [];

      while (i < lines.length) {
        const currentParsed = parseTextLine(lines[i]);
        if (currentParsed.type === 'paragraph') {
          break;
        }
        listItems.push({
          type: currentParsed.type as 'bullet' | 'number',
          text: currentParsed.text,
          indent: currentParsed.indent,
          numberValue: currentParsed.numberValue
        });
        i++;
      }

      // build nested lists and add to children
      const lists = buildListStructure(listItems) as ListEditorNode[];
      children.push(...lists);
    }
  }

  return JSON.stringify({
    root: {
      children: children,
      direction: 'ltr',
      format: '',
      indent: 0,
      type: 'root',
      version: 1
    }
  });
};

// menu text match
export type MenuTextMatch = {
  leadOffset: number;
  matchingString: string;
  replaceableString: string;
};
export type TriggerFn = (text: string, editor: LexicalEditor) => MenuTextMatch | null;
export const PUNCTUATION = '\\.,\\+\\*\\?\\$\\@\\|#{}\\(\\)\\^\\-\\[\\]\\\\/!%\'"~=<>_:;';
export function useBasicTypeaheadTriggerMatch(
  trigger: string,
  { minLength = 1, maxLength = 75 }: { minLength?: number; maxLength?: number }
): TriggerFn {
  return useCallback(
    (text: string) => {
      const validChars = `[^${trigger}${PUNCTUATION}\\s]`;
      const TypeaheadTriggerRegex = new RegExp(
        `([^${trigger}]|^)(` + `[${trigger}]` + `((?:${validChars}){0,${maxLength}})` + ')$'
      );
      const match = TypeaheadTriggerRegex.exec(text);
      if (match !== null) {
        const maybeLeadingWhitespace = match[1];
        const matchingString = match[3];
        if (matchingString.length >= minLength) {
          return {
            leadOffset: match.index + maybeLeadingWhitespace.length,
            matchingString,
            replaceableString: match[2]
          };
        }
      }
      return null;
    },
    [maxLength, minLength, trigger]
  );
}

// editor state to text
const processListItem = ({
  listItem,
  listType,
  index,
  indentLevel
}: {
  listItem: ListItemEditorNode;
  listType: 'bullet' | 'number';
  index: number;
  indentLevel: number;
}) => {
  const results = [];

  const itemText: string[] = [];
  const nestedLists: ListEditorNode[] = [];

  // Separate text and nested lists
  listItem.children.forEach((child) => {
    if (child.type === 'linebreak') {
      itemText.push('\n');
    } else if (child.type === 'text') {
      itemText.push(child.text);
    } else if (child.type === 'tab') {
      itemText.push(TabStr);
    } else if (child.type === 'variableLabel' || child.type === 'Variable') {
      itemText.push(child.variableKey);
    } else if (child.type === 'list') {
      nestedLists.push(child);
    }
  });

  // Add prefix and indent (using TabStr for consistency)
  const itemTextString = itemText.join('');
  const indent = TabStr.repeat(indentLevel);
  const prefix = listType === 'bullet' ? '- ' : `${index + 1}. `;
  results.push(indent + prefix + itemTextString);

  // Handle nested lists
  nestedLists.forEach((nestedList) => {
    const nestedResults = processList({
      list: nestedList,
      indentLevel: indentLevel + 1
    });
    results.push(...nestedResults);
  });

  return results;
};
const processList = ({ list, indentLevel = 0 }: { list: ListEditorNode; indentLevel?: number }) => {
  const results: string[] = [];

  list.children.forEach((listItem, index: number) => {
    if (listItem.type === 'listitem') {
      const itemResults = processListItem({
        listItem,
        listType: list.listType,
        index,
        indentLevel
      });
      results.push(...itemResults);
    }
  });

  return results;
};
export const editorStateToText = (editor: LexicalEditor) => {
  const editorStateTextString: string[] = [];
  const editorState = editor.getEditorState().toJSON() as EditorState;
  const paragraphs = editorState.root.children;

  const extractText = (node: ChildEditorNode): string => {
    if (!node) return '';

    // Handle line break nodes
    if (node.type === 'linebreak') {
      return '\n';
    }

    // Handle tab nodes
    if (node.type === 'tab') {
      return TabStr;
    }

    // Handle text nodes
    if (node.type === 'text') {
      return node.text || '';
    }

    // Handle custom variable nodes
    if (node.type === 'variableLabel' || node.type === 'Variable') {
      return node.variableKey || '';
    }

    // Handle paragraph nodes - recursively process children
    if (node.type === 'paragraph') {
      if (!node.children || node.children.length === 0) {
        return '';
      }
      return node.children.map(extractText).join('');
    }

    // Handle list item nodes - recursively process children (excluding nested lists)
    if (node.type === 'listitem') {
      if (!node.children || node.children.length === 0) {
        return '';
      }
      // Filter out nested list nodes as they are handled separately
      return node.children
        .filter((child) => child.type !== 'list')
        .map(extractText)
        .join('');
    }

    // Handle list nodes - recursively process children
    if (node.type === 'list') {
      if (!node.children || node.children.length === 0) {
        return '';
      }
      return node.children.map(extractText).join('');
    }

    // Unknown node type - return the raw text content if available
    console.warn('Unknown node type in extractText:', (node as any).type, node);

    // Try to extract text content from unknown node types
    if ('text' in node && typeof (node as any).text === 'string') {
      return (node as any).text;
    }

    // Try to recursively extract from children if present
    if ('children' in node && Array.isArray((node as any).children)) {
      return (node as any).children.map(extractText).join('');
    }

    // Fallback to stringifying the node content
    return JSON.stringify(node);
  };

  paragraphs.forEach((paragraph) => {
    if (paragraph.type === 'list') {
      const listResults = processList({ list: paragraph });
      editorStateTextString.push(...listResults);
    } else if (paragraph.type === 'paragraph') {
      const children = paragraph.children;
      const paragraphText: string[] = [];

      // Don't add indent prefix for paragraphs, spaces are already in text content
      children.forEach((child) => {
        const val = extractText(child);
        paragraphText.push(val);
      });

      const finalText = paragraphText.join('');
      editorStateTextString.push(finalText);
    } else {
      const text = extractText(paragraph);
      editorStateTextString.push(text);
    }
  });
  return editorStateTextString.join('\n');
};
