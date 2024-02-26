import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $createParagraphNode, $createTextNode, RootNode } from 'lexical';
import { useEffect } from 'react';

const newlinesRegex = /[\n\r]/g;

export function SingleLinePlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerNodeTransform(RootNode, (rootNode: RootNode) => {
      const textContent = rootNode.getTextContent();

      if (newlinesRegex.test(textContent)) {
        const newText = textContent.replace(newlinesRegex, '');
        const paragraph = $createParagraphNode();
        paragraph.append($createTextNode(newText));
        rootNode.clear().append(paragraph);
        rootNode.selectEnd();
      }
    });
  }, [editor]);

  return null;
}
