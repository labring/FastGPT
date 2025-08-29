import type { LexicalEditor } from 'lexical';

export function editorStateToText(editor: LexicalEditor) {
  const editorStateTextString: string[] = [];
  const paragraphs = editor.getEditorState().toJSON().root.children;

  paragraphs.forEach((paragraph: any) => {
    const children = paragraph.children || [];
    const paragraphText: string[] = [];

    children.forEach((child: any) => {
      if (child.type === 'linebreak') {
        paragraphText.push('\n');
      } else if (child.text) {
        paragraphText.push(child.text);
      } else if (child.type === 'variableLabel') {
        paragraphText.push(child.variableKey);
      } else if (child.type === 'Variable') {
        paragraphText.push(child.variableKey);
      }
    });

    editorStateTextString.push(paragraphText.join(''));
  });

  return editorStateTextString.join('\n');
}
