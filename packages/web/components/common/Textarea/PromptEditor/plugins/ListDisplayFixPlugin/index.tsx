import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useEffect } from 'react';

export default function ListDisplayFixPlugin(): JSX.Element | null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const fixListDisplay = () => {
      const rootElement = editor.getRootElement();
      if (!rootElement) return;

      const allListItems = rootElement.querySelectorAll('li');

      allListItems.forEach((li) => {
        const htmlLi = li as HTMLLIElement;

        // Check if this li only contains a sublist without direct text content
        const hasDirectText = Array.from(htmlLi.childNodes).some((node) => {
          return node.nodeType === Node.TEXT_NODE && node.textContent?.trim();
        });

        const hasSpan = htmlLi.querySelector(':scope > span');
        const hasOnlySublist =
          htmlLi.children.length === 1 &&
          (htmlLi.children[0].tagName === 'UL' || htmlLi.children[0].tagName === 'OL');

        // If this li only contains a sublist without text content, hide its marker
        if (!hasDirectText && !hasSpan && hasOnlySublist) {
          // Only hide the marker, don't adjust position, let CSS handle indentation
          htmlLi.style.listStyle = 'none';
          htmlLi.style.paddingLeft = '0';
          htmlLi.style.marginLeft = '0';

          // Keep normal indentation for sublists
          const sublist = htmlLi.children[0] as HTMLElement;
          sublist.style.marginTop = '0';
          sublist.style.marginBottom = '0';
          // Don't modify marginLeft and paddingLeft, let CSS handle it
        } else {
          htmlLi.style.listStyle = '';
          htmlLi.style.paddingLeft = '';
          htmlLi.style.marginLeft = '';

          if (
            htmlLi.children[0] &&
            (htmlLi.children[0].tagName === 'UL' || htmlLi.children[0].tagName === 'OL')
          ) {
            const sublist = htmlLi.children[0] as HTMLElement;
            sublist.style.marginTop = '';
            sublist.style.marginBottom = '';
          }
        }
      });
    };

    const removeListener = editor.registerUpdateListener(() => {
      setTimeout(fixListDisplay, 10);
    });

    setTimeout(fixListDisplay, 10);

    return removeListener;
  }, [editor]);

  return null;
}
