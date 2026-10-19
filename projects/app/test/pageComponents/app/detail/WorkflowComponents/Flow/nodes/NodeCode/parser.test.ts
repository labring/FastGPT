import { extractCodeFromMarkdown } from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/NodeCode/parser';
import { describe, expect, it } from 'vitest';

describe('extractCodeFromMarkdown', () => {
  it('uses return keys as output names and JSDoc only as the type source', () => {
    const result = extractCodeFromMarkdown(`
\`\`\`javascript
/**
 * @param {string} question [start.question] - Question
 * @property {arrayString} 题目计划 - 业务说明
 * @property {string} 返回文本 - 业务说明
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
      { label: 'question', type: 'string', reference: 'start.question' }
    ]);
    expect(result.code).toContain('return { plan, result: JSON.stringify(plan) };');
    expect(result.code).not.toContain('@property');
  });

  it('keeps documented outputs as a compatibility fallback for a dynamic return expression', () => {
    expect(
      extractCodeFromMarkdown(`
        /** @property {number} total - Total */
        function main() { return getResult(); }
      `).outputs
    ).toEqual([{ key: 'total', type: 'number' }]);
  });

  it('does not create obsolete outputs for an explicit empty return object', () => {
    expect(
      extractCodeFromMarkdown(`
        /** @property {number} oldValue - Obsolete */
        function main() { return {}; }
      `).outputs
    ).toEqual([]);
  });

  it('uses any for actual output keys without type documentation', () => {
    expect(extractCodeFromMarkdown('function main() { return { result: 1 }; }').outputs).toEqual([
      { key: 'result', type: 'any' }
    ]);
  });

  it('extracts output keys from a Python code block', () => {
    expect(
      extractCodeFromMarkdown('\`\`\`python\ndef main():\n    return {"result": 1}\n\`\`\`').outputs
    ).toEqual([{ key: 'result', type: 'any' }]);
  });
});
