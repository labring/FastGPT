import { beforeEach, describe, expect, it, vi } from 'vitest';
import { valToStr, replaceVariable } from '@fastgpt/service/common/string/replaceVariable';

const { loggerInfoMock } = vi.hoisted(() => ({
  loggerInfoMock: vi.fn()
}));

vi.mock('@fastgpt/service/common/logger', () => ({
  getLogger: () => ({
    info: loggerInfoMock
  }),
  LogCategories: {
    SYSTEM: ['system']
  }
}));

describe('service replaceVariable', () => {
  beforeEach(() => {
    loggerInfoMock.mockClear();
  });

  it('should convert values to strings', () => {
    expect(valToStr(undefined)).toBe('');
    expect(valToStr(null)).toBe('null');
    expect(valToStr({ a: 1 })).toBe('{"a":1}');
    expect(valToStr(123)).toBe('123');
  });

  it('should replace variables with recursion and safeguards', () => {
    expect(replaceVariable('Hello {{name}}', { name: 'Ada' })).toBe('Hello Ada');
    expect(
      replaceVariable('Hello {{name}}', {
        name: '{{first}} {{last}}',
        first: 'Ada',
        last: 'Lovelace'
      })
    ).toBe('Hello Ada Lovelace');
    expect(replaceVariable('Hello {{name}}', { name: undefined })).toBe('Hello ');
    expect(replaceVariable('Hello {{name}}', { name: '{{name}}' })).toBe('Hello {{name}}');
    expect(replaceVariable(123 as any, { name: 'Ada' })).toBe(123);
  });

  it('should only stringify variables that appear in the template', () => {
    let stringifyCount = 0;
    const unusedLargeObject = {
      toJSON() {
        stringifyCount += 1;
        return { value: 'unused' };
      }
    };

    expect(
      replaceVariable('Hello {{name}}', {
        name: 'Ada',
        unusedLargeObject
      })
    ).toBe('Hello Ada');
    expect(stringifyCount).toBe(0);
  });

  it('should return strings without placeholders before reading variables', () => {
    let stringifyCount = 0;
    const unused = {
      toJSON() {
        stringifyCount += 1;
        return { value: 'unused' };
      }
    };

    expect(replaceVariable('Hello Ada', { unused })).toBe('Hello Ada');
    expect(stringifyCount).toBe(0);
  });

  it('should stop replacement rounds when the result exceeds the system string limit', async () => {
    vi.resetModules();
    vi.doMock('@fastgpt/service/env', () => ({
      SYSTEM_MAX_STRING_LENGTH: 20
    }));
    const { replaceVariable: replaceVariableWithSmallLimit } =
      await import('@fastgpt/service/common/string/replaceVariable');

    expect(
      replaceVariableWithSmallLimit('{{large}}', {
        large: `${'x'.repeat(21)}{{next}}`,
        next: 'should not be scanned'
      })
    ).toBe(`${'x'.repeat(21)}{{next}}`);
    expect(loggerInfoMock).toHaveBeenCalledWith(
      'Oversize string detected during synchronous string processing',
      {
        source: 'replaceVariable',
        reason: 'replacement_result',
        length: 29,
        maxLength: 20
      }
    );

    loggerInfoMock.mockClear();

    expect(replaceVariableWithSmallLimit(`${'x'.repeat(21)}{{next}}`, { next: 'value' })).toBe(
      `${'x'.repeat(21)}{{next}}`
    );
    expect(loggerInfoMock).toHaveBeenCalledWith(
      'Oversize string detected during synchronous string processing',
      {
        source: 'replaceVariable',
        reason: 'input',
        length: 29,
        maxLength: 20
      }
    );

    vi.doUnmock('@fastgpt/service/env');
    vi.resetModules();
  });

  it('should stringify the same referenced variable once per replacement round', () => {
    let stringifyCount = 0;
    const value = {
      toJSON() {
        stringifyCount += 1;
        return { a: 1 };
      }
    };

    expect(replaceVariable('{{value}} {{value}}', { value })).toBe('{"a":1} {"a":1}');
    expect(stringifyCount).toBe(1);
  });

  it('should only replace enumerable own, inherited, and proxy-backed keys', () => {
    expect(replaceVariable('value: {{toString}}', {})).toBe('value: {{toString}}');
    expect(replaceVariable('value: {{toString}}', { toString: 'own value' })).toBe(
      'value: own value'
    );

    const nonEnumerableOwn = {};
    Object.defineProperty(nonEnumerableOwn, 'secret', {
      value: 'hidden',
      enumerable: false
    });
    expect(replaceVariable('value: {{secret}}', nonEnumerableOwn)).toBe('value: {{secret}}');

    const enumerablePrototype = {
      inheritedName: 'Ada'
    };
    expect(replaceVariable('Hello {{inheritedName}}', Object.create(enumerablePrototype))).toBe(
      'Hello Ada'
    );

    const nonEnumerablePrototype = {};
    Object.defineProperty(nonEnumerablePrototype, 'inheritedSecret', {
      value: 'hidden',
      enumerable: false
    });
    expect(
      replaceVariable('value: {{inheritedSecret}}', Object.create(nonEnumerablePrototype))
    ).toBe('value: {{inheritedSecret}}');

    const variables = new Proxy(
      {},
      {
        has(_, key) {
          return key === 'name';
        },
        get(_, key) {
          return key === 'name' ? 'Ada' : undefined;
        }
      }
    ) as Record<string, any>;

    expect(replaceVariable('Hello {{name}}', variables)).toBe('Hello Ada');
  });

  it('should treat $ special characters in replacement value as literals', () => {
    expect(replaceVariable('value: {{val}}', { val: '$1' })).toBe('value: $1');
    expect(replaceVariable('value: {{val}}', { val: '$2' })).toBe('value: $2');
    expect(replaceVariable('value: {{val}}', { val: '$$' })).toBe('value: $$');
    expect(replaceVariable('value: {{val}}', { val: '$&' })).toBe('value: $&');
    expect(replaceVariable('value: {{val}}', { val: "$'" })).toBe("value: $'");
    expect(replaceVariable('value: {{val}}', { val: '$`' })).toBe('value: $`');
    expect(replaceVariable('result={{a}}&other={{b}}', { a: '$1', b: '$2' })).toBe(
      'result=$1&other=$2'
    );
  });
});
