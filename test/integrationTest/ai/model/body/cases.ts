type ModelRequestBody = {
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  [key: string]: unknown;
};

export type ModelBodyCase = {
  name: string;
  body: ModelRequestBody;
  expectation:
    | { type: 'text' }
    | { type: 'json'; expectedObject?: Record<string, unknown> }
    | {
        type: 'toolCall';
        toolName: string;
        emptyArguments?: boolean;
        expectedArguments?: Record<string, unknown>;
      };
};

/**
 * OpenAI-compatible Chat Completions 请求体兼容矩阵。
 *
 * 每个 case 都应保持请求规模小且结果可预测，避免集成测试产生不必要的 Token 消耗。
 * 新增 FastGPT 会实际发送的特殊字段或工具 schema 时，应在这里追加独立 case。
 */
export const modelBodyCases: ModelBodyCase[] = [
  {
    name: 'basic text completion',
    body: {
      messages: [{ role: 'user', content: 'Reply with exactly: OK' }]
    },
    expectation: { type: 'text' }
  },
  {
    name: 'zero and boundary sampling values',
    body: {
      messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
      temperature: 0,
      top_p: 1,
      presence_penalty: 0,
      frequency_penalty: 0,
      n: 1,
      max_tokens: 32
    },
    expectation: { type: 'text' }
  },
  {
    name: 'tool without parameters',
    body: {
      messages: [{ role: 'user', content: 'Call health_check now.' }],
      tools: [
        {
          type: 'function',
          function: {
            name: 'health_check',
            description: 'Checks whether the service is healthy.'
          }
        }
      ],
      tool_choice: {
        type: 'function',
        function: { name: 'health_check' }
      }
    },
    expectation: {
      type: 'toolCall',
      toolName: 'health_check',
      emptyArguments: true
    }
  },
  {
    name: 'tool with special scalar values',
    body: {
      messages: [
        {
          role: 'user',
          content:
            'Call record_special_values with label "compatibility", count 0 and enabled false.'
        }
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'record_special_values',
            description: 'Records scalar values for a compatibility check.',
            parameters: {
              type: 'object',
              properties: {
                label: { type: 'string', enum: ['compatibility'] },
                count: { type: 'integer', enum: [0] },
                enabled: { type: 'boolean', enum: [false] }
              },
              required: ['label', 'count', 'enabled'],
              additionalProperties: false
            }
          }
        }
      ],
      tool_choice: {
        type: 'function',
        function: { name: 'record_special_values' }
      }
    },
    expectation: {
      type: 'toolCall',
      toolName: 'record_special_values',
      expectedArguments: {
        label: 'compatibility',
        count: 0,
        enabled: false
      }
    }
  },
  {
    name: 'multiple tools with one selected tool',
    body: {
      messages: [{ role: 'user', content: 'Use echo_text to echo "compatibility".' }],
      tools: [
        {
          type: 'function',
          function: {
            name: 'get_status',
            description: 'Returns the current service status.'
          }
        },
        {
          type: 'function',
          function: {
            name: 'echo_text',
            description: 'Echoes the provided text.',
            parameters: {
              type: 'object',
              properties: {
                text: { type: 'string' }
              },
              required: ['text'],
              additionalProperties: false
            }
          }
        }
      ],
      tool_choice: {
        type: 'function',
        function: { name: 'echo_text' }
      }
    },
    expectation: {
      type: 'toolCall',
      toolName: 'echo_text',
      expectedArguments: { text: 'compatibility' }
    }
  },
  {
    name: 'multi-turn conversation with system message',
    body: {
      messages: [
        { role: 'system', content: 'Answer briefly and follow the latest user instruction.' },
        { role: 'user', content: 'Remember the word alpha.' },
        { role: 'assistant', content: 'I will remember alpha.' },
        { role: 'user', content: 'Reply with exactly: alpha' }
      ],
      temperature: 0,
      max_tokens: 256
    },
    expectation: { type: 'text' }
  },
  {
    name: 'multiple stop sequences',
    body: {
      messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
      stop: ['<END>', '<STOP>'],
      temperature: 0,
      max_tokens: 32
    },
    expectation: { type: 'text' }
  },
  {
    name: 'JSON object response format',
    body: {
      messages: [
        {
          role: 'user',
          content: 'Return a JSON object whose only field is "status" with value "ok".'
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
      max_tokens: 64
    },
    expectation: {
      type: 'json',
      expectedObject: { status: 'ok' }
    }
  },
  {
    name: 'tools disabled by tool choice none',
    body: {
      messages: [{ role: 'user', content: 'Reply with exactly: OK. Do not call a tool.' }],
      tools: [
        {
          type: 'function',
          function: {
            name: 'get_status',
            description: 'Returns the current service status.'
          }
        }
      ],
      tool_choice: 'none',
      parallel_tool_calls: false,
      temperature: 0,
      max_tokens: 32
    },
    expectation: { type: 'text' }
  },
  {
    name: 'tool with nested array and nullable parameters',
    body: {
      messages: [
        {
          role: 'user',
          content:
            'Call save_records with records [{"id":"item-1","tags":["alpha"]}] and note null.'
        }
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'save_records',
            description: 'Saves structured records for a compatibility check.',
            parameters: {
              type: 'object',
              properties: {
                records: {
                  type: 'array',
                  minItems: 1,
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      tags: {
                        type: 'array',
                        items: { type: 'string' }
                      }
                    },
                    required: ['id', 'tags'],
                    additionalProperties: false
                  }
                },
                note: { type: ['string', 'null'] }
              },
              required: ['records', 'note'],
              additionalProperties: false
            }
          }
        }
      ],
      tool_choice: {
        type: 'function',
        function: { name: 'save_records' }
      }
    },
    expectation: {
      type: 'toolCall',
      toolName: 'save_records',
      expectedArguments: {
        records: [{ id: 'item-1', tags: ['alpha'] }],
        note: null
      }
    }
  }
];
