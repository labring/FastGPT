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
import { findAgentPromptRefEntityMatch } from '@fastgpt/global/core/workflow/node/agent/promptRef/text';
import type { AgentPromptRefRegistry } from '@fastgpt/global/core/workflow/node/agent/promptRef/registry';
import { useTranslation } from 'next-i18next';

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
  promptRefRegistry,
  onClickSkill,
  pendingSkillsRef
}: {
  selectedSkills: SkillLabelItemType[];
  promptRefRegistry?: AgentPromptRefRegistry<SkillLabelItemType>;
  onClickSkill: (id: string, source?: string) => void;
  pendingSkillsRef: React.MutableRefObject<Map<string, SkillLabelItemType>>;
}) {
  const { t } = useTranslation();
  const [editor] = useLexicalComposerContext();
  const selectedSkillsRef = useRef(selectedSkills);
  const promptRefRegistryRef = useRef(promptRefRegistry);
  const onClickSkillRef = useRef(onClickSkill);
  const ambiguousToolTip = t('common:tool_ambiguous_click_delete_tip');

  const resolveSkillDisplay = useCallback(
    (
      rawKey: string
    ): {
      tool?: SkillLabelItemType;
      status: SkillLabelItemType['configStatus'];
      tooltip?: string;
    } => {
      const registry = promptRefRegistryRef.current;
      if (registry) {
        const result = registry.resolve(rawKey);
        if (result.status === 'resolved') {
          pendingSkillsRef.current.delete(rawKey);
          return {
            tool: result.entry.meta,
            status: result.entry.meta.configStatus ?? 'noConfig',
            tooltip: result.entry.meta.tooltip
          };
        }
        if (result.status === 'ambiguous') {
          return {
            status: 'invalid',
            tooltip: ambiguousToolTip
          };
        }
      } else {
        const selectedTool = selectedSkillsRef.current.find((item) => item.id === rawKey);
        if (selectedTool) {
          pendingSkillsRef.current.delete(rawKey);
          return {
            tool: selectedTool,
            status: selectedTool.configStatus ?? 'noConfig',
            tooltip: selectedTool.tooltip
          };
        }
      }

      const pendingTool = pendingSkillsRef.current.get(rawKey);
      if (pendingTool) {
        return {
          tool: pendingTool,
          status: pendingTool.configStatus ?? 'noConfig',
          tooltip: pendingTool.tooltip
        };
      }

      return { status: 'invalid' };
    },
    [ambiguousToolTip, pendingSkillsRef]
  );

  useEffect(() => {
    selectedSkillsRef.current = selectedSkills;
    promptRefRegistryRef.current = promptRefRegistry;

    selectedSkills.forEach((skill) => {
      pendingSkillsRef.current.delete(skill.id);
    });
    promptRefRegistry?.entries().forEach((entry) => {
      pendingSkillsRef.current.delete(entry.canonicalKey);
    });
  }, [pendingSkillsRef, promptRefRegistry, selectedSkills]);

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
    const match = findAgentPromptRefEntityMatch(text);
    if (!match) return null;
    return { start: match.start, end: match.end };
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
      const { tool, status } = resolveSkillDisplay(id);

      if (!tool || status === 'invalid') {
        removeSkillNode(id, nodeKey);
        return;
      }

      onClickSkillRef.current(id, tool.source);
    },
    [removeSkillNode, resolveSkillDisplay]
  );

  // Register text entity transformer to convert {{@skillId@}} text into SkillNode
  useEffect(() => {
    const createSkillPlugin = (textNode: TextNode): SkillNode => {
      const textContent = textNode.getTextContent();
      const entityMatch = findAgentPromptRefEntityMatch(textContent);
      const skillId = entityMatch ? entityMatch.key : textContent.slice(3, -3);

      const { tool, status, tooltip } = resolveSkillDisplay(skillId);

      return $createSkillNode({
        id: skillId,
        rawText: textContent,
        name: tool?.name ?? skillId,
        icon: tool?.avatar,
        skillType: tool?.flowNodeType ?? FlowNodeTypeEnum.tool,
        status,
        tooltip,
        onClick: handleSkillClick
      });
    };

    const unregister = mergeRegister(
      ...registerLexicalTextEntity(editor, getSkillMatch, SkillNode, createSkillPlugin)
    );
    return unregister;
  }, [editor, getSkillMatch, handleSkillClick, resolveSkillDisplay]);

  // Update existing SkillNode properties when selectedSkills change
  // Sync tool name, avatar, status and configure handler for each skill node
  useEffect(() => {
    editor.update(() => {
      visitSkillNodes((node) => {
        const rawKey = node.getSkillKey();
        const { tool, status, tooltip } = resolveSkillDisplay(rawKey);
        const writableNode = node.getWritable();

        // 保留原始 rawKey，避免打开旧应用时改写正文产生无操作脏 Diff。
        if (tool) {
          writableNode.__name = tool.name;
          writableNode.__icon = tool.avatar;
          writableNode.__skillType = tool.flowNodeType;
          writableNode.__status = status;
          writableNode.__tooltip = tooltip;
          writableNode.__onClick = handleSkillClick;
        } else {
          writableNode.__name = rawKey;
          writableNode.__icon = undefined;
          writableNode.__skillType = FlowNodeTypeEnum.tool;
          writableNode.__status = 'invalid';
          writableNode.__tooltip = tooltip;
          writableNode.__onClick = handleSkillClick;
        }
      });
    });
  }, [
    selectedSkills,
    promptRefRegistry,
    editor,
    handleSkillClick,
    resolveSkillDisplay,
    visitSkillNodes
  ]);

  return null;
}

export default SkillLabelPlugin;
