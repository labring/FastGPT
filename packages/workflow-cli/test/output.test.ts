import { createSuccessEnvelope, renderError, renderSuccess } from '../src';
import { describe, expect, it } from 'vitest';

describe('CLI output', () => {
  it('renders stable success envelopes and text variants', () => {
    expect(createSuccessEnvelope('validate', { changed: false, result: { valid: true } })).toEqual({
      schemaVersion: 'fastgpt-workflow-cli-result/v1',
      ok: true,
      command: 'validate',
      changed: false,
      checksum: undefined,
      changes: undefined,
      result: { valid: true },
      warnings: [],
      audit: undefined
    });
    expect(
      renderSuccess({ command: 'x', result: { changed: false, result: 'value' }, format: 'text' })
    ).toBe('value');
    expect(
      renderSuccess({
        command: 'x',
        result: { changed: false, result: { a: 1 } },
        format: 'text'
      })
    ).toBe('{\n  "a": 1\n}');
    expect(
      renderSuccess({ command: 'x', result: { changed: false, message: 'done' }, format: 'text' })
    ).toBe('done');
    expect(renderSuccess({ command: 'x', result: { changed: false }, format: 'text' })).toBe('OK');
  });

  it('renders errors as pure JSON or readable text', () => {
    expect(
      JSON.parse(renderError({ command: 'x', code: 'BAD', params: { key: 1 }, format: 'json' }))
    ).toMatchObject({
      ok: false,
      changed: false,
      errors: [{ code: 'BAD', params: { key: 1 } }]
    });
    expect(
      renderError({ command: 'x', code: 'BAD', diagnostics: [{ code: 'D' }], format: 'text' })
    ).toContain('"code": "D"');
  });
});
