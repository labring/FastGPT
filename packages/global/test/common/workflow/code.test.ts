import { extractCodeOutputDefinitions } from '@fastgpt/global/common/workflow/code';
import { describe, expect, it } from 'vitest';

describe('extractCodeOutputDefinitions', () => {
  it('extracts JavaScript shorthand and nested values without splitting their commas', () => {
    expect(
      extractCodeOutputDefinitions(`
        function main() {
          const plan = [{ title: 'a,b' }];
          return { plan, result: JSON.stringify({ plan, ok: true }) };
        }
      `)
    ).toEqual([
      { key: 'plan', valueType: undefined },
      { key: 'result', valueType: undefined }
    ]);
  });

  it('extracts static Python dictionary keys and ignores dictionary expansion', () => {
    expect(
      extractCodeOutputDefinitions(`
        def main():
          # return {"ignored": True}
          return {"items": [1, 2], 'result': {"ok": True}, **extra}
      `)
    ).toEqual([
      { key: 'items', valueType: undefined },
      { key: 'result', valueType: undefined }
    ]);
  });

  it('keeps actual keys when documentation uses translated names', () => {
    expect(
      extractCodeOutputDefinitions(`
        /**
         * @property {arrayString} 题目计划 - 业务说明
         * @property {string} 返回文本 - 业务说明
         */
        function main() { return { plan: [], result: '' }; }
      `)
    ).toEqual([
      { key: 'plan', valueType: 'arrayString' },
      { key: 'result', valueType: 'string' }
    ]);
  });

  it('matches types by key before falling back to declaration order', () => {
    expect(
      extractCodeOutputDefinitions(`
        /** @property {string} result - Text */
        /** @property {number} count - Count */
        function main() { return { count: 2, result: 'ok' }; }
      `)
    ).toEqual([
      { key: 'count', valueType: 'number' },
      { key: 'result', valueType: 'string' }
    ]);
  });

  it('does not guess types when unmatched documentation has a different output count', () => {
    expect(
      extractCodeOutputDefinitions(`
        /** @property {number} 旧名称 - Old name */
        function main() { return { count: 2, result: 'ok' }; }
      `)
    ).toEqual([
      { key: 'count', valueType: undefined },
      { key: 'result', valueType: undefined }
    ]);
  });

  it('ignores comments, strings, regular expressions and non-static properties', () => {
    expect(
      extractCodeOutputDefinitions(String.raw`
        // return { ignored: true }
        /* return { alsoIgnored: true } */
        const text = "return { hidden: true }";
        const regex = /[{}\[\],]/g;
        function main() { return { visible: 'a\'b', ...extra, [name]: 2 }; }
      `)
    ).toEqual([{ key: 'visible', valueType: undefined }]);
  });

  it('supports parenthesized returns, Unicode keys and quoted property names', () => {
    expect(
      extractCodeOutputDefinitions(`function main() { return ({ 结果: 1, 'result-text': 'ok' }); }`)
    ).toEqual([
      { key: '结果', valueType: undefined },
      { key: 'result-text', valueType: undefined }
    ]);
  });

  it('deduplicates keys from multiple return branches', () => {
    expect(
      extractCodeOutputDefinitions(
        `function main() { if (ok) return { result: 1 }; return { result: 2 }; }`
      )
    ).toEqual([{ key: 'result', valueType: undefined }]);
  });

  it.each([
    'function main() { return { /* Output */ result: 1, // Details\n detail: {} }; }',
    'def main():\n    return { # Output\n "result": 1, # Details\n "detail": {} }'
  ])('keeps static keys preceded by property comments: %s', (code) => {
    expect(extractCodeOutputDefinitions(code)).toEqual([
      { key: 'result', valueType: undefined },
      { key: 'detail', valueType: undefined }
    ]);
  });

  it('rejects unsupported documented value types', () => {
    expect(
      extractCodeOutputDefinitions(
        `/** @property {integer} count */ function main() { return { count: 1 }; }`
      )
    ).toEqual([{ key: 'count', valueType: undefined }]);
  });

  it('distinguishes an empty static object from an unrecognized return expression', () => {
    expect(extractCodeOutputDefinitions('function main() { return {}; }')).toEqual([]);
    expect(extractCodeOutputDefinitions('function main() { return getResult(); }')).toBeUndefined();
  });

  it.each([
    '',
    'function main() { return { result: 1;',
    '/* return { result: 1 }',
    'const text = "return { result: 1 }',
    'const regex = /return { result: 1 }',
    'function main() { const returnValue = { result: 1 }; }'
  ])('handles incomplete or non-return code without inventing outputs: %s', (code) => {
    expect(extractCodeOutputDefinitions(code)).toBeUndefined();
  });
});
