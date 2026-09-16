// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  createEditor,
  type ElementNode,
  type LexicalNode,
  type RangeSelection
} from 'lexical';
import { $moveCharacter, $shouldOverrideDefaultCharacterSelection } from '@lexical/selection';
import { mergeRegister } from '@lexical/utils';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { SkillLabelNodeBasicType } from '../../../../../components/common/Textarea/PromptEditor/plugins/SkillLabelPlugin/node';

// 节点文件只在 decorate() 里用到这些组件，测试不渲染 React，直接屏蔽掉 Chakra 依赖链。
vi.mock(
  '../../../../../components/common/Textarea/PromptEditor/plugins/VariablePlugin/components/Variable',
  () => ({ default: () => null })
);
vi.mock(
  '../../../../../components/common/Textarea/PromptEditor/plugins/VariableLabelPlugin/components/VariableLabel',
  () => ({ default: () => null })
);
vi.mock(
  '../../../../../components/common/Textarea/PromptEditor/plugins/SkillLabelPlugin/components/SkillLabel',
  () => ({ default: () => null })
);

import {
  VariableNode,
  $createVariableNode
} from '../../../../../components/common/Textarea/PromptEditor/plugins/VariablePlugin/node';
import {
  VariableLabelNode,
  $createVariableLabelNode
} from '../../../../../components/common/Textarea/PromptEditor/plugins/VariableLabelPlugin/node';
import {
  SkillNode,
  $createSkillNode
} from '../../../../../components/common/Textarea/PromptEditor/plugins/SkillLabelPlugin/node';
import { registerLexicalTextEntity } from '../../../../../components/common/Textarea/PromptEditor/utils';
import { getHashtagRegexString } from '../../../../../components/common/Textarea/PromptEditor/plugins/VariableLabelPlugin/utils';

const VARIABLE_LABEL_TOKEN = '{{$node.key$}}';

const createTestEditor = (namespace: string) =>
  createEditor({
    namespace,
    nodes: [VariableNode, VariableLabelNode, SkillNode],
    onError: (error: Error) => {
      throw error;
    }
  });

describe('PromptEditor 变量标签', () => {
  it('明文模式方向键跨过标签，不会退化成 NodeSelection', async () => {
    const editor = createTestEditor('promptEditor');

    await editor.update(() => {
      const paragraph = $createParagraphNode();
      const textBefore = $createTextNode('a');
      paragraph.append(
        textBefore,
        $createVariableLabelNode(VARIABLE_LABEL_TOKEN, 'node.key', ''),
        $createTextNode('b')
      );
      $getRoot().append(paragraph);
      // 光标停在标签前一个字符之后
      textBefore.select(1, 1);

      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error('expect RangeSelection before move');
      // @lexical/plain-text 的方向键 handler 就是这条判断加 $moveCharacter
      expect($shouldOverrideDefaultCharacterSelection(selection, false)).toBe(true);
      $moveCharacter(selection, false, false);

      const moved = $getSelection();
      // 修复前这里会变成 NodeSelection，明文模式没有逃逸分支，光标就卡死了
      expect($isRangeSelection(moved)).toBe(true);
      const range = moved as RangeSelection;
      expect(range.anchor.type).toBe('text');
      expect(range.anchor.getNode().getTextContent()).toBe('b');
      expect(range.anchor.offset).toBe(0);
    });
  });

  it('exportDOM 带上 token，粘贴到富文本时不会丢标签', async () => {
    const editor = createTestEditor('promptEditor');

    await editor.update(() => {
      const nodes = [
        $createVariableNode('{{key}}', 'label'),
        $createVariableLabelNode(VARIABLE_LABEL_TOKEN, 'node.key', ''),
        $createSkillNode({
          id: 'skillId',
          name: 'skill',
          skillType: FlowNodeTypeEnum.chatNode,
          status: 'noConfig' as SkillLabelNodeBasicType['status'],
          onClick: () => {}
        })
      ];

      nodes.forEach((node) => {
        const output = node.exportDOM() as { element: HTMLElement };
        expect(output.element.textContent).toBe(node.getTextContent());
      });
    });
  });

  it('粘贴侧能把 token 文本还原成标签节点', async () => {
    const editor = createTestEditor('richPromptEditor');
    const regex = new RegExp(getHashtagRegexString(), 'i');

    // 与 VariableLabelPlugin.getVariableMatch 保持一致
    const getMatch = (text: string) => {
      const matches = regex.exec(text);
      if (!matches) return null;
      return { start: matches.index, end: matches.index + matches[4].length + 6 };
    };

    const unregister = mergeRegister(
      ...registerLexicalTextEntity(editor, getMatch, VariableLabelNode, (textNode) =>
        $createVariableLabelNode(textNode.getTextContent(), 'node.key', '')
      )
    );

    try {
      await editor.update(() => {
        const paragraph = $createParagraphNode();
        // 模拟 importDOM 把 <span>{{...}}</span> 里的文本提上来的结果
        paragraph.append($createTextNode(VARIABLE_LABEL_TOKEN));
        $getRoot().append(paragraph);
      });

      editor.getEditorState().read(() => {
        const children: LexicalNode[] = $getRoot().getFirstChild<ElementNode>()!.getChildren();
        expect(children.some((child) => child instanceof VariableLabelNode)).toBe(true);
      });
    } finally {
      unregister();
    }
  });
});
