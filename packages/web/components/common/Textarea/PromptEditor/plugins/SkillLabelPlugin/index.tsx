import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useCallback, useEffect, useRef } from 'react';
import { $createSkillNode, SkillNode } from './node';
import type { TextNode } from 'lexical';
import { getSkillRegexString } from './utils';
import { mergeRegister } from '@lexical/utils';
import { registerLexicalTextEntity } from '../../utils';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { SelectedToolItemType } from '@fastgpt/global/core/app/formEdit/type';

const REGEX = new RegExp(getSkillRegexString(), 'i');

export type SkillLabelItemType = SelectedToolItemType & {
  tooltip?: string;
};

function SkillLabelPlugin({
  selectedSkills = [],
  onClickSkill,
  onRemoveSkill
}: {
  selectedSkills: SkillLabelItemType[];
  onClickSkill: (id: string) => void;
  onRemoveSkill: (id: string) => void;
}) {
  const [editor] = useLexicalComposerContext();

  // Track the mapping of node keys to skill IDs for detecting deletions
  const previousIdsRef = useRef<Map<string, string>>(new Map());

  // Check if SkillNode is registered in the editor
  useEffect(() => {
    if (!editor.hasNodes([SkillNode])) {
      console.error('SkillLabelPlugin: SkillNode not registered on editor');
    }
  }, [editor]);

  const getSkillMatch = useCallback((text: string) => {
    const matches = REGEX.exec(text);
    if (!matches) return null;

    const skillLength = matches[4].length + 6; // {{@ + skillKey + @}}
    const startOffset = matches.index;
    const endOffset = startOffset + skillLength;

    return {
      end: endOffset,
      start: startOffset
    };
  }, []);

  // Register text entity transformer to convert {{@skillId@}} text into SkillNode
  useEffect(() => {
    const createSkillPlugin = (textNode: TextNode): SkillNode => {
      const textContent = textNode.getTextContent();
      const skillId = textContent.slice(3, -3);

      const tool = selectedSkills.find((t) => t.id === skillId);

      if (tool) {
        return $createSkillNode({
          id: tool.id,
          name: tool.name,
          icon: tool.avatar,
          skillType: tool.flowNodeType,
          status: tool.configStatus,
          onClick: onClickSkill
        });
      }

      return $createSkillNode({
        id: skillId,
        name: skillId,
        icon: undefined,
        skillType: FlowNodeTypeEnum.tool,
        status: 'invalid',
        onClick: (id) => {
          // Delete the skill node from editor
          editor.update(() => {
            const nodes = editor.getEditorState()._nodeMap;
            nodes.forEach((node) => {
              if (node instanceof SkillNode && node.getSkillKey() === id) {
                node.remove();
              }
            });
          });
        }
      });
    };

    const unregister = mergeRegister(
      ...registerLexicalTextEntity(editor, getSkillMatch, SkillNode, createSkillPlugin)
    );
    return unregister;
  }, [editor, getSkillMatch, onClickSkill, selectedSkills]);

  // Update existing SkillNode properties when selectedSkills change
  // Sync tool name, avatar, status and configure handler for each skill node
  useEffect(() => {
    if (selectedSkills.length === 0) return;

    // Wrapped click handler: delete if invalid, otherwise call original onClickSkill
    const handleClick = (id: string, status: SkillLabelItemType['configStatus']) => {
      if (status === 'invalid') {
        // Delete the skill node from editor
        editor.update(() => {
          const nodes = editor.getEditorState()._nodeMap;
          nodes.forEach((node) => {
            if (node instanceof SkillNode && node.getSkillKey() === id) {
              node.remove();
            }
          });
        });
      } else {
        // Call original click handler for configuration
        onClickSkill(id);
      }
    };

    // Perform all operations in a single editor.update() to avoid node reference issues
    // This ensures we work within the same editor state snapshot
    editor.update(() => {
      const nodes = editor.getEditorState()._nodeMap;

      nodes.forEach((node) => {
        if (node instanceof SkillNode) {
          const id = node.getSkillKey();
          const tool = selectedSkills.find((t) => t.id === id);
          if (tool) {
            const writableNode = node.getWritable();
            writableNode.__id = tool.id;
            writableNode.__name = tool.name;
            writableNode.__icon = tool.avatar;
            writableNode.__skillType = tool.flowNodeType;
            writableNode.__status = tool.configStatus;
            writableNode.__onClick = (id) => handleClick(id, tool.configStatus);
          }
        }
      });
    });
  }, [selectedSkills, editor, onClickSkill]);

  // Monitor skill node mutations and notify parent on destruction
  useEffect(() => {
    const unregister = editor.registerMutationListener(SkillNode, (mutatedNodes) => {
      const currentState = editor.getEditorState();

      mutatedNodes.forEach((mutation, nodeKey) => {
        if (mutation === 'destroyed') {
          const removedId = previousIdsRef.current.get(nodeKey);
          if (removedId) {
            onRemoveSkill(removedId);
          }
          previousIdsRef.current.delete(nodeKey);
          return;
        }

        const node = currentState._nodeMap.get(nodeKey);
        if (node instanceof SkillNode) {
          previousIdsRef.current.set(nodeKey, node.getSkillKey());
        }
      });
    });

    // Initialize with current state
    editor.getEditorState().read(() => {
      const nodes = editor.getEditorState()._nodeMap;
      nodes.forEach((node, nodeKey) => {
        if (node instanceof SkillNode) {
          previousIdsRef.current.set(nodeKey, node.getSkillKey());
        }
      });
    });

    return unregister;
  }, [editor, onRemoveSkill]);

  return null;
}

export default SkillLabelPlugin;
