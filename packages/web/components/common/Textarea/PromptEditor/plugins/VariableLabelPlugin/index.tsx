import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { type EditorVariableLabelPickerType } from '../../type';
import { useCallback, useEffect } from 'react';
import { $createVariableLabelNode, VariableLabelNode } from './node';
import { $nodesOfType, type TextNode } from 'lexical';
import { getHashtagRegexString } from './utils';
import { mergeRegister } from '@lexical/utils';
import { registerLexicalTextEntity } from '../../utils';
import { useSafeTranslation } from '../../../../../../hooks/useSafeTranslation';
import type { WorkflowReferenceSnapshot } from '@fastgpt/global/core/workflow/type/io';

const REGEX = new RegExp(getHashtagRegexString(), 'i');
type VariableLabelData = {
  variableLabel: string;
  nodeAvatar: string;
  invalidReason?: EditorVariableLabelPickerType['invalidReason'];
};

export default function VariableLabelPlugin({
  variables,
  referenceSnapshots
}: {
  variables: EditorVariableLabelPickerType[];
  referenceSnapshots?: WorkflowReferenceSnapshot[];
}) {
  const { t } = useSafeTranslation();
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    if (!editor.hasNodes([VariableLabelNode]))
      throw new Error('VariableLabelPlugin: VariableLabelPlugin not registered on editor');
  }, [editor]);

  const getVariableLabelData = useCallback(
    (variableKey: string): VariableLabelData => {
      const content = variableKey.slice(3, -3);
      const [parentKey, ...childKeys] = content.split('.');
      const childKey = childKeys.join('.') || content;
      const currentVariable = variables.find(
        (item) => item.parent.id === parentKey && item.key === childKey
      );
      const snapshot = referenceSnapshots?.find(
        (item) => item.reference[0] === parentKey && item.reference[1] === childKey
      );

      return currentVariable
        ? {
            variableLabel: `${t(currentVariable.parent.label as any)}.${currentVariable.label}`,
            nodeAvatar: currentVariable.parent.avatar || '',
            invalidReason: currentVariable.invalidReason
          }
        : snapshot
          ? {
              variableLabel: `${snapshot.sourceLabel || 'undefined'}.${
                snapshot.outputLabel ? t(snapshot.outputLabel as any) : childKey
              }`,
              nodeAvatar: snapshot.icon || '',
              invalidReason: 'invalid_reference'
            }
          : {
              variableLabel: `undefined.${childKey}`,
              nodeAvatar: ''
            };
    },
    [referenceSnapshots, t, variables]
  );

  const createVariableLabelPlugin = useCallback(
    (textNode: TextNode): VariableLabelNode => {
      const { variableLabel, nodeAvatar, invalidReason } = getVariableLabelData(
        textNode.getTextContent()
      );
      return $createVariableLabelNode(
        textNode.getTextContent(),
        variableLabel,
        nodeAvatar,
        invalidReason
      );
    },
    [getVariableLabelData]
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
    return mergeRegister(
      ...registerLexicalTextEntity(
        editor,
        getVariableMatch,
        VariableLabelNode,
        createVariableLabelPlugin
      )
    );
  }, [createVariableLabelPlugin, editor, getVariableMatch]);

  useEffect(() => {
    editor.update(() => {
      $nodesOfType(VariableLabelNode).forEach((node) => {
        const { variableLabel, nodeAvatar, invalidReason } = getVariableLabelData(
          node.getVariableKey()
        );
        node.setVariableLabel(variableLabel);
        node.setNodeAvatar(nodeAvatar);
        node.setInvalidReason(invalidReason);
      });
    });
  }, [editor, getVariableLabelData]);

  return null;
}
