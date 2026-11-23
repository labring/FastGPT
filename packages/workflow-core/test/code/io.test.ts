import {
  extractCodeInputDefinitions,
  extractCodeOutputDefinitions,
  extractReturnedObjectKeys
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
});
