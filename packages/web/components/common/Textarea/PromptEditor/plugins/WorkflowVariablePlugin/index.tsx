import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { EditorWorkflowVariableType } from '../../type';
import { useCallback, useEffect } from 'react';
import { $createWorkflowVariableNode, WorkflowVariableNode } from './node';
import { TextNode } from 'lexical';
import { mergeRegister } from '@lexical/utils';
import { registerLexicalTextEntity } from '../../utils';
import { getHashtagRegexString } from './utils';

const REGEX = new RegExp(getHashtagRegexString(), 'i');

export default function WorkflowVariablePlugin({
  variables
}: {
  variables: EditorWorkflowVariableType[];
}) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    if (!editor.hasNodes([WorkflowVariableNode]))
      throw new Error('WorkflowVariablePlugin: WorkflowVariablePlugin not registered on editor');
  }, [editor]);

  const createWorkflowVariablePlugin = useCallback((textNode: TextNode): WorkflowVariableNode => {
    const currentVariable = variables.find((item) => item.key === textNode.getTextContent());
    const variableLabel = currentVariable?.name;
    return $createWorkflowVariableNode(textNode.getTextContent(), variableLabel || '');
  }, []);

  const getVariableMatch = useCallback((text: string) => {
    const matches = REGEX.exec(text);
    if (!matches) return null;
    const hashtagLength = matches[0].length;
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
        WorkflowVariableNode,
        createWorkflowVariablePlugin
      )
    );
  }, [createWorkflowVariablePlugin, editor, getVariableMatch]);

  return null;
}
