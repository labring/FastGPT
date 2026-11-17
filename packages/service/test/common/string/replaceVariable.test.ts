import {
  createDefaultInstanceConfig,
  getTestInstanceConfig
} from '@test/utils/instanceConfigSnapshot';
import { beforeEach, describe, expect, it, vi } from 'vitest';

(global as any).systemInstanceConfig = createDefaultInstanceConfig();

import { valToStr, replaceVariable } from '@fastgpt/service/common/string/replaceVariable';
import { SYSTEM_STRING_LENGTH_UNIT } from '@fastgpt/service/env.const';

const { loggerInfoMock } = vi.hoisted(() => ({
  loggerInfoMock: vi.fn()
}));

// replaceVariable 接管实例配置后会经 controller 引入 Mongo schema 链路（indexManager 需要
// LogCategories.INFRA），因此只覆盖 getLogger，保留真实 LogCategories。
vi.mock('@fastgpt/service/common/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/common/logger')>()),
  getLogger: () => ({
    info: loggerInfoMock
  })
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

  it('should stop replacement rounds when the result exceeds the system string limit', () => {
    // 缩小私有单测阈值覆盖多轮替换；完整表单取值的百万字符边界另行验证。
    const snapshot = getTestInstanceConfig();
    const original = snapshot.resource.systemMaxStringLengthM;
    snapshot.resource.systemMaxStringLengthM = 20 / SYSTEM_STRING_LENGTH_UNIT;
    try {
      expect(
        replaceVariable('{{large}}', {
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

      expect(replaceVariable(`${'x'.repeat(21)}{{next}}`, { next: 'value' })).toBe(
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
    } finally {
      snapshot.resource.systemMaxStringLengthM = original;
    }
  });

  it('applies legal one- and two-million-character settings to the same real replacement input', () => {
    const config = getTestInstanceConfig().resource;
    const original = config.systemMaxStringLengthM;
    const marker = '{{value}}';
    const exact = 'x'.repeat(SYSTEM_STRING_LENGTH_UNIT - marker.length) + marker;
    const above = 'x' + exact;
    try {
      config.systemMaxStringLengthM = 1;
      expect(replaceVariable(exact, { value: 'done' })).toBe(exact.replace(marker, 'done'));
      expect(replaceVariable(above, { value: 'done' })).toBe(above);
      config.systemMaxStringLengthM = 2;
      expect(replaceVariable(above, { value: 'done' })).toBe(above.replace(marker, 'done'));
      config.systemMaxStringLengthM = 1;
      expect(replaceVariable(above, { value: 'done' })).toBe(above);
    } finally {
      config.systemMaxStringLengthM = original;
    }
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
