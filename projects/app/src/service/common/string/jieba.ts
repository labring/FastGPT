import { cut } from '@node-rs/jieba';
import { stopWords } from '@fastgpt/global/common/string/jieba';

export function jiebaSplit({ text }: { text: string }) {
  const tokens = cut(text, true);

  return (
    tokens
      .map((item) => item.replace(/[\u3000-\u303f\uff00-\uffef]/g, '').trim())
      .filter((item) => item && !stopWords.has(item))
      .join(' ') || ''
  );
}
