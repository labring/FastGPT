import {
  parsePromptToolCall,
  promptToolCallMessageRewrite
} from '@fastgpt/service/core/ai/llm/promptCall/index';
import type { ChatCompletionMessageParam, ChatCompletionTool } from '@fastgpt/global/core/ai/type';
import { describe, expect, it } from 'vitest';

describe('parsePromptToolCall function tests', () => {
  describe('Basic scenarios', () => {
    it('should return answer when input starts with 0:', () => {
      const input = '0: This is a regular response';
      const result = parsePromptToolCall(input);

      expect(result).toEqual({
        answer: 'This is a regular response'
      });
    });

    it('should return answer when input starts with 0：(Chinese colon)', () => {
      const input = '0：This is a regular response with Chinese colon';
      const result = parsePromptToolCall(input);

      expect(result).toEqual({
        answer: 'This is a regular response with Chinese colon'
      });
    });

    it('should return trimmed answer when input starts with 0: and has extra whitespace', () => {
      const input = '   0:    This is a response with whitespace   ';
      const result = parsePromptToolCall(input);

      expect(result).toEqual({
        answer: 'This is a response with whitespace'
      });
    });

    it('should handle 0: in the middle of string when within first 6 characters', () => {
      const input = 'Pre 0: This is the actual response';
      const result = parsePromptToolCall(input);

      expect(result).toEqual({
        answer: 'This is the actual response'
      });
    });

    it('should not process 0: when beyond first 6 characters', () => {
      const input = 'Long prefix 0: This should not be processed';
      const result = parsePromptToolCall(input);

      expect(result).toEqual({
        answer: 'Long prefix 0: This should not be processed'
      });
    });

    it('should return original string when no 0: prefix found and no tool call', () => {
      const input = 'This is just a regular string without any prefixes';
      const result = parsePromptToolCall(input);

      expect(result).toEqual({
        answer: 'This is just a regular string without any prefixes'
      });
    });

    it('should parse valid tool call with 1:', () => {
      const input = '1: {"name": "get_weather", "arguments": {"location": "Tokyo"}}';
      const result = parsePromptToolCall(input);

      expect(result.answer).toBe('');
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0].function.name).toBe('get_weather');
      expect(result.toolCalls![0].function.arguments).toBe('{"location":"Tokyo"}');
      expect(result.toolCalls![0].type).toBe('function');
      expect(result.toolCalls![0].id).toBeDefined();
      expect(typeof result.toolCalls![0].id).toBe('string');
    });

    it('should parse valid tool call with 1：(Chinese colon)', () => {
      const input = '1：{"name": "calculate", "arguments": {"expression": "2+2"}}';
      const result = parsePromptToolCall(input);

      expect(result.answer).toBe('');
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0].function.name).toBe('calculate');
      expect(result.toolCalls![0].function.arguments).toBe('{"expression":"2+2"}');
    });
  });

  describe('Tool call parsing', () => {
    it('should handle tool call with nested object arguments', () => {
      const input =
        '1: {"name": "complex_tool", "arguments": {"user": {"name": "John", "age": 30}, "settings": {"verbose": true}}}';
      const result = parsePromptToolCall(input);

      expect(result.answer).toBe('');
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0].function.name).toBe('complex_tool');
      expect(JSON.parse(result.toolCalls![0].function.arguments)).toEqual({
        user: { name: 'John', age: 30 },
        settings: { verbose: true }
      });
    });

    it('should handle tool call with array arguments', () => {
      const input =
        '1: {"name": "process_list", "arguments": {"items": [1, 2, 3], "options": ["sort", "filter"]}}';
      const result = parsePromptToolCall(input);

      expect(result.answer).toBe('');
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0].function.name).toBe('process_list');
      expect(JSON.parse(result.toolCalls![0].function.arguments)).toEqual({
        items: [1, 2, 3],
        options: ['sort', 'filter']
      });
    });

    it('should handle tool call with empty arguments', () => {
      const input = '1: {"name": "simple_tool", "arguments": {}}';
      const result = parsePromptToolCall(input);

      expect(result.answer).toBe('');
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0].function.name).toBe('simple_tool');
      expect(result.toolCalls![0].function.arguments).toBe('{}');
    });

    it('should handle tool call with extra content before and after JSON', () => {
      const input =
        'Some text 1: extra {"name": "test_tool", "arguments": {"param": "value"}} more text';
      const result = parsePromptToolCall(input);

      expect(result.answer).toBe('');
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0].function.name).toBe('test_tool');
      expect(result.toolCalls![0].function.arguments).toBe('{"param":"value"}');
    });
  });

  describe('Edge cases and error handling', () => {
    it('should return error message for malformed JSON with 1:', () => {
      const input = '1: {"name": "tool", "arguments": invalid json}';
      const result = parsePromptToolCall(input);

      expect(result.answer).toEqual(
        'Tool call error: 1: {"name": "tool", "arguments": invalid json}'
      );
      expect(result.streamAnswer).toEqual(
        'Tool call error: 1: {"name": "tool", "arguments": invalid json}'
      );
    });

    it('should return error message for incomplete JSON with 1:', () => {
      const input = '1: {"name": "tool"';
      const result = parsePromptToolCall(input);

      expect(result.answer).toEqual('Tool call error: 1: {"name": "tool"');
      expect(result.streamAnswer).toEqual('Tool call error: 1: {"name": "tool"');
    });

    it('should handle empty JSON object with 1: (creates tool call with undefined properties)', () => {
      const input = '1: {}';
      const result = parsePromptToolCall(input);

      // Empty object {} doesn't have name property, so it parses but creates invalid tool call
      expect(result.answer).toBe('');
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0].function.name).toBeUndefined();
    });

    it('should handle empty string input', () => {
      const input = '';
      const result = parsePromptToolCall(input);

      expect(result).toEqual({
        answer: ''
      });
    });

    it('should handle whitespace-only input', () => {
      const input = '   \n\t   ';
      const result = parsePromptToolCall(input);

      expect(result).toEqual({
        answer: ''
      });
    });

    it('should handle input with only prefix', () => {
      const input = '1:';
      const result = parsePromptToolCall(input);

      expect(result.answer).toEqual('Tool call error: 1:');
      expect(result.streamAnswer).toEqual('Tool call error: 1:');
    });

    it('should handle input with only prefix and whitespace', () => {
      const input = '1:   ';
      const result = parsePromptToolCall(input);

      expect(result.answer).toEqual('Tool call error: 1:');
      expect(result.streamAnswer).toEqual('Tool call error: 1:');
    });

    it('should handle JSON5 syntax in tool call', () => {
      const input = "1: {name: 'test_tool', arguments: {param: 'value', number: 42}}";
      const result = parsePromptToolCall(input);

      expect(result.answer).toBe('');
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0].function.name).toBe('test_tool');
      expect(JSON.parse(result.toolCalls![0].function.arguments)).toEqual({
        param: 'value',
        number: 42
      });
    });

    it('should handle tool call with simple strings (no escaping needed)', () => {
      const input =
        '1: {"name": "search", "arguments": {"query": "Hello world", "filter": "type:document"}}';
      const result = parsePromptToolCall(input);

      expect(result.answer).toBe('');
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0].function.name).toBe('search');
      expect(JSON.parse(result.toolCalls![0].function.arguments)).toEqual({
        query: 'Hello world',
        filter: 'type:document'
      });
    });

    it('should handle input with multiple 0: occurrences - does not process if first one is beyond position 5', () => {
      const input = 'First 0: Second part 0: Third part';
      const result = parsePromptToolCall(input);

      // The first '0:' is at position 6, which is > 5, so it's not processed
      expect(result).toEqual({
        answer: 'First 0: Second part 0: Third part'
      });
    });

    it('should handle input with multiple 1: occurrences - fails to parse when extra text interferes', () => {
      const input =
        'Text 1: {"name": "tool1", "arguments": {"param": "value"}} more text 1: {"name": "tool2", "arguments": {}}';
      const result = parsePromptToolCall(input);

      // The sliceJsonStr function can't properly extract JSON when there's extra text after
      expect(result.answer).toEqual(
        'Tool call error: Text 1: {"name": "tool1", "arguments": {"param": "value"}} more text 1: {"name": "tool2", "arguments": {}}'
      );
      expect(result.streamAnswer).toEqual(
        'Tool call error: Text 1: {"name": "tool1", "arguments": {"param": "value"}} more text 1: {"name": "tool2", "arguments": {}}'
      );
    });

    it('should handle tool name with underscores and numbers', () => {
      const input = '1: {"name": "get_user_data_v2", "arguments": {"user_id": 123}}';
      const result = parsePromptToolCall(input);

      expect(result.answer).toBe('');
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0].function.name).toBe('get_user_data_v2');
      expect(JSON.parse(result.toolCalls![0].function.arguments)).toEqual({
        user_id: 123
      });
    });

    it('should handle very long strings', () => {
      const longString = 'A'.repeat(10000);
      const input = `0: ${longString}`;
      const result = parsePromptToolCall(input);

      expect(result).toEqual({
        answer: longString
      });
    });

    it('should handle Unicode characters in tool arguments', () => {
      const input =
        '1: {"name": "translate", "arguments": {"text": "你好世界", "from": "zh", "to": "en"}}';
      const result = parsePromptToolCall(input);

      expect(result.answer).toBe('');
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0].function.name).toBe('translate');
      expect(JSON.parse(result.toolCalls![0].function.arguments)).toEqual({
        text: '你好世界',
        from: 'zh',
        to: 'en'
      });
    });

    it('should handle mixed Chinese and English colons', () => {
      const input1 = '0: Answer with English colon';
      const input2 = '0：Answer with Chinese colon';
      const input3 = '1: {"name": "tool", "arguments": {"key": "value"}}';
      const input4 = '1：{"name": "tool", "arguments": {"key": "value"}}';

      const result1 = parsePromptToolCall(input1);
      const result2 = parsePromptToolCall(input2);
      const result3 = parsePromptToolCall(input3);
      const result4 = parsePromptToolCall(input4);

      expect(result1.answer).toBe('Answer with English colon');
      expect(result2.answer).toBe('Answer with Chinese colon');
      expect(result3.toolCalls).toHaveLength(1);
      expect(result4.toolCalls).toHaveLength(1);
    });
  });

  describe('Boundary conditions', () => {
    it('should handle input with only numbers', () => {
      const input = '12345';
      const result = parsePromptToolCall(input);

      expect(result).toEqual({
        answer: '12345'
      });
    });

    it('should handle tool call with null arguments', () => {
      const input = '1: {"name": "null_test", "arguments": null}';
      const result = parsePromptToolCall(input);

      expect(result.answer).toBe('');
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0].function.name).toBe('null_test');
      expect(result.toolCalls![0].function.arguments).toBe('null');
    });

    it('should handle tool call with boolean and number values', () => {
      const input =
        '1: {"name": "mixed_types", "arguments": {"flag": true, "count": 0, "ratio": 3.14}}';
      const result = parsePromptToolCall(input);

      expect(result.answer).toBe('');
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0].function.name).toBe('mixed_types');
      expect(JSON.parse(result.toolCalls![0].function.arguments)).toEqual({
        flag: true,
        count: 0,
        ratio: 3.14
      });
    });

    it('should handle newlines in input - 0: beyond position limit', () => {
      const input = 'Line 1\n0: Line 2\nLine 3';
      const result = parsePromptToolCall(input);

      // The '0:' appears after position 6, so it's not processed
      expect(result).toEqual({
        answer: 'Line 1\n0: Line 2\nLine 3'
      });
    });

    it('should handle tabs and special whitespace', () => {
      const input = '\t0:\tThis\thas\ttabs\t';
      const result = parsePromptToolCall(input);

      expect(result).toEqual({
        answer: 'This\thas\ttabs'
      });
    });

    it('should not process 0: when it appears after position 5', () => {
      const input = 'Longer prefix 0: This should not be processed';
      const result = parsePromptToolCall(input);

      expect(result).toEqual({
        answer: 'Longer prefix 0: This should not be processed'
      });
    });

    it('should handle 0: at exactly position 5', () => {
      const input = '12345 0: Should not be processed';
      const result = parsePromptToolCall(input);

      expect(result).toEqual({
        answer: '12345 0: Should not be processed'
      });
    });

    it('should handle Chinese colon priority (only when English colon not found)', () => {
      const input = '0：Chinese colon without English';
      const result = parsePromptToolCall(input);

      expect(result).toEqual({
        answer: 'Chinese colon without English'
      });
    });

    it('should prioritize English colon over Chinese colon - but not when beyond position limit', () => {
      const input = '0： Chinese 0: English colon';
      const result = parsePromptToolCall(input);

      // The English '0:' is at position 11, beyond the limit, so returns original string
      expect(result).toEqual({
        answer: '0： Chinese 0: English colon'
      });
    });

    it('should handle valid 0: within newline constraints', () => {
      const input = '0: Line with proper prefix';
      const result = parsePromptToolCall(input);

      expect(result).toEqual({
        answer: 'Line with proper prefix'
      });
    });

    it('should handle simple 1: tool call that works', () => {
      const input = '1: {"name": "tool1", "arguments": {"param": "value"}}';
      const result = parsePromptToolCall(input);

      expect(result.answer).toBe('');
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0].function.name).toBe('tool1');
      expect(JSON.parse(result.toolCalls![0].function.arguments)).toEqual({
        param: 'value'
      });
    });
  });
});

