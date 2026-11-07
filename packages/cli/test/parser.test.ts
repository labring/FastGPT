import { describe, expect, it } from 'vitest';
import { buildInput, parseArguments } from '../src/parser';

const id = '507f1f77bcf86cd799439011';

describe('CLI input contracts', () => {
  it('parses command paths, aliases, inline values and repeated flags', () => {
    expect(
      parseArguments([
        'dataset',
        'collection',
        'list',
        '--dataset-id',
        id,
        '--page-size=5',
        '--no-select-folder'
      ])
    ).toEqual({
      command: 'dataset collection list',
      flags: [
        { name: 'dataset-id', value: id },
        { name: 'page-size', value: '5' },
        { name: 'no-select-folder' }
      ]
    });
    expect(parseArguments(['-h', '-v']).flags).toEqual([{ name: 'help' }, { name: 'version' }]);
  });

  it('uses the generated schema to preserve strings and convert numeric and boolean options', () => {
    expect(
      buildInput('collections.list', [
        { name: 'dataset-id', value: id },
        { name: 'page-size', value: '10' },
        { name: 'select-folder', value: 'false' },
        { name: 'search-text', value: '123' }
      ])
    ).toMatchObject({ datasetId: id, pageSize: 10, selectFolder: false, searchText: '123' });
  });

  it('constructs structured multi-dataset queries and supports repeated IDs', () => {
    expect(
      buildInput('search', [
        { name: 'dataset-id', value: id },
        { name: 'dataset-id', value: id },
        { name: 'text', value: 'hello' },
        { name: 'mode', value: 'mixedRecall' },
        { name: 'rerank' },
        { name: 'rerank-weight', value: '0' },
        { name: 'max-tokens', value: '1000' }
      ])
    ).toMatchObject({
      scope: { datasetIds: [id, id] },
      query: { text: 'hello' },
      retrieval: { mode: 'mixedRecall' },
      rerank: { enabled: true, weight: 0 },
      result: { maxTokens: 1000 }
    });
  });

  it('supports JSON object options, null parent IDs, and JSON-array options', () => {
    expect(
      buildInput('batchMove', [
        { name: 'ids', value: JSON.stringify([id]) },
        { name: 'parent-id', value: 'null' }
      ])
    ).toEqual({ ids: [id], parentId: null });
    expect(
      buildInput('search', [{ name: 'scope', value: JSON.stringify({ datasetIds: [id] }) }], {
        query: { text: 'question' }
      })
    ).toHaveProperty('scope.datasetIds', [id]);
  });

  it('does not mutate the supplied base object', () => {
    const base = { scope: { datasetIds: [id] }, query: { text: 'original' } };
    const result = buildInput('search', [{ name: 'text', value: 'new' }], base);
    expect(base.query.text).toBe('original');
    expect(result).toHaveProperty('query.text', 'new');
  });

  it.each([
    ['list', [{ name: 'typo', value: 'x' }]],
    ['list', [{ name: 'page-size', value: 'NaN' }]],
    ['list', [{ name: 'page-size' }]],
    ['list', [{ name: 'no-page-size' }]],
    ['list', [{ name: 'page-size', value: '-1' }]],
    ['get', []],
    ['get', [{ name: 'id', value: 'invalid-objectid' }]],
    [
      'collections.list',
      [
        { name: 'dataset-id', value: id },
        { name: 'select-folder', value: 'yes' }
      ]
    ],
    ['search', [{ name: 'scope.__proto__.x', value: 'x' }]]
  ] as const)('rejects invalid or unknown options for %s', (operation, flags) => {
    expect(() => buildInput(operation, [...flags])).toThrow();
  });

  it.each([null, [], 'string'])('rejects non-object JSON input', (value) => {
    expect(() => buildInput('list', [], value)).toThrow('JSON object');
  });
});
