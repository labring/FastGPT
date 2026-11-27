import { SandboxCodeTypeEnum } from '@fastgpt/global/core/workflow/template/system/sandbox/constants';
import {
  extractCodeInputDefinitions,
  extractCodeOutputDefinitions,
  extractReturnedObjectKeys,
  isCodeMismatchedWithType
} from '../../src/code/io';
import { describe, expect, it } from 'vitest';

describe('code IO parser', () => {
  it('does not borrow a different field type when the named annotation is unsupported', () => {
    const code = `
      /**
       * @param {custom} payload - Incoming payload
       * @param {number} count - Count
       * @property {custom} result - Result payload
       * @property {number} total - Total
       */
      function main({ count, payload }) {
        return { total: count, result: payload };
      }
    `;

    expect(extractCodeInputDefinitions(code)).toEqual([
      { key: 'count', valueType: 'number' },
      { key: 'payload', valueType: undefined }
    ]);
    expect(extractCodeOutputDefinitions(code)).toEqual([
      { key: 'total', valueType: 'number' },
      { key: 'result', valueType: undefined }
    ]);
  });

  it('keeps static inputs and outputs that follow comments', () => {
    const code = `
      function main({
        // Input comment.
        amount,
        /* Currency comment. */ currency
      }) {
        return {
          // Output comment.
          amount,
          /* Currency comment. */ currency
        };
      }
    `;

    expect(extractCodeInputDefinitions(code)?.map(({ key }) => key)).toEqual([
      'amount',
      'currency'
    ]);
    expect(extractReturnedObjectKeys(code)).toEqual(['amount', 'currency']);
  });

  it('extracts JavaScript inputs and return outputs with documented types', () => {
    const code = `
      /**
       * @param {number} amount - Amount
       * @param {string} currency - Currency
       * @property {number} total - Total
       * @property {object} detail - Detail
       */
      function main({ amount, currency = 'CNY' }) {
        return { total: amount * 2, detail: { amount, currency } };
      }
    `;

    expect(extractCodeInputDefinitions(code)).toEqual([
      { key: 'amount', valueType: 'number' },
      { key: 'currency', valueType: 'string' }
    ]);
    expect(extractCodeOutputDefinitions(code)).toEqual([
      { key: 'total', valueType: 'number' },
      { key: 'detail', valueType: 'object' }
    ]);
  });

  it('extracts Python inputs and ignores non-static returned properties', () => {
    const code = `
      def main(question, count=1):
        # return {"ignored": True}
        return {"items": [question] * count, **extra}
    `;

    expect(extractCodeInputDefinitions(code)).toEqual([
      { key: 'question', valueType: undefined },
      { key: 'count', valueType: undefined }
    ]);
    expect(extractReturnedObjectKeys(code)).toEqual(['items']);
  });

  it('distinguishes empty static IO from code that cannot be parsed safely', () => {
    expect(extractCodeInputDefinitions('function main() { return {}; }')).toEqual([]);
    expect(extractCodeOutputDefinitions('function main() { return {}; }')).toEqual([]);
    expect(extractCodeInputDefinitions('function main(args) { return getResult(args); }')).toBe(
      undefined
    );
    expect(extractCodeOutputDefinitions('function main(args) { return getResult(args); }')).toBe(
      undefined
    );
  });

  it('ignores template-like characters inside regular expression literals', () => {
    expect(
      extractCodeOutputDefinitions(`
        function main({ text }) {
          const parsed = String(text).replace(/^\`\`\`json|^\`\`\`|\`\`\`$/g, '');
          return { parsed };
        }
      `)
    ).toEqual([{ key: 'parsed', valueType: undefined }]);
  });

  it('parses Python floor division, positional-only marker, and triple-quoted strings', () => {
    const multiline = `
      def main(total, count=10 // 2, unit="s"):
        """The old entry was "function main({ legacy })" in JavaScript."""
        return {
          "average": total // count,
          "remainder": total % count,
          """message""": "ok"
        }
    `;
    const inlineAndPositional = `
      def main(total, /, count):
        return {"average": total // count, "remainder": total % count}
    `;

    expect(
      extractCodeInputDefinitions(multiline, SandboxCodeTypeEnum.py)?.map(({ key }) => key)
    ).toEqual(['total', 'count', 'unit']);
    expect(extractReturnedObjectKeys(multiline, SandboxCodeTypeEnum.py)).toEqual([
      'average',
      'remainder',
      'message'
    ]);
    expect(extractReturnedObjectKeys(multiline)).toEqual(['average', 'remainder', 'message']);

    expect(
      extractCodeInputDefinitions(inlineAndPositional, SandboxCodeTypeEnum.py)?.map(
        ({ key }) => key
      )
    ).toEqual(['total', 'count']);
    expect(extractReturnedObjectKeys(inlineAndPositional)).toEqual(['average', 'remainder']);
  });

  it('handles JavaScript private fields, member division, nested templates, and CRLF continuations', () => {
    const code = [
      'class Counter {',
      '  #value = 1;',
      '  format() { return `${this.#value}`; }',
      '}',
      'const limits = { in: 4 };',
      'const scale = limits.in / 2;',
      "const note = `outer ${`Today's ${scale}`}`;",
      '/*',
      'def main(legacy):',
      '    return {"old": legacy}',
      '*/',
      'function main({ total, count }) {',
      "  return { text: 'first \\",
      "second', total, remainder: total % count };",
      '}'
    ].join('\r\n');

    expect(
      extractCodeInputDefinitions(code, SandboxCodeTypeEnum.js)?.map(({ key }) => key)
    ).toEqual(['total', 'count']);
    expect(extractReturnedObjectKeys(code, SandboxCodeTypeEnum.js)).toEqual([
      'text',
      'total',
      'remainder'
    ]);
    expect(extractReturnedObjectKeys(code)).toEqual(['text', 'total', 'remainder']);
  });

  it('detects source language mismatch for named, aliased, and arrow entrypoints without false positives', () => {
    const pyAlias = [
      'def calculate(function, total, count):',
      '    val = function(total // count)',
      '    return {"val": val, "remainder": total % count}',
      'main = calculate'
    ].join('\n');
    const jsArrow = 'const main = ({ total }) => { return { total, extra: total + 1 }; };';
    const jsWithPyComment =
      '/*\ndef main(legacy):\n  return {}\n*/\nfunction main({ a }) { return { a }; }';

    expect(isCodeMismatchedWithType(pyAlias, SandboxCodeTypeEnum.py)).toBe(false);
    expect(isCodeMismatchedWithType(pyAlias, SandboxCodeTypeEnum.js)).toBe(true);
    expect(isCodeMismatchedWithType(jsArrow, SandboxCodeTypeEnum.js)).toBe(false);
    expect(isCodeMismatchedWithType(jsArrow, SandboxCodeTypeEnum.py)).toBe(true);
    expect(isCodeMismatchedWithType(jsWithPyComment, SandboxCodeTypeEnum.js)).toBe(false);
    expect(isCodeMismatchedWithType(jsWithPyComment, SandboxCodeTypeEnum.py)).toBe(true);
    expect(isCodeMismatchedWithType('main = lambda x: x', SandboxCodeTypeEnum.py)).toBe(false);
  });
});
