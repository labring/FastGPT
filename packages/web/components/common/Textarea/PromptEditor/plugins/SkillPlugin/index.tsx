import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useCallback, useEffect } from 'react';
import { $createSkillNode, SkillNode } from './node';
import type { TextNode } from 'lexical';
import { getSkillRegexString } from './utils';
import { mergeRegister } from '@lexical/utils';
import { registerLexicalTextEntity } from '../../utils';
import type { EditorSkillPickerType } from '../SkillPickerPlugin';

const REGEX = new RegExp(getSkillRegexString(), 'i');

export default function SkillPlugin({ skills = [] }: { skills?: EditorSkillPickerType[] }) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!editor.hasNodes([SkillNode]))
      throw new Error('SkillPlugin: SkillNode not registered on editor');
  }, [editor]);

  const createSkillPlugin = useCallback(
    (textNode: TextNode): SkillNode => {
      // 从 {{@skillKey@}} 中提取 skillKey
      const skillKey = textNode.getTextContent().slice(3, -3); // 去掉 {{@ 和 @}}

      // 从 skills 数据中查找对应的工具信息
      let skillName: string | undefined;
      let skillAvatar: string | undefined;

      for (const skill of skills) {
        if (skill.toolCategories) {
          for (const category of skill.toolCategories) {
            const tool = category.list.find((item) => item.key === skillKey);
            if (tool) {
              skillName = tool.name;
              skillAvatar = tool.avatar;
              break;
            }
          }
        }
        if (skillName) break;
      }

      return $createSkillNode(skillKey, skillName, skillAvatar);
    },
    [skills]
  );

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

  useEffect(() => {
    mergeRegister(
      ...registerLexicalTextEntity(editor, getSkillMatch, SkillNode, createSkillPlugin)
    );
  }, [createSkillPlugin, editor, getSkillMatch]);

  return null;
}
