import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useCallback, useEffect, useRef } from 'react';
import { $createSkillNode, SkillNode } from './node';
import {
  $getNodeByKey,
  $getRoot,
  $isElementNode,
  type LexicalNode,
  type NodeKey,
  type TextNode
} from 'lexical';
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
  pendingSkillsRef
}: {
  selectedSkills: SkillLabelItemType[];
  onClickSkill: (id: string) => void;
  onRemoveSkill: (id: string) => void;
  pendingSkillsRef: React.MutableRefObject<Map<string, SkillLabelItemType>>;
}) {
  const [editor] = useLexicalComposerContext();
  const selectedSkillsRef = useRef(selectedSkills);
  const onClickSkillRef = useRef(onClickSkill);

  useEffect(() => {
    selectedSkillsRef.current = selectedSkills;

    selectedSkills.forEach((skill) => {
      pendingSkillsRef.current.delete(skill.id);
    });
  }, [pendingSkillsRef, selectedSkills]);

  useEffect(() => {
    onClickSkillRef.current = onClickSkill;
  }, [onClickSkill]);

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

  const visitSkillNodes = useCallback((handler: (node: SkillNode) => void) => {
    const visitNode = (node: LexicalNode) => {
      if (node instanceof SkillNode) {
        handler(node);
        return;
      }

      if ($isElementNode(node)) {
        node.getChildren().forEach(visitNode);
      }
    };

    visitNode($getRoot());
  }, []);

  const removeSkillNode = useCallback(
    (id: string, nodeKey?: NodeKey) => {
      editor.update(() => {
        if (nodeKey) {
          const node = $getNodeByKey(nodeKey);
          if (node instanceof SkillNode && node.getSkillKey() === id) {
            node.remove();
          }
          return;
        }

        visitSkillNodes((node) => {
          if (node.getSkillKey() === id) {
            node.remove();
          }
        });
      });
    },
    [editor, visitSkillNodes]
  );

  const handleSkillClick = useCallback(
    (id: string, nodeKey?: NodeKey) => {
      const tool =
        selectedSkillsRef.current.find((item) => item.id === id) ??
        pendingSkillsRef.current.get(id);

      if (!tool || tool.configStatus === 'invalid') {
        removeSkillNode(id, nodeKey);
        return;
      }

      onClickSkillRef.current(id);
    },
    [pendingSkillsRef, removeSkillNode]
  );

  // Register text entity transformer to convert {{@skillId@}} text into SkillNode
  useEffect(() => {
    const createSkillPlugin = (textNode: TextNode): SkillNode => {
      const textContent = textNode.getTextContent();
      const skillId = textContent.slice(3, -3);

      const selectedTool = selectedSkillsRef.current.find((t) => t.id === skillId);
      if (selectedTool) {
        pendingSkillsRef.current.delete(skillId);
      }
      const tool = selectedTool ?? pendingSkillsRef.current.get(skillId);

      return $createSkillNode({
        id: skillId,
        name: tool?.name ?? skillId,
        icon: tool?.avatar,
        skillType: tool?.flowNodeType ?? FlowNodeTypeEnum.tool,
        status: tool?.configStatus ?? 'invalid',
        onClick: handleSkillClick
      });
    };

    const unregister = mergeRegister(
      ...registerLexicalTextEntity(editor, getSkillMatch, SkillNode, createSkillPlugin)
    );
    return unregister;
  }, [editor, getSkillMatch, handleSkillClick, pendingSkillsRef]);

  // Update existing SkillNode properties when selectedSkills change
  // Sync tool name, avatar, status and configure handler for each skill node
  useEffect(() => {
    editor.update(() => {
      visitSkillNodes((node) => {
        const id = node.getSkillKey();
        const selectedTool = selectedSkills.find((t) => t.id === id);
        if (selectedTool) {
          pendingSkillsRef.current.delete(id);
        }
        const tool = selectedTool ?? pendingSkillsRef.current.get(id);
        const writableNode = node.getWritable();

        if (tool) {
          writableNode.__id = tool.id;
          writableNode.__name = tool.name;
          writableNode.__icon = tool.avatar;
          writableNode.__skillType = tool.flowNodeType;
          writableNode.__status = tool.configStatus;
          writableNode.__onClick = handleSkillClick;
        } else {
          writableNode.__name = id;
          writableNode.__icon = undefined;
          writableNode.__skillType = FlowNodeTypeEnum.tool;
          writableNode.__status = 'invalid';
          writableNode.__onClick = handleSkillClick;
        }
      });
    });
  }, [selectedSkills, editor, handleSkillClick, pendingSkillsRef, visitSkillNodes]);

  return null;
}

export default SkillLabelPlugin;
