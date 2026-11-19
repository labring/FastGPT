import {
  extractCodeInputDefinitions,
  extractCodeOutputDefinitions,
  extractReturnedObjectKeys
} from '../../src/code/io';
import { describe, expect, it } from 'vitest';

describe('code IO parser', () => {
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

  it('keeps Python outputs that follow a floor division', () => {
    const multiline = `
      def main(total, count=10 // 2, unit="s"):
        return {
          "average": total // count,
          "remainder": total % count
        }
    `;
    const inline = `
      def main(total, count):
        return {"average": total // count, "remainder": total % count}
    `;

    expect(extractCodeInputDefinitions(multiline)?.map(({ key }) => key)).toEqual([
      'total',
      'count',
      'unit'
    ]);
    expect(extractReturnedObjectKeys(multiline)).toEqual(['average', 'remainder']);
    expect(extractReturnedObjectKeys(inline)).toEqual(['average', 'remainder']);
  });

  it('detects the language from the main definition, not from comments', () => {
    const python = `
      # port of function main({ total })
      # def main(legacy):
      def main(total, count):
        return {
          "average": total // count,
          "remainder": total % count
        }
    `;
    const javascript = `
      // was: def main(total)
      function main({ total }) {
        return { half: total / 2, // rounded later
          ok: /}/.test(total) };
      }
    `;

    expect(extractCodeInputDefinitions(python)?.map(({ key }) => key)).toEqual(['total', 'count']);
    expect(extractReturnedObjectKeys(python)).toEqual(['average', 'remainder']);
    expect(extractCodeInputDefinitions(javascript)?.map(({ key }) => key)).toEqual(['total']);
    expect(extractReturnedObjectKeys(javascript)).toEqual(['half', 'ok']);
  });

  it('keeps Python inputs that follow a positional-only marker', () => {
    const code = `
      def main(total, /, count):
        return {"average": total / count}
    `;

    expect(extractCodeInputDefinitions(code)?.map(({ key }) => key)).toEqual(['total', 'count']);
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
