import { parseReasoningStreamContent } from './utils';
import { expect, test } from 'vitest';

test('Parse reasoning stream content test', async () => {
  const partList = [
    {
      data: [{ content: '你好1' }, { content: '你好2' }, { content: '你好3' }],
      correct: { answer: '你好1你好2你好3', reasoning: '' }
    },
    {
      data: [
        { reasoning_content: '这是' },
        { reasoning_content: '思考' },
        { reasoning_content: '过程' },
        { content: '你好1' },
        { content: '你好2' },
        { content: '你好3' }
      ],
      correct: { answer: '你好1你好2你好3', reasoning: '这是思考过程' }
    },
    {
      data: [
        { content: '<t' },
        { content: 'hink>' },
        { content: '这是' },
        { content: '思考' },
        { content: '过程' },
        { content: '</think>' },
        { content: '你好1' },
        { content: '你好2' },
        { content: '你好3' }
      ],
      correct: { answer: '你好1你好2你好3', reasoning: '这是思考过程' }
    },
    {
      data: [
        { content: '<think>' },
        { content: '这是' },
        { content: '思考' },
        { content: '过程' },
        { content: '</think>' },
        { content: '你好1' },
        { content: '你好2' },
        { content: '你好3' }
      ],
      correct: { answer: '你好1你好2你好3', reasoning: '这是思考过程' }
    },
    {
      data: [
        { content: '<think>这是' },
        { content: '思考' },
        { content: '过程' },
        { content: '</think>' },
        { content: '你好1' },
        { content: '你好2' },
        { content: '你好3' }
      ],
      correct: { answer: '你好1你好2你好3', reasoning: '这是思考过程' }
    },
    {
      data: [
        { content: '<think>这是' },
        { content: '思考' },
        { content: '过程</' },
        { content: 'think>' },
        { content: '你好1' },
        { content: '你好2' },
        { content: '你好3' }
      ],
      correct: { answer: '你好1你好2你好3', reasoning: '这是思考过程' }
    },
    {
      data: [
        { content: '<think>这是' },
        { content: '思考' },
        { content: '过程</think>' },
        { content: '你好1' },
        { content: '你好2' },
        { content: '你好3' }
      ],
      correct: { answer: '你好1你好2你好3', reasoning: '这是思考过程' }
    },
    {
      data: [
        { content: '<think>这是' },
        { content: '思考' },
        { content: '过程</think>你好1' },
        { content: '你好2' },
        { content: '你好3' }
      ],
      correct: { answer: '你好1你好2你好3', reasoning: '这是思考过程' }
    },
    {
      data: [
        { content: '<think>这是' },
        { content: '思考' },
        { content: '过程</th' },
        { content: '假的' },
        { content: '你好2' },
        { content: '你好3' },
        { content: '过程</think>你好1' },
        { content: '你好2' },
        { content: '你好3' }
      ],
      correct: { answer: '你好1你好2你好3', reasoning: '这是思考过程</th假的你好2你好3过程' }
    },
    {
      data: [
        { content: '<think>这是' },
        { content: '思考' },
        { content: '过程</th' },
        { content: '假的' },
        { content: '你好2' },
        { content: '你好3' }
      ],
      correct: { answer: '', reasoning: '这是思考过程</th假的你好2你好3' }
    }
  ];

  partList.forEach((part) => {
    const { parsePart } = parseReasoningStreamContent();

    let answer = '';
    let reasoning = '';
    part.data.forEach((item) => {
      const formatPart = {
        choices: [
          {
            delta: {
              role: 'assistant',
              content: item.content,
              reasoning_content: item.reasoning_content
            }
          }
        ]
      };
      const [reasoningContent, content] = parsePart(formatPart, true);
      answer += content;
      reasoning += reasoningContent;
    });

    expect(answer).toBe(part.correct.answer);
    expect(reasoning).toBe(part.correct.reasoning);
  });
});
