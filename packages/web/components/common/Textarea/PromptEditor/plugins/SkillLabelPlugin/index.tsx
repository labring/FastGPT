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
import { mergeRegister } from '@lexical/utils';
import { registerLexicalTextEntity } from '../../utils';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { SelectedToolItemType } from '@fastgpt/global/core/app/formEdit/type';
import { createToolReferenceRegExp } from '@fastgpt/global/core/app/tool/utils';
import { findSkillByReferenceKey } from './match';

// 编辑器与运行时共用 `TOOL_REFERENCE_REGEX_SOURCE`：一次消费整段多层花括号，
// 避免把外层花括号留在编辑器里变成普通文本。
const SKILL_REFERENCE_REGEX = createToolReferenceRegExp('i');

const findPendingSkillByReferenceKey = (
  pendingSkills: Map<string, SkillLabelItemType>,
  referenceKey: string
) => findSkillByReferenceKey(Array.from(pendingSkills.values()), referenceKey);

export type SkillLabelItemType = Partial<SelectedToolItemType> & {
  id: string;
  name: string;
  avatar?: string;
  flowNodeType: FlowNodeTypeEnum;
  /** 仅用于编辑器展示，由工具或内置能力的当前配置推导。 */
  configStatus?: 'noConfig' | 'waitingForConfig' | 'configured' | 'invalid';
  tooltip?: string;
};

function SkillLabelPlugin({
  selectedSkills = [],
  onClickSkill,
  pendingSkillsRef
}: {
  selectedSkills: SkillLabelItemType[];
  onClickSkill: (id: string, source?: string) => void;
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
    const matches = SKILL_REFERENCE_REGEX.exec(text);
    if (!matches) return null;

    // 消费整个多层引用（含外层多余花括号），而不是只取最内层 {{@id@}}。
    const startOffset = matches.index;

    return {
      end: startOffset + matches[0].length,
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
        findSkillByReferenceKey(selectedSkillsRef.current, id) ??
        findPendingSkillByReferenceKey(pendingSkillsRef.current, id);

      if (!tool || tool.configStatus === 'invalid') {
        removeSkillNode(id, nodeKey);
        return;
      }

      // 点击回传实际命中的工具身份键（`tool.id`），配置弹窗才能按完整身份键定位；
      // 节点自身的 `__id` 仍保留原始引用键，供序列化与删除使用。
      onClickSkillRef.current(tool.id, tool.source);
    },
    [pendingSkillsRef, removeSkillNode]
  );

  // Register text entity transformer to convert {{@skillId@}} text into SkillNode
  useEffect(() => {
    const createSkillPlugin = (textNode: TextNode): SkillNode => {
      const textContent = textNode.getTextContent();
      const matches = SKILL_REFERENCE_REGEX.exec(textContent);
      // 捕获组 3 为引用键；与运行时使用同一匹配规则。
      const skillId = matches?.[3] ?? textContent.replace(/^\{+@/, '').replace(/@\}+$/, '');

      const selectedTool = findSkillByReferenceKey(selectedSkillsRef.current, skillId);
      if (selectedTool) {
        pendingSkillsRef.current.delete(selectedTool.id);
      }
      const tool =
        selectedTool ?? findPendingSkillByReferenceKey(pendingSkillsRef.current, skillId);

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
        const selectedTool = findSkillByReferenceKey(selectedSkills, id);
        if (selectedTool) {
          pendingSkillsRef.current.delete(selectedTool.id);
        }
        const tool = selectedTool ?? findPendingSkillByReferenceKey(pendingSkillsRef.current, id);
        const writableNode = node.getWritable();

        if (tool) {
          // `__id` 保持原始引用键（用于序列化/删除），只同步展示与点击信息。
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
