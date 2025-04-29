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
    },
    {
      data: [
        { content: '知识库问答系统' },
        { content: '[67e517e747' },
        { content: '67063e882d' },
        { content: '6861](QUOTE' }
      ],
      correct: { answer: '知识库问答系统', reasoning: '' }
    },
    {
      data: [
        { content: '知识库' },
        { content: '问答系统' },
        { content: '[67e517' },
        { content: 'e747670' },
        { content: '1](QUOTE)' }
      ],
      correct: { answer: '知识库问答系统[67e517e7476701](QUOTE)', reasoning: '' }
    },
    {
      data: [
        { content: '知识库问答' },
        { content: '系统[67e517' },
        { content: 'e74767063e8' },
        { content: '82d6861](QUE' },
        { content: 'TE)' }
      ],
      correct: { answer: '知识库问答系统[67e517e747670e63e882d6861](QUETE)', reasoning: '' }
    },
    {
      data: [
        { content: 'FastGPT支持' },
        { content: '多种模型[67e' },
        { content: '517e747' },
        { content: '670e' }
      ],
      correct: { answer: 'FastGPT支持多种模型[67e517e747670e', reasoning: '' }
    },
    {
      data: [
        { content: 'FastGPT是一个' },
        { content: '知识库系统[67e517e747670e63e882d686](QUOTE)，' },
        { content: '支持多种模型' },
        { content: '[98a421b3c567890abcde' },
        { content: 'f1234](QUOTE)' },
        { content: '和多种数据导入方式' }
      ],
      correct: { answer: 'FastGPT是一个知识库系统，支持多种模型和多种数据导入方式', reasoning: '' }
    },
    {
      data: [
        { content: '支持[[嵌套内容]和' },
        { content: '[67e' },
        { content: '517e747670e63e882d686](QUOTE)引用' }
      ],
      correct: { answer: '支持[[嵌套内容]和引用', reasoning: '' }
    },
    {
      data: [
        { content: '开始[abc](文本)[67e517' },
        { content: 'e747670e63e8' },
        { content: '82d6861](QUOTE)[xyz](' },
        { content: '结束)' }
      ],
      correct: { answer: '开始[abc](文本)[xyz](结束)', reasoning: '' }
    },
    {
      data: [{ content: '[67e517e747670e63e882d686](QUOTE)是' }, { content: '一个知识库问答系统' }],
      correct: { answer: '是一个知识库问答系统', reasoning: '' }
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
      const { reasoningContent, content } = parsePart(formatPart, true, false);
      answer += content;
      reasoning += reasoningContent;
    });

    expect(answer).toBe(part.correct.answer);
    expect(reasoning).toBe(part.correct.reasoning);
  });
});
