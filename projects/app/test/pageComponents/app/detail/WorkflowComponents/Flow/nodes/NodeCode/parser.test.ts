import { extractCodeFromMarkdown } from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/NodeCode/parser';
import { describe, expect, it } from 'vitest';

describe('extractCodeFromMarkdown', () => {
  it('reads input and output keys from JSDoc while preserving input references', () => {
    const result = extractCodeFromMarkdown(`
\`\`\`javascript
/**
 * @param {string} question [start.question] - 问题
 * @property {arrayString} plan - 题目计划
 * @property {string} result - 返回文本
 */
function main({ question }) {
  const plan = [question];
  return { plan, result: JSON.stringify(plan) };
}
\`\`\`
    `);

    expect(result.outputs).toEqual([
      { key: 'plan', type: 'arrayString' },
      { key: 'result', type: 'string' }
    ]);
    expect(result.inputs).toEqual([
      { key: 'question', type: 'string', reference: 'start.question' }
    ]);
    expect(result.code).toContain('return { plan, result: JSON.stringify(plan) };');
    expect(result.code).not.toContain('@property');
  });

  it('reads documented output keys for a dynamic return expression', () => {
    expect(
      extractCodeFromMarkdown(`
        /** @property {number} total - Total */
        function main() { return getResult(); }
      `).outputs
    ).toEqual([{ key: 'total', type: 'number' }]);
  });

  it('keeps Unicode and hyphenated output keys unchanged', () => {
    expect(
      extractCodeFromMarkdown(`
        /**
         * @property {string} 返回文本 - 文本
         * @property {number} result-count - 数量
         */
        function main() { return { 返回文本: 'ok', 'result-count': 1 }; }
      `).outputs
    ).toEqual([
      { key: '返回文本', type: 'string' },
      { key: 'result-count', type: 'number' }
    ]);
  });

  it('infers undocumented IO from the actual code using any as the unknown type', () => {
    expect(
      extractCodeFromMarkdown('function main({ question }) { return { result: 1 }; }')
    ).toEqual({
      code: 'function main({ question }) { return { result: 1 }; }',
      inputs: [{ key: 'question', type: 'any', reference: undefined }],
      outputs: [{ key: 'result', type: 'any' }]
    });
  });

  it('reads Python parameter keys without requiring a reference', () => {
    expect(
      extractCodeFromMarkdown(`
\`\`\`python
# @param {number} amount - 金额
# @property {number} total - 总额
def main(amount):
    return {"total": amount}
\`\`\`
      `)
    ).toMatchObject({
      inputs: [{ key: 'amount', type: 'number', reference: undefined }],
      outputs: [{ key: 'total', type: 'number' }]
    });
  });
  it('takes output keys from return expressions while retaining JSDoc types', () => {
    const result = extractCodeFromMarkdown(`
      /** @property {number} staleOutput - An obsolete output name */
      function main() { return { total: 1 }; }
    `);
    expect(result.outputs).toEqual([{ key: 'total', type: 'number' }]);
  });

  it('ignores commented and stringified returns when discovering real outputs', () => {
    const result = extractCodeFromMarkdown(`
      function main({ question }) {
        // return { obsolete: 1 };
        const example = "return { phantom: 1 }";
        return { result: question };
      }
    `);
    expect(result.outputs).toEqual([{ key: 'result', type: 'any' }]);
  });
});
