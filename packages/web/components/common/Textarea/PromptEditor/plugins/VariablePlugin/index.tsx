import { TextNode } from 'lexical';
import { mergeRegister } from '@lexical/utils';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useCallback, useEffect } from 'react';

import { getHashtagRegexString } from './utils';
import { registerLexicalTextEntity } from '../../utils';
import { $createVariableNode, VariableNode } from './node';

const REGEX = new RegExp(getHashtagRegexString(), 'i');

export default function VariablePlugin() {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    if (!editor.hasNodes([VariableNode]))
      throw new Error('VariablePlugin: VariableNode not registered on editor');
  }, [editor]);

  const createVariableNode = useCallback((textNode: TextNode): VariableNode => {
    return $createVariableNode(textNode.getTextContent());
  }, []);

  const getVariableMatch = useCallback((text: string) => {
    const matches = REGEX.exec(text);
    if (!matches) return null;

    const hashtagLength = matches[3].length + 4;
    const startOffset = matches.index;
    const endOffset = startOffset + hashtagLength;
    return {
      end: endOffset,
      start: startOffset
    };
  }, []);

  useEffect(() => {
    mergeRegister(
      ...registerLexicalTextEntity(editor, getVariableMatch, VariableNode, createVariableNode)
    );
  }, [createVariableNode, editor, getVariableMatch]);

  return null;
}
