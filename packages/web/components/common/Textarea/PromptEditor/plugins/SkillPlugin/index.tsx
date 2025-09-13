import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useCallback, useEffect } from 'react';
import { $createSkillNode, SkillNode } from './node';
import type { TextNode } from 'lexical';
import { getSkillRegexString } from './utils';
import { mergeRegister } from '@lexical/utils';
import { registerLexicalTextEntity } from '../../utils';
import type { EditorSkillPickerType } from '../SkillPickerPlugin/type';

const REGEX = new RegExp(getSkillRegexString(), 'i');

export default function SkillPlugin({
  skills = [],
  selectedTools = [],
  onConfigureTool,
  onRemoveToolFromEditor
}: {
  skills?: EditorSkillPickerType[];
  selectedTools?: any[];
  onConfigureTool?: (toolId: string) => void;
  onRemoveToolFromEditor?: (toolId: string) => void;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!editor.hasNodes([SkillNode]))
      throw new Error('SkillPlugin: SkillNode not registered on editor');
  }, [editor]);

  const createSkillPlugin = useCallback(
    (textNode: TextNode): SkillNode => {
      const textContent = textNode.getTextContent();
      const skillKey = textContent.slice(3, -3);

      if (selectedTools.length > 0) {
        const tool = selectedTools.find((t) => t.id === skillKey);
        if (tool) {
          const extendedTool = tool;
          const onConfigureClick =
            extendedTool.isUnconfigured && onConfigureTool
              ? () => onConfigureTool(skillKey)
              : undefined;
          return $createSkillNode(
            skillKey,
            tool.name,
            tool.avatar,
            extendedTool.isUnconfigured,
            onConfigureClick
          );
        }
      }

      return $createSkillNode(skillKey);
    },
    [skills, selectedTools, onConfigureTool]
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
    const unregister = mergeRegister(
      ...registerLexicalTextEntity(editor, getSkillMatch, SkillNode, createSkillPlugin)
    );
    return unregister;
  }, [createSkillPlugin, editor, getSkillMatch, selectedTools]);

  useEffect(() => {
    if (selectedTools.length === 0) return;

    editor.update(() => {
      const nodes = editor.getEditorState()._nodeMap;

      nodes.forEach((node) => {
        if (node instanceof SkillNode) {
          const skillKey = node.getSkillKey();
          const tool = selectedTools.find((t) => t.id === skillKey);

          if (tool) {
            const extendedTool = tool;
            if (
              !node.__skillName ||
              !node.__skillAvatar ||
              node.__isUnconfigured !== extendedTool.isUnconfigured
            ) {
              const writableNode = node.getWritable();
              writableNode.__skillName = tool.name;
              writableNode.__skillAvatar = tool.avatar;
              writableNode.__isUnconfigured = extendedTool.isUnconfigured;
              writableNode.__onConfigureClick =
                extendedTool.isUnconfigured && onConfigureTool
                  ? () => onConfigureTool(skillKey)
                  : undefined;
            }
          }
        }
      });
    });
  }, [selectedTools, editor]);

  useEffect(() => {
    if (!onRemoveToolFromEditor) return;

    const checkRemovedTools = () => {
      if (selectedTools.length === 0) return;

      const editorState = editor.getEditorState();
      const nodes = editorState._nodeMap;
      const skillKeysInEditor = new Set<string>();

      nodes.forEach((node) => {
        if (node instanceof SkillNode) {
          skillKeysInEditor.add(node.getSkillKey());
        }
      });

      // Check for removed tools
      selectedTools.forEach((tool) => {
        if (!skillKeysInEditor.has(tool.id)) {
          onRemoveToolFromEditor(tool.id);
        }
      });
    };

    const unregister = editor.registerUpdateListener(({ editorState }) => {
      setTimeout(checkRemovedTools, 50);
    });

    return unregister;
  }, [selectedTools, editor, onRemoveToolFromEditor]);

  return null;
}
