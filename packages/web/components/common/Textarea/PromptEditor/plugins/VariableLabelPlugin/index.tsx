import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { type EditorVariableLabelPickerType } from '../../type';
import { useCallback, useEffect } from 'react';
import { $createVariableLabelNode, VariableLabelNode } from './node';
import { $nodesOfType, type TextNode } from 'lexical';
import { getHashtagRegexString } from './utils';
import { mergeRegister } from '@lexical/utils';
import { registerLexicalTextEntity } from '../../utils';
import { useSafeTranslation } from '../../../../../../hooks/useSafeTranslation';
import type { WorkflowReferenceStatus } from '@fastgpt/global/core/workflow/editor/types';
import { useWorkflowReferenceScope } from '../../context';

const REGEX = new RegExp(getHashtagRegexString(), 'i');
type VariableLabelInvalidReason = Exclude<WorkflowReferenceStatus['code'], 'empty' | 'valid'>;

type VariableLabelData = {
  variableLabel: string;
  nodeAvatar: string;
  invalidReason?: VariableLabelInvalidReason;
};

/**
 * 提取变量标签的显示信息。
 * 来源仍有效时使用实时变量列表；来源已失效时使用引用状态里的快照名称，避免只显示“无效变量”。
 */
export const getVariableLabelData = ({
  variableKey,
  variables,
  references,
  t
}: {
  variableKey: string;
  variables: EditorVariableLabelPickerType[];
  references?: readonly WorkflowReferenceStatus[];
  t: (key: any) => string;
}): VariableLabelData => {
  const content = variableKey.slice(3, -3);
  const [parentKey, ...childKeys] = content.split('.');
  const childKey = childKeys.join('.') || content;
  const currentVariable = variables.find(
    (item) => item.parent.id === parentKey && item.key === childKey
  );
  const currentStatus = references?.find(
    (status) =>
      status.reference !== undefined &&
      status.reference[0] === parentKey &&
      status.reference[1] === childKey
  );
  const invalidReason =
    currentStatus && currentStatus.code !== 'empty' && currentStatus.code !== 'valid'
      ? currentStatus.code
      : undefined;

  if (currentVariable) {
    return {
      variableLabel: `${t(currentVariable.parent.label as any)}.${t(currentVariable.label as any)}`,
      nodeAvatar: currentVariable.parent.avatar || '',
      invalidReason
    };
  }

  return currentStatus
    ? {
        variableLabel: `${t(currentStatus.sourceLabel || 'undefined')}.${
          currentStatus.outputLabel ? t(currentStatus.outputLabel as any) : childKey
        }`,
        nodeAvatar: currentStatus.icon || '',
        invalidReason
      }
    : {
        variableLabel: `undefined.${childKey}`,
        nodeAvatar: ''
      };
};

export default function VariableLabelPlugin({
  variables
}: {
  variables: EditorVariableLabelPickerType[];
}) {
  const { t } = useSafeTranslation();
  const reference = useWorkflowReferenceScope();
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    if (!editor.hasNodes([VariableLabelNode]))
      throw new Error('VariableLabelPlugin: VariableLabelPlugin not registered on editor');
  }, [editor]);

  const resolveVariableLabelData = useCallback(
    (variableKey: string) =>
      getVariableLabelData({
        variableKey,
        variables,
        references: reference as readonly WorkflowReferenceStatus[] | undefined,
        t
      }),
    [reference, t, variables]
  );

  const createVariableLabelPlugin = useCallback(
    (textNode: TextNode): VariableLabelNode => {
      const { variableLabel, nodeAvatar, invalidReason } = resolveVariableLabelData(
        textNode.getTextContent()
      );
      return $createVariableLabelNode(
        textNode.getTextContent(),
        variableLabel,
        nodeAvatar,
        invalidReason
      );
    },
    [resolveVariableLabelData]
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
        const { variableLabel, nodeAvatar, invalidReason } = resolveVariableLabelData(
          node.getVariableKey()
        );
        node.setVariableLabel(variableLabel);
        node.setNodeAvatar(nodeAvatar);
        node.setInvalidReason(invalidReason);
      });
    });
  }, [editor, resolveVariableLabelData]);

  return null;
}
