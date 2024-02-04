import { cut } from '@node-rs/jieba';
import { stopWords } from '@fastgpt/global/common/string/jieba';

export function jiebaSplit({ text }: { text: string }) {
  const tokens = cut(text, true);

  return (
    tokens
      .map((item) => item.replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s]/g, '').trim())
      .filter((item) => item && !stopWords.has(item))
      .join(' ') || ''
  );
}
