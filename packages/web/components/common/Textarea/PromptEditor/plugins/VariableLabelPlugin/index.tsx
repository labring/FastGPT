import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useEffect } from 'react';
import { $createVariableLabelNode, VariableLabelNode } from './node';
import type { TextNode } from 'lexical';
import { getHashtagRegexString } from './utils';
import { mergeRegister } from '@lexical/utils';
import { registerLexicalTextEntity } from '../../utils';

const REGEX = new RegExp(getHashtagRegexString(), 'i');

const getVariableMatch = (text: string) => {
  const matches = REGEX.exec(text);
  if (!matches) return null;
  return { start: matches.index, end: matches.index + matches[4].length + 6 };
};

const createVariableLabelNode = (textNode: TextNode) =>
  $createVariableLabelNode({
    variableKey: textNode.getTextContent(),
    variableLabel: '',
    nodeAvatar: ''
  });

export default function VariableLabelPlugin() {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    if (!editor.hasNodes([VariableLabelNode]))
      throw new Error('VariableLabelPlugin: VariableLabelPlugin not registered on editor');
    return mergeRegister(
      ...registerLexicalTextEntity(
        editor,
        getVariableMatch,
        VariableLabelNode,
        createVariableLabelNode
      )
    );
  }, [editor]);

  return null;
}
