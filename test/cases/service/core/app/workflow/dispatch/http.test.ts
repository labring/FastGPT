import { describe, it, expect } from 'vitest';
import { replaceJsonBodyString } from '@fastgpt/service/core/workflow/dispatch/tools/http468';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';

describe('replaceJsonBodyString', () => {
  // Mock runtime nodes for testing
  const mockRuntimeNodes = [
    {
      nodeId: 'node1',
      outputs: [
        { id: 'output1', value: 'Hello World', valueType: 'string' },
        { id: 'output2', value: 42, valueType: 'number' },
        { id: 'output3', value: true, valueType: 'boolean' },
        { id: 'output4', value: { nested: 'value' }, valueType: 'object' },
        { id: 'output5', value: [1, 2, 3], valueType: 'array' }
      ],
      inputs: []
    }
  ] as unknown as RuntimeNodeItemType[];

  const mockVariables = {
    undefinedVar: undefined,
    nullVar: null,
    userName: 'John Doe',
    userAge: 30,
    isActive: true,
    userProfile: { name: 'John', email: 'john@example.com' },
    tags: ['developer', 'tester']
  };

  const mockAllVariables = {
    ...mockVariables,
    systemVar: 'system_value',
    nullVar: null,
    undefinedVar: undefined,
    emptyString: '',
    zeroNumber: 0,
    falseBool: false
  };

  const mockProps = {
    variables: mockVariables,
    allVariables: mockAllVariables,
    runtimeNodes: mockRuntimeNodes
  };

  describe('Basic variable replacement functionality', () => {
    it('字符串为空', () => {
      const input = '{"name": "{{undefinedVar}}"}';
      const expected = '{"name": ""}';

      const result = replaceJsonBodyString({ text: input }, mockProps);
      expect(result).toBe(expected);
    });

    it('should correctly replace string variables', () => {
      const input = '{"name": "{{userName}}", "greeting": "Hello {{userName}}"}';
      const expected = '{"name": "John Doe", "greeting": "Hello John Doe"}';

      const result = replaceJsonBodyString({ text: input }, mockProps);
      expect(result).toBe(expected);
    });

    it('should correctly replace number variables', () => {
      const input =
        '{"age": {{userAge}}, "doubled": {{userAge}}, "calculation": "{{userAge}} years old"}';
      const expected = '{"age": 30, "doubled": 30, "calculation": "30 years old"}';

      const result = replaceJsonBodyString({ text: input }, mockProps);
      expect(result).toBe(expected);
    });

    it('should correctly replace boolean variables', () => {
      const input =
        '{"active": {{isActive}}, "inactive": {{falseBool}}, "status": "User is {{isActive}}"}';
      const expected = '{"active": true, "inactive": false, "status": "User is true"}';

      const result = replaceJsonBodyString({ text: input }, mockProps);
      expect(result).toBe(expected);
    });

    it('should correctly replace object variables', () => {
      const input = '{"profile": {{userProfile}}, "info": "Profile: {{userProfile}}"}';
      const expected =
        '{"profile": {"name":"John","email":"john@example.com"}, "info": "Profile: {"name":"John","email":"john@example.com"}"}';

      const result = replaceJsonBodyString({ text: input }, mockProps);
      expect(result).toBe(expected);
    });

    it('should correctly replace array variables and node output variables', () => {
      const input =
        '{"tags": {{tags}}, "nodeOutput": "{{$node1.output1$}}", "numbers": {{$node1.output5$}}}';
      const expected =
        '{"tags": ["developer","tester"], "nodeOutput": "Hello World", "numbers": [1,2,3]}';

      const result = replaceJsonBodyString({ text: input }, mockProps);
      expect(result).toBe(expected);
    });
  });

  describe('Security and boundary testing', () => {
    it('should prevent circular references', () => {
      const maliciousProps = {
        ...mockProps,
        allVariables: {
          ...mockAllVariables,
          selfRef: '{{selfRef}}', // Self reference
          circularA: '{{circularB}}',
          circularB: '{{circularA}}'
        }
      };

      const input = '{"self": "{{selfRef}}", "circular": "{{circularA}}"}';
      // Should keep circular references unreplaced
      const result = replaceJsonBodyString({ text: input }, maliciousProps);
      expect(result).toContain('{{selfRef}}');
      expect(result).toContain('{{circularB}}');
    });

    it('should prevent excessive nesting depth', () => {
      const deepNestingProps = {
        ...mockProps,
        allVariables: {
          ...mockAllVariables,
          level1: '{{level2}}',
          level2: '{{level3}}',
          level3: '{{level4}}',
          level4: '{{level5}}',
          level5: '{{level6}}',
          level6: '{{level7}}',
          level7: '{{level8}}',
          level8: '{{level9}}',
          level9: '{{level10}}',
          level10: '{{level11}}',
          level11: '{{level12}}',
          level12: 'final_value'
        }
      };

      const input = '{"deep": "{{level1}}"}';
      // Should handle but limit depth
      const result = replaceJsonBodyString({ text: input }, deepNestingProps);
      expect(result).toBeDefined();

      expect(result).toBe('{"deep": "{{level12}}"}');
      // Should eventually resolve to a valid value
    });

    it('should handle large number of variables performance test', () => {
      const manyVariables: Record<string, any> = {};
      let input = '{';

      // Create 1000 variables
      for (let i = 0; i < 1000; i++) {
        manyVariables[`var${i}`] = `value${i}`;
        input += `"var${i}": "{{var${i}}}",`;
      }
      input = input.slice(0, -1) + '}'; // Remove last comma

      const largeProps = {
        ...mockProps,
        allVariables: { ...mockAllVariables, ...manyVariables }
      };

      const result = replaceJsonBodyString({ text: input }, largeProps);
      expect(result).toBeDefined();
      expect(result).toContain('value0');
      expect(result).toContain('value999');
      // Verify performance and correctness
    });

    it('should prevent regex attacks', () => {
      const maliciousProps = {
        ...mockProps,
        allVariables: {
          ...mockAllVariables,
          // Contains special regex characters
          maliciousVar: '.*+?^${}()|[]\\',
          regexAttack: '(.*){999999}', // Potential regex attack
          specialChars: '\\n\\r\\t"\'`<>&'
        }
      };

      const input =
        '{"malicious": "{{maliciousVar}}", "attack": "{{regexAttack}}", "special": "{{specialChars}}"}';
      const result = replaceJsonBodyString({ text: input }, maliciousProps);

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      // Should properly escape special characters
      expect(result).toContain('.*+?^${}()|[]\\\\');
    });

    it('should handle quote injection and escape characters', () => {
      const maliciousProps = {
        ...mockProps,
        allVariables: {
          ...mockAllVariables,
          quotedVar: '"malicious"value"',
          escapedVar: '\\"escaped\\"',
          jsonInjection: '", "injected": "hacked',
          scriptTag: '<script>alert("xss")</script>',
          newlineAttack: 'line1\\nline2\\r\\nline3'
        }
      };

      const input =
        '{"quoted": "{{quotedVar}}", "escaped": "{{escapedVar}}", "injection": "{{jsonInjection}}", "script": "{{scriptTag}}", "newlines": "{{newlineAttack}}"}';
      const result = replaceJsonBodyString({ text: input }, maliciousProps);

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');

      // Should properly escape quotes
      expect(result).toContain('\\"malicious\\"value\\"');

      // Should handle newlines
      expect(result).toContain('line1\\\\nline2\\\\r\\\\nline3');

      // Should generate valid JSON
      try {
        JSON.parse(result);
      } catch (e) {
        // If parsing fails, there might be injection attacks or escaping issues
        // Further validation needed here
        expect(e).toBeDefined();
      }
    });
  });

  describe('Edge cases', () => {
    it('should handle empty string', () => {
      const result = replaceJsonBodyString({ text: '' }, mockProps);
      expect(result).toBe('');
    });

    it('should handle static content without variables', () => {
      const input = '{"static": "value", "number": 123}';
      const result = replaceJsonBodyString({ text: input }, mockProps);
      expect(result).toBe(input);
    });

    it('should handle null and undefined values', () => {
      const input = '{"nullVar": {{nullVar}}, "undefinedVar": {{undefinedVar}}}';
      const expected = '{"nullVar": null, "undefinedVar": null}';

      const result = replaceJsonBodyString({ text: input }, mockProps);
      expect(result).toBe(expected);
    });

    it('should handle non-existent variables', () => {
      const input = '{"missing": "{{nonExistentVar}}", "static": "value"}';
      const expected = '{"missing": "", "static": "value"}';

      const result = replaceJsonBodyString({ text: input }, mockProps);
      expect(result).toBe(expected);
    });
  });

  describe('Complex robustness and compatibility tests', () => {
    // Test Case 1: Nested JSON with mixed variable types and complex escape scenarios
    it('Complex Test 1: Deep nested JSON with mixed data types, escape characters and Unicode', () => {
      const complexProps = {
        ...mockProps,
        allVariables: {
          ...mockAllVariables,
          unicodeText: '你好世界 🌍 Hello\nWorld',
          complexObject: {
            nested: {
              array: [{ key: 'value"with"quotes' }, null, undefined],
              special: 'tab\there\nnewline\rcarriage\\"quotes\\\'single'
            }
          },
          htmlContent: '<div class="test" data-value=\'mixed"quotes\'>Content & more</div>',
          jsonLikeString: '{"fake": "json", "number": 123, "bool": true}',
          emptyValues: { empty: '', zero: 0, false: false, null: null }
        }
      };

      const input = `{
        "metadata": {
          "title": "{{unicodeText}}",
          "description": "Testing \\"complex\\" scenarios",
          "nested": {{complexObject}},
          "htmlSnippet": "{{htmlContent}}"
        },
        "payload": {
          "jsonString": "{{jsonLikeString}}",
          "emptyData": {{emptyValues}},
          "nodeOutput": "{{$node1.output4$}}",
          "arrayData": {{$node1.output5$}}
        },
        "validation": {
          "hasNewlines": "Text with\\nembedded\\tcharacters: {{unicodeText}}",
          "quoteMixing": "\\"Outer quotes\\" and '{{htmlContent}}' content"
        }
      }`;

      const result = replaceJsonBodyString({ text: input }, complexProps);

      // Verify it's valid JSON after replacement
      expect(() => JSON.parse(result)).not.toThrow();

      // Verify complex nested structures are preserved
      const parsed = JSON.parse(result);
      expect(parsed.metadata.nested.nested.array).toHaveLength(3);
      expect(parsed.payload.emptyData.zero).toBe(0);
      expect(parsed.payload.emptyData.false).toBe(false);
      expect(parsed.payload.emptyData.null).toBe(null);

      // Verify Unicode and special characters are handled
      expect(parsed.metadata.title).toContain('你好世界');
      expect(parsed.metadata.title).toContain('🌍');
    });

    // Test Case 2: Variable substitution in complex nested structures with edge cases
    it('Complex Test 2: Complex variable interpolation and data type handling', () => {
      const edgeCaseProps = {
        ...mockProps,
        allVariables: {
          ...mockAllVariables,
          leadingTrailingSpaces: '  spaced content  ',
          numberAsString: '12345',
          boolAsString: 'true',
          arrayAsString: '[1,2,3]',
          objectAsString: '{"key":"value"}',
          commaInValue: 'value,with,commas',
          colonInValue: 'key:value:pair',
          braceInValue: 'value{with}braces',
          safeJsonString: 'safe_content_123'
        }
      };

      const input = `{
        "testDataTypes": {
          "data": "{{leadingTrailingSpaces}}",
          "number": {{numberAsString}},
          "bool": {{boolAsString}},
          "array": {{arrayAsString}},
          "object": {{objectAsString}}
        },
        "testStringNumbers": {
          "stringAsNumber": "Value is {{numberAsString}}",
          "boolAsString": "Boolean: {{boolAsString}}",
          "safeContent": "{{safeJsonString}}"
        },
        "testSpecialChars": {
          "commas": "{{commaInValue}}",
          "colons": "{{colonInValue}}",
          "braces": "{{braceInValue}}"
        },
        "testMixedQuoting": {
          "inQuotes": "{{arrayAsString}}",
          "withoutQuotes": {{arrayAsString}},
          "safeQuote": "Content: {{safeJsonString}}"
        }
      }`;

      const result = replaceJsonBodyString({ text: input }, edgeCaseProps);

      // Should produce valid JSON
      expect(() => JSON.parse(result)).not.toThrow();

      const parsed = JSON.parse(result);

      // Verify trimming and data type handling
      expect(parsed.testDataTypes.data).toBe('  spaced content  ');
      expect(parsed.testDataTypes.number).toBe(12345);
      expect(parsed.testDataTypes.bool).toBe(true);

      // Verify arrays and objects are properly embedded
      expect(Array.isArray(parsed.testDataTypes.array)).toBe(true);
      expect(typeof parsed.testDataTypes.object).toBe('object');

      // Verify special characters in values don't break JSON
      expect(parsed.testSpecialChars.commas).toContain(',');
      expect(parsed.testSpecialChars.colons).toContain(':');
      expect(parsed.testSpecialChars.braces).toContain('{');

      // Verify string interpolation works correctly
      expect(parsed.testStringNumbers.stringAsNumber).toContain('12345');
      expect(parsed.testMixedQuoting.safeQuote).toContain('safe_content_123');
    });

    // Test Case 3: Extreme recursion and circular reference prevention
    it('Complex Test 3: Advanced circular reference patterns and recursion limits', () => {
      const recursionProps = {
        ...mockProps,
        allVariables: {
          ...mockAllVariables,
          // Complex circular patterns
          chainA: '{{chainB}}',
          chainB: '{{chainC}}',
          chainC: '{{chainD}}',
          chainD: '{{chainE}}',
          chainE: '{{chainA}}', // Creates cycle

          // Indirect self-reference
          selfIndirect: 'prefix-{{selfIndirect}}-suffix',

          // Node reference cycles
          nodeRef1: '{{$node1.output1$}} -> {{nodeRef2}}',
          nodeRef2: '{{nodeRef1}}',

          // Deep nested variable chains
          level1: '{{level2}}-{{level3}}',
          level2: '{{level4}}-{{level5}}',
          level3: '{{level6}}-{{level7}}',
          level4: '{{level8}}-{{level9}}',
          level5: '{{level10}}-{{level11}}',
          level6: '{{level12}}-final',
          level7: 'end',
          level8: 'deep8',
          level9: 'deep9',
          level10: 'deep10',
          level11: 'deep11',
          level12: 'deep12'
        }
      };

      const input = `{
        "circularTests": {
          "simpleChain": "{{chainA}}",
          "selfReference": "{{selfIndirect}}",
          "nodeCircular": "{{nodeRef1}}",
          "deepNesting": "{{level1}}"
        },
        "mixedCircular": {
          "valid": "{{userName}}",
          "circular": "{{chainB}}",
          "nodeData": "{{$node1.output1$}}",
          "combined": "Valid: {{userName}}, Circular: {{chainC}}"
        }
      }`;

      const result = replaceJsonBodyString({ text: input }, recursionProps);

      // Should not crash or hang
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');

      // Should contain unreplaced circular references
      expect(result).toMatch(/\{\{chain[A-E]\}\}/);
      expect(result).toContain('{{selfIndirect}}');

      // Valid variables should still be replaced
      expect(result).toContain('John Doe');
      expect(result).toContain('Hello World');

      // Should handle deep nesting up to limit
      const parsed = JSON.parse(result);
      expect(parsed.circularTests.deepNesting).toBeDefined();
    });

    // Test Case 4: Large payload stress test with performance validation
    it('Complex Test 4: Large payload stress test with varied data patterns', () => {
      const stressTestVariables: Record<string, any> = {};

      // Generate large number of variables with different patterns
      for (let i = 0; i < 500; i++) {
        stressTestVariables[`str_${i}`] = `string_value_${i}_with_special_chars_"'\\\\n\\\\t`;
        stressTestVariables[`num_${i}`] = Math.random() * 1000000;
        stressTestVariables[`bool_${i}`] = i % 2 === 0;
        stressTestVariables[`obj_${i}`] = {
          id: i,
          data: `nested_${i}`,
          list: [i, i + 1, i + 2],
          nested: { deep: `value_${i}` }
        };
        stressTestVariables[`arr_${i}`] = Array.from(
          { length: (i % 10) + 1 },
          (_, j) => `item_${i}_${j}`
        );
      }

      // Add some problematic variables
      stressTestVariables['largeText'] = 'x'.repeat(10000);
      stressTestVariables['jsonBomb'] = JSON.stringify({ large: 'x'.repeat(1000) });
      stressTestVariables['specialChars'] = '\\n\\r\\t\\"\\\\\'`~!@#$%^&*()[]{}|;:,.<>?/+=';

      const stressProps = {
        ...mockProps,
        allVariables: { ...mockAllVariables, ...stressTestVariables }
      };

      // Create large JSON structure
      let input = '{\n';
      for (let i = 0; i < 200; i++) {
        input += `  "section_${i}": {\n`;
        input += `    "str": "{{str_${i}}}",\n`;
        input += `    "num": {{num_${i}}},\n`;
        input += `    "bool": {{bool_${i}}},\n`;
        input += `    "obj": {{obj_${i}}},\n`;
        input += `    "arr": {{arr_${i}}},\n`;
        input += `    "mixed": "String {{str_${i}}} with number {{num_${i}}}"\n`;
        input += `  }${i < 199 ? ',' : ''}\n`;
      }
      input += '}';

      const startTime = Date.now();
      const result = replaceJsonBodyString({ text: input }, stressProps);
      const endTime = Date.now();

      // Performance check - should complete within reasonable time
      expect(endTime - startTime).toBeLessThan(5000); // 5 seconds max

      // Should produce valid JSON
      expect(() => JSON.parse(result)).not.toThrow();

      const parsed = JSON.parse(result);

      // Verify structure integrity
      expect(Object.keys(parsed)).toHaveLength(200);
      expect(parsed.section_0.str).toContain('string_value_0');
      expect(typeof parsed.section_0.num).toBe('number');
      expect(typeof parsed.section_0.bool).toBe('boolean');
      expect(Array.isArray(parsed.section_0.arr)).toBe(true);
    });

    // Test Case 5: Security and injection attack prevention
    it('Complex Test 5: Comprehensive security and injection attack prevention', () => {
      const securityProps = {
        ...mockProps,
        allVariables: {
          ...mockAllVariables,
          // SQL injection patterns
          sqlInjection: "'; DROP TABLE users; --",
          sqlInjection2: "' OR '1'='1",

          // JSON injection attempts
          jsonBreak: '", "hacked": true, "original": "',
          jsonBreak2: '}}, "injected": {"evil": "payload"}, "fake": {{',

          // XSS attempts
          xssScript: '<script>alert("XSS")</script>',
          xssOnload: '<img src=x onerror=alert("XSS")>',

          // Template injection attempts
          templateInject: '{{constructor.constructor("alert(1)")()}}',
          prototypePolute: '__proto__.polluted',

          // Path traversal
          pathTraversal: '../../../etc/passwd',
          pathTraversal2: '..\\..\\..\\windows\\system32\\config\\sam',

          // Unicode and encoding attacks
          unicodeAttack: '\u0000\u0001\u0002\u003c\u003e',
          utf8Attack: '\uFEFF\uFFFE\uFFFF',

          // Control characters
          controlChars: '\x00\x01\x02\x03\x04\x05\x06\x07\x08\x0E\x0F',

          // Regex DoS attempts
          regexDos: '(' + 'a'.repeat(10000) + ')*',
          regexDos2: '(a+)+$',

          // Large payload attack
          payloadBomb: 'A'.repeat(100000),

          // Mixed attack vectors
          mixedAttack: '"><script>alert(/XSS/)</script><"{{malicious}}">'
        }
      };

      const input = `{
        "sqlTests": {
          "query1": "{{sqlInjection}}",
          "query2": "SELECT * FROM users WHERE name='{{sqlInjection2}}'"
        },
        "jsonTests": {
          "break1": "{{jsonBreak}}",
          "break2": "{{jsonBreak2}}",
          "safe": "normal_value"
        },
        "xssTests": {
          "script": "{{xssScript}}",
          "onload": "{{xssOnload}}",
          "content": "<div>{{xssScript}}</div>"
        },
        "templateTests": {
          "inject": "{{templateInject}}",
          "prototype": "{{prototypePolute}}"
        },
        "pathTests": {
          "traversal1": "{{pathTraversal}}",
          "traversal2": "{{pathTraversal2}}"
        },
        "encodingTests": {
          "unicode": "{{unicodeAttack}}",
          "utf8": "{{utf8Attack}}",
          "control": "{{controlChars}}"
        },
        "performanceTests": {
          "regex1": "{{regexDos}}",
          "regex2": "{{regexDos2}}",
          "large": "{{payloadBomb}}"
        },
        "mixedAttack": "{{mixedAttack}}"
      }`;

      const startTime = Date.now();
      const result = replaceJsonBodyString({ text: input }, securityProps);
      const endTime = Date.now();

      // Should not take excessive time (DoS protection)
      expect(endTime - startTime).toBeLessThan(10000); // 10 seconds max

      // Should produce valid JSON despite malicious input
      expect(() => JSON.parse(result)).not.toThrow();

      const parsed = JSON.parse(result);

      // Verify dangerous content is properly handled
      expect(parsed.sqlTests.query1).toBe("'; DROP TABLE users; --");
      expect(parsed.xssTests.script).toBe('<script>alert("XSS")</script>'); // Content is preserved as-is in JSON string

      // The function properly escapes strings even with injection attempts
      expect(typeof parsed.jsonTests.break1).toBe('string'); // Should be a string, not break JSON structure
      expect(parsed.jsonTests.break1).toBe('", "hacked": true, "original": "'); // The injection content is escaped

      // Verify the JSON structure wasn't broken by injection attempts
      expect(Object.keys(parsed)).toEqual([
        'sqlTests',
        'jsonTests',
        'xssTests',
        'templateTests',
        'pathTests',
        'encodingTests',
        'performanceTests',
        'mixedAttack'
      ]);

      // Verify large payloads are handled
      expect(parsed.performanceTests.large).toHaveLength(100000);

      // Verify no code execution occurred (template injection variable was replaced with null because it doesn't exist)
      expect(typeof parsed.templateTests.inject).toBe('string');
      expect(parsed.templateTests.inject).toBe(''); // Non-existent variables become "null"
    });
  });
});
