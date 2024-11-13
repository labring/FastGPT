import { useScreen } from '@fastgpt/web/hooks/useScreen';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { useCallback, useEffect, useRef, useState } from 'react';

export const useMarkdownWidth = () => {
  const Ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(400);
  const { screenWidth } = useScreen();
  const { isPc } = useSystem();

  const findMarkdownDom = useCallback(() => {
    if (!Ref.current) return;

    // 一直找到 parent = markdown 的元素
    let parent = Ref.current?.parentElement;
    while (parent && !parent.className.includes('chat-box-card')) {
      parent = parent.parentElement;
    }

    const ChatItemDom = parent?.parentElement;
    const clientWidth = ChatItemDom?.clientWidth ? ChatItemDom.clientWidth - (isPc ? 90 : 60) : 500;
    setWidth(clientWidth);
    return parent?.parentElement;
  }, [isPc]);

  useEffect(() => {
    findMarkdownDom();
  }, [findMarkdownDom, screenWidth, Ref.current]);

  return {
    Ref,
    width
  };
};
