import type { CompletionFinishReason } from '@fastgpt/global/core/ai/type';
import { parseLLMStreamResponse } from '@fastgpt/service/core/ai/utils';
import { describe, expect, it } from 'vitest';

describe('Parse reasoning stream content test', async () => {
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

  // Remove think
  partList.forEach((part, index) => {
    it(`Reasoning test:${index}`, () => {
      const { parsePart } = parseLLMStreamResponse();

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
        const { reasoningContent, content } = parsePart({
          part: formatPart,
          parseThinkTag: true,
          retainDatasetCite: false
        });
        answer += content;
        reasoning += reasoningContent;
      });
      expect(answer).toBe(part.correct.answer);
      expect(reasoning).toBe(part.correct.reasoning);
    });
  });
});

describe('Parse dataset cite content test', async () => {
  const partList = [
    {
      // 完整的
      data: [
        { content: '知识库' },
        { content: '问答系统' },
        { content: '[67e517e74767063e882d6861](CITE)' }
      ],
      correct: {
        content: '知识库问答系统[67e517e74767063e882d6861](CITE)',
        responseContent: '知识库问答系统'
      }
    },
    {
      // 只要 objectId
      data: [
        { content: '知识库' },
        { content: '问答系统' },
        { content: '[67e517e747' },
        { content: '67063e882d' },
        { content: '6861]' }
      ],
      correct: {
        content: '知识库问答系统[67e517e74767063e882d6861]',
        responseContent: '知识库问答系统'
      }
    },
    {
      // 满足替换条件的
      data: [
        { content: '知识库' },
        { content: '问答系统' },
        { content: '[67e517e747' },
        { content: '67063e882d' },
        { content: '6861](' }
      ],
      correct: {
        content: '知识库问答系统[67e517e74767063e882d6861](',
        responseContent: '知识库问答系统'
      }
    },
    {
      // 满足替换条件的
      data: [
        { content: '知识库' },
        { content: '问答系统' },
        { content: '[67e517e747' },
        { content: '67063e882d' },
        { content: '6861](C' }
      ],
      correct: {
        content: '知识库问答系统[67e517e74767063e882d6861](C',
        responseContent: '知识库问答系统'
      }
    },
    {
      // 满足替换条件的
      data: [
        { content: '知识库' },
        { content: '问答系统' },
        { content: '[67e517e747' },
        { content: '67063e882d' },
        { content: '6861](CI' }
      ],
      correct: {
        content: '知识库问答系统[67e517e74767063e882d6861](CI',
        responseContent: '知识库问答系统'
      }
    },
    {
      // 满足替换条件的
      data: [
        { content: '知识库' },
        { content: '问答系统' },
        { content: '[67e517e747' },
        { content: '67063e882d' },
        { content: '6861](CIT' }
      ],
      correct: {
        content: '知识库问答系统[67e517e74767063e882d6861](CIT',
        responseContent: '知识库问答系统'
      }
    },
    {
      // 满足替换条件的
      data: [
        { content: '知识库' },
        { content: '问答系统' },
        { content: '[67e517e747' },
        { content: '67063e882d' },
        { content: '6861](CITE' }
      ],
      correct: {
        content: '知识库问答系统[67e517e74767063e882d6861](CITE',
        responseContent: '知识库问答系统'
      }
    },
    {
      // 缺失结尾
      data: [
        { content: '知识库问答系统' },
        { content: '[67e517e747' },
        { content: '67063e882d' },
        { content: '6861](CITE' }
      ],
      correct: {
        content: '知识库问答系统[67e517e74767063e882d6861](CITE',
        responseContent: '知识库问答系统'
      }
    },
    {
      // ObjectId 不正确
      data: [
        { content: '知识库问答系统' },
        { content: '[67e517e747' },
        { content: '67882d' },
        { content: '6861](CITE)' }
      ],
      correct: {
        content: '知识库问答系统[67e517e74767882d6861](CITE)',
        responseContent: '知识库问答系统[67e517e74767882d6861](CITE)'
      }
    },
    {
      // 其他链接
      data: [{ content: '知识库' }, { content: '问答系统' }, { content: '[](https://fastgpt.cn)' }],
      correct: {
        content: '知识库问答系统[](https://fastgpt.cn)',
        responseContent: '知识库问答系统[](https://fastgpt.cn)'
      }
    },
    {
      // 不完整的其他链接
      data: [{ content: '知识库' }, { content: '问答系统' }, { content: '[](https://fastgp' }],
      correct: {
        content: '知识库问答系统[](https://fastgp',
        responseContent: '知识库问答系统[](https://fastgp'
      }
    },
    {
      // 开头
      data: [{ content: '[知识库' }, { content: '问答系统' }, { content: '[](https://fastgp' }],
      correct: {
        content: '[知识库问答系统[](https://fastgp',
        responseContent: '[知识库问答系统[](https://fastgp'
      }
    },
    {
      // 结尾
      data: [{ content: '知识库' }, { content: '问答系统' }, { content: '[' }],
      correct: {
        content: '知识库问答系统[',
        responseContent: '知识库问答系统['
      }
    },
    {
      // 中间
      data: [
        { content: '知识库' },
        { content: '问答系统' },
        { content: '[' },
        { content: '问答系统]' }
      ],
      correct: {
        content: '知识库问答系统[问答系统]',
        responseContent: '知识库问答系统[问答系统]'
      }
    },
    {
      // 双链接
      data: [
        { content: '知识库' },
        { content: '问答系统' },
        { content: '[](https://fastgpt.cn)' },
        { content: '[67e517e747' },
        { content: '67063e882d' },
        { content: '6861](CITE)' }
      ],
      correct: {
        content: '知识库问答系统[](https://fastgpt.cn)[67e517e74767063e882d6861](CITE)',
        responseContent: '知识库问答系统[](https://fastgpt.cn)'
      }
    },
    {
      // 双链接缺失部分
      data: [
        { content: '知识库' },
        { content: '问答系统' },
        { content: '[](https://fastgpt.cn)' },
        { content: '[67e517e747' },
        { content: '67063e882d' },
        { content: '6861](CIT' }
      ],
      correct: {
        content: '知识库问答系统[](https://fastgpt.cn)[67e517e74767063e882d6861](CIT',
        responseContent: '知识库问答系统[](https://fastgpt.cn)'
      }
    },
    {
      // 双Cite
      data: [
        { content: '知识库' },
        { content: '问答系统' },
        { content: '[67e517e747' },
        { content: '67063e882d' },
        { content: '6861](CITE)' },
        { content: '[67e517e747' },
        { content: '67063e882d' },
        { content: '6861](CITE)' }
      ],
      correct: {
        content: '知识库问答系统[67e517e74767063e882d6861](CITE)[67e517e74767063e882d6861](CITE)',
        responseContent: '知识库问答系统'
      }
    },
    {
      // 双Cite-第一个假Cite
      data: [
        { content: '知识库' },
        { content: '问答系统' },
        { content: '[67e517e747' },
        { content: '6861](CITE)' },
        { content: '[67e517e747' },
        { content: '67063e882d' },
        { content: '6861](CITE)' }
      ],
      correct: {
        content: '知识库问答系统[67e517e7476861](CITE)[67e517e74767063e882d6861](CITE)',
        responseContent: '知识库问答系统[67e517e7476861](CITE)'
      }
    },
    {
      // [id](CITE)
      data: [
        { content: '知识库' },
        { content: '问答系统' },
        { content: '[i' },
        { content: 'd](CITE)' },
        { content: '[67e517e747' },
        { content: '67063e882d' },
        { content: '6861](CITE)' }
      ],
      correct: {
        content: '知识库问答系统[id](CITE)[67e517e74767063e882d6861](CITE)',
        responseContent: '知识库问答系统'
      }
    },
    {
      // [id](CITE)
      data: [
        { content: '知识库' },
        { content: '问答系统' },
        { content: '[i' },
        { content: 'd](CITE)' }
      ],
      correct: {
        content: '知识库问答系统[id](CITE)',
        responseContent: '知识库问答系统'
      }
    }
  ];

  partList.forEach((part, index) => {
    it(`Dataset cite test: ${index}`, () => {
      const { parsePart } = parseLLMStreamResponse();

      let answer = '';
      let responseContent = '';
      const list = [...part.data, { content: '' }];
      list.forEach((item, index) => {
        const formatPart = {
          choices: [
            {
              delta: {
                role: 'assistant',
                content: item.content,
                reasoning_content: ''
              },
              finish_reason: (index === list.length - 2 ? 'stop' : null) as CompletionFinishReason
            }
          ]
        };
        const { content, responseContent: newResponseContent } = parsePart({
          part: formatPart,
          parseThinkTag: false,
          retainDatasetCite: false
        });
        answer += content;
        responseContent += newResponseContent;
      });

      expect(answer).toEqual(part.correct.content);
      expect(responseContent).toEqual(part.correct.responseContent);
    });
  });
});