describe('promptToolCallMessageRewrite function tests', () => {
  describe('System message handling', () => {
    it('should add system message when none exists', () => {
      const messages: ChatCompletionMessageParam[] = [{ role: 'user', content: 'Hello' }];
      const tools: ChatCompletionTool[] = [
        {
          type: 'function',
          function: {
            name: 'get_weather',
            description: 'Get weather info',
            parameters: { type: 'object', properties: {} }
          }
        }
      ];

      const result = promptToolCallMessageRewrite(messages, tools);

      expect(result).toHaveLength(2);
      expect(result[0].role).toBe('system');
      expect(result[0].content).toContain('你是一个智能机器人');
      expect(result[0].content).toContain('get_weather');
      expect(result[1]).toEqual({ role: 'user', content: 'Hello' });
    });

    it('should update existing string system message', () => {
      const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'Hello' }
      ];
      const tools: ChatCompletionTool[] = [
        {
          type: 'function',
          function: {
            name: 'calculator',
            description: 'Calculate math',
            parameters: { type: 'object', properties: {} }
          }
        }
      ];

      const result = promptToolCallMessageRewrite(messages, tools);

      expect(result).toHaveLength(2);
      expect(result[0].role).toBe('system');
      expect(result[0].content).toContain('You are helpful');
      expect(result[0].content).toContain('你是一个智能机器人');
      expect(result[0].content).toContain('calculator');
    });

    it('should update existing array system message', () => {
      const messages: ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content: [{ type: 'text', text: 'You are helpful' }]
        },
        { role: 'user', content: 'Hello' }
      ];
      const tools: ChatCompletionTool[] = [
        {
          type: 'function',
          function: {
            name: 'search',
            description: 'Search tool',
            parameters: { type: 'object', properties: {} }
          }
        }
      ];

      const result = promptToolCallMessageRewrite(messages, tools);

      expect(result).toHaveLength(2);
      expect(result[0].role).toBe('system');
      expect(Array.isArray(result[0].content)).toBe(true);
      const content = result[0].content as Array<any>;
      expect(content).toHaveLength(2);
      expect(content[0]).toEqual({ type: 'text', text: 'You are helpful' });
      expect(content[1].type).toBe('text');
      expect(content[1].text).toContain('你是一个智能机器人');
      expect(content[1].text).toContain('search');
    });

    it('should throw error for invalid system message content', () => {
      const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: null as any },
        { role: 'user', content: 'Hello' }
      ];
      const tools: ChatCompletionTool[] = [
        {
          type: 'function',
          function: {
            name: 'test_tool',
            description: 'Test',
            parameters: { type: 'object', properties: {} }
          }
        }
      ];

      expect(() => promptToolCallMessageRewrite(messages, tools)).toThrow(
        'Prompt call invalid input'
      );
    });

    it('should handle multiple tools in system message', () => {
      const messages: ChatCompletionMessageParam[] = [{ role: 'user', content: 'Hello' }];
      const tools: ChatCompletionTool[] = [
        {
          type: 'function',
          function: {
            name: 'tool1',
            description: 'First tool',
            parameters: { type: 'object', properties: { param1: { type: 'string' } } }
          }
        },
        {
          type: 'function',
          function: {
            name: 'tool2',
            description: 'Second tool',
            parameters: { type: 'object', properties: { param2: { type: 'number' } } }
          }
        }
      ];

      const result = promptToolCallMessageRewrite(messages, tools);

      expect(result[0].content).toContain('tool1');
      expect(result[0].content).toContain('tool2');
      expect(result[0].content).toContain('First tool');
      expect(result[0].content).toContain('Second tool');
    });
  });

  describe('Assistant message rewriting', () => {
    it('should rewrite assistant message with string content', () => {
      const messages: ChatCompletionMessageParam[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' }
      ];
      const tools: ChatCompletionTool[] = [];

      const result = promptToolCallMessageRewrite(messages, tools);

      expect(result[2].role).toBe('assistant');
      expect(result[2].content).toBe('0: Hi there!');
    });

    it('should rewrite assistant message with tool calls', () => {
      const messages: ChatCompletionMessageParam[] = [
        { role: 'user', content: 'What is the weather?' },
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'call_123',
              type: 'function',
              function: {
                name: 'get_weather',
                arguments: '{"location": "Tokyo"}'
              }
            }
          ]
        }
      ];
      const tools: ChatCompletionTool[] = [];

      const result = promptToolCallMessageRewrite(messages, tools);

      expect(result[2].role).toBe('assistant');
      expect(result[2].content).toBe(
        '1: {"name":"get_weather","arguments":"{\\"location\\": \\"Tokyo\\"}"}'
      );
      expect(result[2]).not.toHaveProperty('tool_calls');
    });

    it('should skip assistant message with no content and no tool calls', () => {
      const messages: ChatCompletionMessageParam[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: null }
      ];
      const tools: ChatCompletionTool[] = [];

      const result = promptToolCallMessageRewrite(messages, tools);

      expect(result[2].role).toBe('assistant');
      expect(result[2].content).toBeNull();
    });

    it('should handle assistant message with multiple tool calls (only first one used)', () => {
      const messages: ChatCompletionMessageParam[] = [
        { role: 'user', content: 'Hello' },
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: { name: 'tool1', arguments: '{"param": "value1"}' }
            },
            {
              id: 'call_2',
              type: 'function',
              function: { name: 'tool2', arguments: '{"param": "value2"}' }
            }
          ]
        }
      ];
      const tools: ChatCompletionTool[] = [];

      const result = promptToolCallMessageRewrite(messages, tools);

      expect(result[2].content).toBe(
        '1: {"name":"tool1","arguments":"{\\"param\\": \\"value1\\"}"}'
      );
      expect(result[2]).not.toHaveProperty('tool_calls');
    });
  });

  describe('Tool message rewriting', () => {
    it('should convert tool message to user message', () => {
      const messages: ChatCompletionMessageParam[] = [
        { role: 'user', content: 'What is the weather?' },
        {
          role: 'tool',
          tool_call_id: 'call_123',
          content: 'The weather is sunny'
        }
      ];
      const tools: ChatCompletionTool[] = [];

      const result = promptToolCallMessageRewrite(messages, tools);

      expect(result[2].role).toBe('user');
      expect(result[2].content).toBe('<ToolResponse>\nThe weather is sunny\n</ToolResponse>');
      expect(result[2]).not.toHaveProperty('tool_call_id');
    });

    it('should handle multiple tool messages', () => {
      const messages: ChatCompletionMessageParam[] = [
        { role: 'user', content: 'Hello' },
        {
          role: 'tool',
          tool_call_id: 'call_1',
          content: 'Result 1'
        },
        {
          role: 'tool',
          tool_call_id: 'call_2',
          content: 'Result 2'
        }
      ];
      const tools: ChatCompletionTool[] = [];

      const result = promptToolCallMessageRewrite(messages, tools);

      expect(result[2].role).toBe('user');
      expect(result[2].content).toBe('<ToolResponse>\nResult 1\n</ToolResponse>');
      expect(result[3].role).toBe('user');
      expect(result[3].content).toBe('<ToolResponse>\nResult 2\n</ToolResponse>');
    });

    it('should handle tool message with complex content', () => {
      const messages: ChatCompletionMessageParam[] = [
        { role: 'user', content: 'Test' },
        {
          role: 'tool',
          tool_call_id: 'call_123',
          content: JSON.stringify({ result: 'success', data: [1, 2, 3] })
        }
      ];
      const tools: ChatCompletionTool[] = [];

      const result = promptToolCallMessageRewrite(messages, tools);

      expect(result[2].role).toBe('user');
      expect(result[2].content).toBe(
        '<ToolResponse>\n{"result":"success","data":[1,2,3]}\n</ToolResponse>'
      );
    });
  });

  describe('Message immutability', () => {
    it('should not mutate original messages', () => {
      const originalMessages: ChatCompletionMessageParam[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
        {
          role: 'tool',
          tool_call_id: 'call_123',
          content: 'Tool result'
        }
      ];
      const tools: ChatCompletionTool[] = [
        {
          type: 'function',
          function: {
            name: 'test_tool',
            description: 'Test',
            parameters: { type: 'object', properties: {} }
          }
        }
      ];

      const originalMessagesCopy = JSON.parse(JSON.stringify(originalMessages));
      promptToolCallMessageRewrite(originalMessages, tools);

      expect(originalMessages).toEqual(originalMessagesCopy);
    });

    it('should handle deeply nested message content without mutation', () => {
      const originalMessages: ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content: [{ type: 'text', text: 'Original system message' }]
        },
        { role: 'user', content: 'Hello' }
      ];
      const tools: ChatCompletionTool[] = [
        {
          type: 'function',
          function: {
            name: 'test_tool',
            description: 'Test',
            parameters: { type: 'object', properties: {} }
          }
        }
      ];

      const originalMessagesCopy = JSON.parse(JSON.stringify(originalMessages));
      promptToolCallMessageRewrite(originalMessages, tools);

      expect(originalMessages).toEqual(originalMessagesCopy);
    });
  });

  describe('Complex conversation flows', () => {
    it('should handle complete conversation with all message types', () => {
      const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'What is the weather in Tokyo?' },
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'call_123',
              type: 'function',
              function: {
                name: 'get_weather',
                arguments: '{"location": "Tokyo"}'
              }
            }
          ]
        },
        {
          role: 'tool',
          tool_call_id: 'call_123',
          content: 'The weather in Tokyo is sunny, 25°C'
        },
        { role: 'assistant', content: 'The weather in Tokyo is sunny with a temperature of 25°C.' }
      ];
      const tools: ChatCompletionTool[] = [
        {
          type: 'function',
          function: {
            name: 'get_weather',
            description: 'Get current weather',
            parameters: {
              type: 'object',
              properties: {
                location: { type: 'string', description: 'City name' }
              },
              required: ['location']
            }
          }
        }
      ];

      const result = promptToolCallMessageRewrite(messages, tools);

      expect(result).toHaveLength(5);

      // System message should be updated
      expect(result[0].role).toBe('system');
      expect(result[0].content).toContain('You are helpful');
      expect(result[0].content).toContain('get_weather');

      // User message unchanged
      expect(result[1]).toEqual({ role: 'user', content: 'What is the weather in Tokyo?' });

      // Assistant with tool call should be rewritten
      expect(result[2].role).toBe('assistant');
      expect(result[2].content).toBe(
        '1: {"name":"get_weather","arguments":"{\\"location\\": \\"Tokyo\\"}"}'
      );
      expect(result[2]).not.toHaveProperty('tool_calls');

      // Tool message should become user message
      expect(result[3].role).toBe('user');
      expect(result[3].content).toBe(
        '<ToolResponse>\nThe weather in Tokyo is sunny, 25°C\n</ToolResponse>'
      );

      // Final assistant message should be prefixed
      expect(result[4].role).toBe('assistant');
      expect(result[4].content).toBe(
        '0: The weather in Tokyo is sunny with a temperature of 25°C.'
      );
    });

    it('should handle empty messages array', () => {
      const messages: ChatCompletionMessageParam[] = [];
      const tools: ChatCompletionTool[] = [
        {
          type: 'function',
          function: {
            name: 'test_tool',
            description: 'Test',
            parameters: { type: 'object', properties: {} }
          }
        }
      ];

      const result = promptToolCallMessageRewrite(messages, tools);

      expect(result).toHaveLength(1);
      expect(result[0].role).toBe('system');
      expect(result[0].content).toContain('你是一个智能机器人');
      expect(result[0].content).toContain('test_tool');
    });

    it('should handle empty tools array', () => {
      const messages: ChatCompletionMessageParam[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' }
      ];
      const tools: ChatCompletionTool[] = [];

      const result = promptToolCallMessageRewrite(messages, tools);

      expect(result).toHaveLength(3);
      expect(result[0].role).toBe('system');
      expect(result[0].content).toContain('你是一个智能机器人');
      expect(result[0].content).toContain('[]'); // Empty tools array in JSON
      expect(result[2].content).toBe('0: Hi there!');
    });
  });

  describe('Edge cases', () => {
    it('should handle assistant message with empty string content', () => {
      const messages: ChatCompletionMessageParam[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: '' }
      ];
      const tools: ChatCompletionTool[] = [];

      const result = promptToolCallMessageRewrite(messages, tools);

      expect(result[2].role).toBe('assistant');
      expect(result[2].content).toBe(''); // Empty string is falsy, so not processed
    });

    it('should handle tool message with empty content', () => {
      const messages: ChatCompletionMessageParam[] = [
        { role: 'user', content: 'Hello' },
        {
          role: 'tool',
          tool_call_id: 'call_123',
          content: ''
        }
      ];
      const tools: ChatCompletionTool[] = [];

      const result = promptToolCallMessageRewrite(messages, tools);

      expect(result[2].role).toBe('user');
      expect(result[2].content).toBe('<ToolResponse>\n\n</ToolResponse>');
    });

    it('should handle mixed message types in sequence', () => {
      const messages: ChatCompletionMessageParam[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi!' },
        { role: 'user', content: 'How are you?' },
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: { name: 'check_status', arguments: '{}' }
            }
          ]
        },
        {
          role: 'tool',
          tool_call_id: 'call_1',
          content: 'Status: OK'
        }
      ];
      const tools: ChatCompletionTool[] = [];

      const result = promptToolCallMessageRewrite(messages, tools);

      expect(result).toHaveLength(6); // system + 5 original
      expect(result[1]).toEqual({ role: 'user', content: 'Hello' });
      expect(result[2].content).toBe('0: Hi!');
      expect(result[3]).toEqual({ role: 'user', content: 'How are you?' });
      expect(result[4].content).toBe('1: {"name":"check_status","arguments":"{}"}');
      expect(result[5].content).toBe('<ToolResponse>\nStatus: OK\n</ToolResponse>');
    });
  });
});
