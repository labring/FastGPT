import { describe, expect, it } from 'vitest';
import { createJsonRenderer, createSuccessEnvelope } from '../../src/infra/ui/renderer';
import { CliArgumentError } from '../../src/shared/errors';
import { applyFieldsProjection, pickDotPath } from '../../src/shared/output-transform';

describe('Agent Output Transforms (--fields, --pick, --raw) & Lean Envelope', () => {
  it('omits empty warnings array in success envelope while keeping non-empty warnings', () => {
    const clean = createSuccessEnvelope('dataset list', { changed: false, data: { total: 0 } });
    expect('warnings' in clean).toBe(false);

    const withWarn = createSuccessEnvelope('dataset list', {
      changed: false,
      warnings: ['heads up']
    });
    expect(withWarn.warnings).toEqual(['heads up']);
  });

  it('projects nested fields on list payloads, arrays, and single records', () => {
    const listData = {
      total: 2,
      list: [
        {
          _id: 'd1',
          name: 'Docs',
          avatar: '/huge/base64/or/url.png',
          vectorModel: { model: 'text-embedding-3-small', charsPointsPrice: 1 }
        },
        {
          _id: 'd2',
          name: 'FAQ',
          avatar: '/other.png',
          vectorModel: { model: 'bge-m3', charsPointsPrice: 0 }
        }
      ]
    };

    const projected = applyFieldsProjection({
      data: listData,
      fields: ['_id', 'name', 'vectorModel.model']
    }) as typeof listData;

    expect(projected.total).toBe(2);
    expect(projected.list).toEqual([
      { _id: 'd1', name: 'Docs', vectorModel: { model: 'text-embedding-3-small' } },
      { _id: 'd2', name: 'FAQ', vectorModel: { model: 'bge-m3' } }
    ]);

    const arrayProjected = applyFieldsProjection({
      data: [{ _id: '1', name: 'A', secret: 'x' }],
      fields: ['_id', 'name']
    });
    expect(arrayProjected).toEqual([{ _id: '1', name: 'A' }]);
  });

  it('extracts dot-paths via --pick (with and without data. prefix) and blocks prototype keys', () => {
    const envelope = {
      ok: true,
      data: {
        datasetId: 'ds-123',
        list: [{ _id: 'item-0', name: 'First' }]
      },
      meta: { total: 1 }
    };

    expect(pickDotPath({ envelope, path: 'data.datasetId' })).toBe('ds-123');
    expect(pickDotPath({ envelope, path: 'datasetId' })).toBe('ds-123');
    expect(pickDotPath({ envelope, path: 'data.list.0._id' })).toBe('item-0');
    expect(pickDotPath({ envelope, path: 'meta.total' })).toBe(1);

    expect(() => pickDotPath({ envelope, path: '__proto__.polluted' })).toThrow(CliArgumentError);
    expect(() => pickDotPath({ envelope, path: 'data.missingKey' })).toThrow(CliArgumentError);
  });

  it('renders --pick and --raw cleanly via JSON renderer', () => {
    const renderer = createJsonRenderer();
    const res = {
      changed: true,
      data: { datasetId: 'ds-999', name: 'Demo' },
      meta: { durationMs: 12 }
    };

    const pickedRaw = renderer.renderSuccess({
      command: 'dataset create',
      result: res,
      pick: 'data.datasetId',
      raw: true
    });
    expect(pickedRaw).toBe('ds-999');

    const pickedWrapped = JSON.parse(
      renderer.renderSuccess({
        command: 'dataset create',
        result: res,
        pick: 'data.datasetId',
        raw: false
      })
    );
    expect(pickedWrapped.ok).toBe(true);
    expect(pickedWrapped.data).toBe('ds-999');

    const fullRaw = JSON.parse(
      renderer.renderSuccess({
        command: 'dataset create',
        result: res,
        raw: true
      })
    );
    expect(fullRaw).toEqual({ datasetId: 'ds-999', name: 'Demo' });
  });
});
