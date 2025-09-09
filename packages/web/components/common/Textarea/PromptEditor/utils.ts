/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type { DecoratorNode, Klass, LexicalEditor, LexicalNode } from 'lexical';
import type { EntityMatch } from '@lexical/text';
import { $createTextNode, $isTextNode, TextNode } from 'lexical';
import { useCallback } from 'react';
import type { VariableLabelNode } from './plugins/VariableLabelPlugin/node';
import type { VariableNode } from './plugins/VariablePlugin/node';
import type {
  ChildEditorNode,
  ListItemEditorNode,
  ListEditorNode,
  ParagraphEditorNode,
  RootEditorNode,
  EditorState,
  ParsedTextLine,
  ListItemInfo,
  TextEditorNode
} from './type';

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

function parseTextLine(line: string): ParsedTextLine {
  const trimmed = line.trimStart();
  const indentLevel = Math.floor((line.length - trimmed.length) / 2);
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
      value: parseInt(numberMatch[1])
    };
  }
  return { type: 'paragraph', text: line, indent: 0 };
}
function createListItem(text: string, value: number): ListItemEditorNode {
  return {
    children: [
      {
        detail: 0,
        format: 0,
        mode: 'normal',
        style: '',
        text: text,
        type: 'text',
        version: 1
      }
    ],
    direction: 'ltr',
    format: '',
    indent: 0,
    type: 'listitem',
    version: 1,
    value: value
  };
}
function createList(listType: 'bullet' | 'number', children: ListItemEditorNode[]): ListEditorNode {
  return {
    children: children,
    direction: 'ltr',
    format: '',
    indent: 0,
    type: 'list',
    version: 1,
    listType: listType,
    start: 1,
    tag: listType === 'bullet' ? 'ul' : 'ol'
  };
}
/**
 * 构建嵌套列表结构
 *
 * 将扁平的列表项数组转换为带有正确嵌套关系的编辑器节点结构
 *
 * 主要功能：
 * 1. 按类型（bullet/number）和缩进级别分组连续的列表项
 * 2. 为每个分组创建对应的列表容器（<ul> 或 <ol>）
 * 3. 递归处理嵌套子项，构建多层级列表结构
 *
 * @param items 扁平的列表项数组
 * @param baseIndent 当前处理的基础缩进级别
 * @returns 结构化的列表节点数组
 */
function buildListStructure(
  items: ListItemInfo[],
  baseIndent: number = 0
): Array<ListEditorNode | ListItemEditorNode> {
  const result: Array<ListEditorNode | ListItemEditorNode> = [];
  let i = 0;

  while (i < items.length) {
    const currentType = items[i].type; // 当前项的类型（bullet 或 number）
    const currentIndent = items[i].indent; // 当前项的缩进级别

    // 如果缩进级别小于基础级别，说明回到了上层，停止当前层级的处理
    if (currentIndent < baseIndent) {
      break;
    }

    // 只处理与基础缩进相同的项（同级项）
    if (currentIndent === baseIndent) {
      // 收集连续的同类型、同缩进级别的项，它们将组成一个列表容器
      const sameTypeItems: ListItemEditorNode[] = [];

      // 遍历所有连续的同类型同缩进项
      while (
        i < items.length &&
        items[i].type === currentType &&
        items[i].indent === currentIndent
      ) {
        const item = items[i];
        // 创建当前列表项节点
        const listItem = createListItem(item.text, item.value || 1);

        // 前瞻扫描：收集属于当前项的所有嵌套子项
        // 这些子项的缩进级别会大于当前级别
        const nestedItems: ListItemInfo[] = [];
        let j = i + 1;

        while (j < items.length && items[j].indent > currentIndent) {
          nestedItems.push(items[j]);
          j++;
        }

        // 如果有嵌套子项，递归处理它们并添加到当前项的 children 中
        if (nestedItems.length > 0) {
          const nestedLists = buildListStructure(
            nestedItems,
            currentIndent + 1
          ) as ListEditorNode[];
          listItem.children.push(...nestedLists);
        }

        sameTypeItems.push(listItem);
        // 跳转到下一个未处理的项（跳过已处理的嵌套项）
        i = j;
      }

      // 为同类型的项创建列表容器（<ul> 或 <ol>）
      if (sameTypeItems.length > 0) {
        result.push(createList(currentType, sameTypeItems));
      }
    } else {
      // 跳过缩进级别不匹配的项（理论上不应该发生）
      i++;
    }
  }

  return result;
}

export function textToEditorState(text = '') {
  const lines = text.split('\n');
  const children: Array<ParagraphEditorNode | ListEditorNode> = [];

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
        indent: 0,
        type: 'paragraph',
        version: 1
      });
      i++;
    } else {
      // Collect consecutive list items
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
          value: currentParsed.value
        });
        i++;
      }

      // Group list items into nested structures
      const lists = buildListStructure(listItems, 0) as ListEditorNode[];
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
}

const varRegex = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;
export const getVars = (value: string) => {
  if (!value) return [];
  const keys =
    value
      .match(varRegex)
      ?.map((item) => {
        return item.replace('{{', '').replace('}}', '');
      })
      .filter((key) => key.length <= 10) || [];
  const keyObj: Record<string, boolean> = {};
  // remove duplicate keys
  const res: string[] = [];
  keys.forEach((key) => {
    if (keyObj[key]) return;

    keyObj[key] = true;
    res.push(key);
  });
  return res;
};

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

function processListItem({
  listItem,
  listType,
  index,
  indentLevel
}: {
  listItem: ListItemEditorNode;
  listType: 'bullet' | 'number';
  index: number;
  indentLevel: number;
}): string[] {
  const results: string[] = [];

  const itemText: string[] = [];
  const nestedLists: ListEditorNode[] = [];

  listItem.children.forEach((child) => {
    if (child.type === 'linebreak') {
      itemText.push('\n');
    } else if (child.type === 'text') {
      itemText.push(child.text);
    } else if (child.type === 'variableLabel' || child.type === 'Variable') {
      itemText.push(child.variableKey);
    } else if (child.type === 'list') {
      nestedLists.push(child);
    }
  });

  const itemTextString = itemText.join('').trim();

  if (itemTextString) {
    const indent = '  '.repeat(indentLevel);
    const prefix = listType === 'bullet' ? '- ' : `${index + 1}. `;

    results.push(indent + prefix + itemTextString);
  }

  nestedLists.forEach((nestedList) => {
    const nestedResults = processList({
      list: nestedList,
      indentLevel: indentLevel + 1
    });
    results.push(...nestedResults);
  });

  return results;
}

function processList({
  list,
  indentLevel = 0
}: {
  list: ListEditorNode;
  indentLevel?: number;
}): string[] {
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
}

export function editorStateToText(editor: LexicalEditor) {
  const editorStateTextString: string[] = [];
  const editorState = editor.getEditorState().toJSON() as EditorState;
  const paragraphs = editorState.root.children;

  paragraphs.forEach((paragraph) => {
    if (paragraph.type === 'list') {
      const listResults = processList({ list: paragraph });
      editorStateTextString.push(...listResults);
    } else if (paragraph.type === 'paragraph') {
      const children = paragraph.children;
      const paragraphText: string[] = [];
      children.forEach((child) => {
        if (child.type === 'linebreak') {
          paragraphText.push('\n');
        } else if (child.type === 'text') {
          paragraphText.push(child.text);
        } else if (child.type === 'variableLabel' || child.type === 'Variable') {
          paragraphText.push(child.variableKey);
        }
      });
      editorStateTextString.push(paragraphText.join(''));
    }
  });
  return editorStateTextString.join('\n');
}
