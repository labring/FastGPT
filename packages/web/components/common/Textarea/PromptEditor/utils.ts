/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type { DecoratorNode, Klass, LexicalEditor, LexicalNode } from 'lexical';
import type { EntityMatch } from '@lexical/text';
import { $createTextNode, $getRoot, $isTextNode, TextNode } from 'lexical';
import { useCallback } from 'react';
import { VariableLabelNode } from './plugins/VariableLabelPlugin/node';

export function registerLexicalTextEntity<T extends TextNode | VariableLabelNode>(
  editor: LexicalEditor,
  getMatch: (text: string) => null | EntityMatch,
  targetNode: Klass<T>,
  createNode: (textNode: TextNode) => T
): Array<() => void> {
  const isTargetNode = (node: LexicalNode | null | undefined): node is T => {
    return node instanceof targetNode;
  };

  const replaceWithSimpleText = (node: TextNode | VariableLabelNode): void => {
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
      } else {
        const nextMatch = getMatch(nextText);

        if (nextMatch !== null && nextMatch.start === 0) {
          return;
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

export function textToEditorState(text = '') {
  const paragraph = typeof text === 'string' ? text?.split('\n') : [''];

  return JSON.stringify({
    root: {
      children: paragraph.map((p) => {
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

export function editorStateToText(editor: LexicalEditor) {
  const editorStateTextString: string[] = [];
  const paragraphs = editor.getEditorState().toJSON().root.children;
  paragraphs.forEach((paragraph: any) => {
    const children = paragraph.children;
    const paragraphText: string[] = [];
    children.forEach((child: any) => {
      if (child.type === 'linebreak') {
        paragraphText.push(`
`);
      } else if (child.text) {
        paragraphText.push(child.text);
      } else if (child.type === 'variableLabel') {
        paragraphText.push(child.variableKey);
      }
    });
    editorStateTextString.push(paragraphText.join(''));
  });
  return editorStateTextString.join(`
`);
}

const varRegex = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;
export const getVars = (value: string) => {
  if (!value) return [];
  // .filter((item) => {
  //   return ![CONTEXT_PLACEHOLDER_TEXT, HISTORY_PLACEHOLDER_TEXT, QUERY_PLACEHOLDER_TEXT, PRE_PROMPT_PLACEHOLDER_TEXT].includes(item)
  // })
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
