import {
  extractCodeFromMarkdown,
  extractReturnedObjectKeys
} from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/NodeCode/parser';
import { describe, expect, it } from 'vitest';

describe('extractReturnedObjectKeys', () => {
  it('extracts JavaScript shorthand and explicit keys from the returned object', () => {
    expect(
      extractReturnedObjectKeys(`
        function main() {
          const plan = [{ id: 1, title: 'a,b' }];
          return { plan, result: JSON.stringify({ plan, ok: true }) };
        }
      `)
    ).toEqual(['plan', 'result']);
  });

  it('extracts static Python dictionary keys', () => {
    expect(
      extractReturnedObjectKeys(`
        def main():
          return {"plan": [1, 2], 'result': {"ok": True}}
      `)
    ).toEqual(['plan', 'result']);
  });

  it('ignores return text in comments, strings and computed or spread properties', () => {
    expect(
      extractReturnedObjectKeys(`
        // return { ignored: true }
        const text = "return { alsoIgnored: true }";
        function main() {
          return { visible: 1, ...other, [dynamicKey]: 2 };
        }
      `)
    ).toEqual(['visible']);
  });
});

describe('extractCodeFromMarkdown', () => {
  it('uses return keys as output names and JSDoc only as the type source', () => {
    const result = extractCodeFromMarkdown(`
\`\`\`javascript
/**
 * @property {arrayString} 题目计划 - 业务说明
 * @property {string} 返回文本 - 业务说明
 */
function main() {
  const plan = ['one'];
  return { plan, result: JSON.stringify(plan) };
}
\`\`\`
    `);

    expect(result.outputs).toEqual([
      { key: 'plan', type: 'arrayString' },
      { key: 'result', type: 'string' }
    ]);
    expect(result.code).not.toContain('@property');
  });

  it('keeps documented outputs as a compatibility fallback when no return object is found', () => {
    const result = extractCodeFromMarkdown(`
/** @property {number} total - total value */
function main() {
  return getResult();
}
    `);
    expect(result.outputs).toEqual([{ key: 'total', type: 'number' }]);
  });
});
