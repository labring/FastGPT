import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { type EditorVariableLabelPickerType } from '../../type';
import { useCallback, useEffect } from 'react';
import { $createVariableLabelNode, VariableLabelNode } from './node';
import type { TextNode } from 'lexical';
import { getHashtagRegexString } from './utils';
import { mergeRegister } from '@lexical/utils';
import { registerLexicalTextEntity } from '../../utils';
import { useTranslation } from 'next-i18next';

const REGEX = new RegExp(getHashtagRegexString(), 'i');

export default function VariableLabelPlugin({
  variables
}: {
  variables: EditorVariableLabelPickerType[];
}) {
  const { t } = useTranslation();
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    if (!editor.hasNodes([VariableLabelNode]))
      throw new Error('VariableLabelPlugin: VariableLabelPlugin not registered on editor');
  }, [editor]);

  const createVariableLabelPlugin = useCallback(
    (textNode: TextNode): VariableLabelNode => {
      const content = textNode.getTextContent().slice(3, -3); // Remove {{$ and $}}
      const dotIndex = content.indexOf('.');
      const parentKey = content.slice(0, dotIndex);
      const childrenKey = content.slice(dotIndex + 1);

      const currentVariable = variables.find(
        (item) => item.parent.id === parentKey && item.key === childrenKey
      );
      const variableLabel = `${currentVariable && t(currentVariable.parent?.label as any)}.${currentVariable?.label}`;
      const nodeAvatar = currentVariable?.parent?.avatar || '';
      return $createVariableLabelNode(textNode.getTextContent(), variableLabel, nodeAvatar);
    },
    [t]
  );

  const getVariableMatch = useCallback((text: string) => {
    const matches = REGEX.exec(text);
    if (!matches) return null;
    // if (variableKeys.indexOf(matches[4]) === -1) return null;
    const hashtagLength = matches[4].length + 6;
    const startOffset = matches.index;
    const endOffset = startOffset + hashtagLength;
    return {
      end: endOffset,
      start: startOffset
    };
  }, []);

  useEffect(() => {
    mergeRegister(
      ...registerLexicalTextEntity(
        editor,
        getVariableMatch,
        VariableLabelNode,
        createVariableLabelPlugin
      )
    );
  }, [createVariableLabelPlugin, editor, getVariableMatch]);

  return null;
}
