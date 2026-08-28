import {
  DatasetSynonymValidationError,
  buildSynonymMatcher,
  normalizeSynonymInputMappings,
  normalizeSynonymMappings,
  normalizeSynonymTerm,
  parseSynonymFile,
  parseSynonymFileRows,
  serializeSynonymMappingsToCsv,
  type DatasetSynonymMatcherMapping
} from '@fastgpt/service/core/dataset/synonym/utils';
import { describe, expect, it } from 'vitest';
import XLSX from 'xlsx';

const createMapping = (
  data: Partial<DatasetSynonymMatcherMapping> &
    Pick<
      DatasetSynonymMatcherMapping,
      'standardizedTerm' | 'normalizedStandardizedTerm' | 'synonymTerms' | 'normalizedSynonymTerms'
    >
): DatasetSynonymMatcherMapping => ({
  logicalMappingId: '68ee0bd23d17260b7829b137',
  datasetId: '68ee0bd23d17260b7829b138',
  fileVersion: 1,
  ...data
});

describe('normalizeSynonymTerm', () => {
  it('trims outer spaces and normalizes ASCII letter case only', () => {
    expect(normalizeSynonymTerm('  FAST  GPT  ')).toBe('fast  gpt');
    expect(normalizeSynonymTerm('ＡＩ')).toBe('ＡＩ');
  });
});

describe('parseSynonymFileRows', () => {
  it('parses CSV header, quoted cells and empty rows', () => {
    const rows = parseSynonymFileRows({
      buffer: Buffer.from('标准词,同义词1,同义词2\n退款,"退,款",退钱\n,,\n订单,交易单,'),
      extension: '.CSV'
    });

    expect(rows).toEqual([
      {
        rowNumber: 2,
        standardizedTerm: '退款',
        synonymTerms: ['退,款', '退钱']
      },
      {
        rowNumber: 4,
        standardizedTerm: '订单',
        synonymTerms: ['交易单']
      }
    ]);
  });

  it.each(['xlsx', 'xls'])('parses the first worksheet from %s files', (extension) => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ['标准词', '同义词'],
        ['退款', '退钱']
      ]),
      'Synonyms'
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ['标准词', '同义词'],
        ['不应读取', 'ignored']
      ]),
      'Ignored'
    );
    const buffer = XLSX.write(workbook, {
      type: 'buffer',
      bookType: extension as 'xlsx' | 'xls'
    });

    expect(parseSynonymFileRows({ buffer, extension })).toEqual([
      {
        rowNumber: 2,
        standardizedTerm: '退款',
        synonymTerms: ['退钱']
      }
    ]);
  });

  it('rejects unsupported extensions and oversized files', () => {
    expect(() =>
      parseSynonymFileRows({ buffer: Buffer.from('a,b'), extension: 'txt' })
    ).toThrowError(DatasetSynonymValidationError);
    expect(() =>
      parseSynonymFileRows({ buffer: Buffer.alloc(10 * 1024 * 1024 + 1), extension: 'csv' })
    ).toThrow('同义词文件不能超过');
  });

  it('rejects invalid UTF-8 CSV and malformed Excel', () => {
    expect(() =>
      parseSynonymFileRows({ buffer: Buffer.from([0xff, 0xfe]), extension: 'csv' })
    ).toThrow('UTF-8');
    expect(() =>
      parseSynonymFileRows({ buffer: Buffer.from('not an excel file'), extension: 'xlsx' })
    ).toThrow('Excel 文件签名无效');
  });

  it('rejects files without a supported header instead of dropping the first mapping', () => {
    expect(() =>
      parseSynonymFileRows({
        buffer: Buffer.from('退款,退钱\n订单,交易单'),
        extension: 'csv'
      })
    ).toThrow('第 1 行必须是');
  });

  it.each(['退款,', ',退钱'])('rejects incomplete non-empty rows with a row number', (row) => {
    try {
      parseSynonymFileRows({
        buffer: Buffer.from(`标准词,同义词\n${row}`),
        extension: 'csv'
      });
      throw new Error('Expected parsing to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(DatasetSynonymValidationError);
      expect((error as DatasetSynonymValidationError).rowNumber).toBe(2);
    }
  });
});

describe('normalizeSynonymMappings', () => {
  it('merges duplicate standards and deduplicates synonyms case-insensitively', () => {
    const result = normalizeSynonymMappings([
      {
        rowNumber: 2,
        standardizedTerm: 'FastGPT',
        synonymTerms: ['FAST GPT', 'FGPT']
      },
      {
        rowNumber: 4,
        standardizedTerm: 'fastgpt',
        synonymTerms: ['fast gpt', 'Fast AI']
      }
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      standardizedTerm: 'FastGPT',
      normalizedStandardizedTerm: 'fastgpt',
      synonymTerms: ['Fast AI', 'FAST GPT', 'FGPT'],
      normalizedSynonymTerms: ['fast ai', 'fast gpt', 'fgpt'],
      sourceRows: [2, 4]
    });
    expect(result[0]?.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it.each([
    [
      [
        { rowNumber: 2, standardizedTerm: 'A', synonymTerms: ['B'] },
        { rowNumber: 3, standardizedTerm: 'B', synonymTerms: ['C'] }
      ],
      3
    ],
    [
      [
        { rowNumber: 2, standardizedTerm: 'A', synonymTerms: ['X'] },
        { rowNumber: 3, standardizedTerm: 'B', synonymTerms: ['x'] }
      ],
      3
    ],
    [[{ rowNumber: 2, standardizedTerm: 'A', synonymTerms: ['a'] }], 2]
  ])('rejects conflicting groups', (rows, rowNumber) => {
    try {
      normalizeSynonymMappings(rows);
      throw new Error('Expected normalization to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(DatasetSynonymValidationError);
      expect((error as DatasetSynonymValidationError).code).toBe('mapping_conflict');
      expect((error as DatasetSynonymValidationError).rowNumber).toBe(rowNumber);
    }
  });

  it('rejects control characters and oversized terms', () => {
    expect(() =>
      normalizeSynonymMappings([
        { rowNumber: 2, standardizedTerm: 'valid', synonymTerms: ['bad\nterm'] }
      ])
    ).toThrow('控制字符');
    expect(() =>
      normalizeSynonymMappings([
        { rowNumber: 2, standardizedTerm: 'a'.repeat(129), synonymTerms: ['alias'] }
      ])
    ).toThrow('超过 128');
  });

  it('rejects mappings whose aggregate term length would create an oversized matcher', () => {
    const rows = Array.from({ length: 2000 }, (_, index) => {
      const prefix = String(index).padStart(4, '0');
      return {
        rowNumber: index + 1,
        standardizedTerm: `${prefix}${'a'.repeat(124)}`,
        synonymTerms: [`${prefix}${'b'.repeat(124)}`]
      };
    });

    expect(() => normalizeSynonymMappings(rows)).toThrow('总长度不能超过');
  });

  it('keeps fingerprints stable for synonym input order but sensitive to standard term case', () => {
    const first = normalizeSynonymMappings([
      { rowNumber: 2, standardizedTerm: 'A', synonymTerms: ['C', 'B'] }
    ]);
    const second = normalizeSynonymMappings([
      { rowNumber: 2, standardizedTerm: 'a', synonymTerms: ['b', 'c'] }
    ]);

    expect(first[0]?.fingerprint).not.toBe(second[0]?.fingerprint);
  });

  it('rejects blank terms after trimming', () => {
    expect(() =>
      normalizeSynonymMappings([{ rowNumber: 2, standardizedTerm: '   ', synonymTerms: ['alias'] }])
    ).toThrow('空白词条');
    expect(() =>
      normalizeSynonymMappings([
        { rowNumber: 2, standardizedTerm: 'standard', synonymTerms: ['   '] }
      ])
    ).toThrow('空白词条');
  });
});

describe('normalizeSynonymInputMappings', () => {
  it('uses the same normalization and conflict rules as file input', () => {
    expect(
      normalizeSynonymInputMappings([
        { standardizedTerm: 'Refund', synonymTerms: ['refund request', 'REFUND REQUEST'] }
      ])
    ).toMatchObject([
      {
        standardizedTerm: 'Refund',
        normalizedStandardizedTerm: 'refund',
        synonymTerms: ['refund request']
      }
    ]);
    expect(() =>
      normalizeSynonymInputMappings([
        { standardizedTerm: 'A', synonymTerms: ['B'] },
        { standardizedTerm: 'B', synonymTerms: ['C'] }
      ])
    ).toThrow(DatasetSynonymValidationError);
  });
});

describe('serializeSynonymMappingsToCsv', () => {
  it('writes BOM CSV, expands columns and escapes RFC 4180 cells', () => {
    const csv = serializeSynonymMappingsToCsv([
      { standardizedTerm: '退款', synonymTerms: ['退,款', '退"钱'] },
      { standardizedTerm: 'order\nnumber', synonymTerms: ['交易单'] }
    ]);

    expect(csv).toBe(
      '\uFEFF标准术语,同义词,同义词\r\n退款,"退,款","退""钱"\r\n"order\nnumber",交易单\r\n'
    );
  });
});

describe('parseSynonymFile', () => {
  it('parses and normalizes a valid CSV file', () => {
    expect(
      parseSynonymFile({
        buffer: Buffer.from('standard,synonym\nRefund,refund request'),
        extension: 'csv'
      })
    ).toMatchObject([
      {
        standardizedTerm: 'Refund',
        normalizedStandardizedTerm: 'refund',
        normalizedSynonymTerms: ['refund request']
      }
    ]);
  });

  it('parses CSV generated by the serializer with a UTF-8 BOM', () => {
    const csv = serializeSynonymMappingsToCsv([
      { standardizedTerm: '退款', synonymTerms: ['退钱'] }
    ]);

    expect(parseSynonymFile({ buffer: Buffer.from(csv), extension: 'csv' })).toMatchObject([
      {
        standardizedTerm: '退款',
        synonymTerms: ['退钱']
      }
    ]);
  });
});

describe('buildSynonymMatcher', () => {
  it('uses longest-match-first and does not emit standard terms as mappings', () => {
    const matcher = buildSynonymMatcher([
      createMapping({
        standardizedTerm: 'phone',
        normalizedStandardizedTerm: 'phone',
        synonymTerms: ['手机'],
        normalizedSynonymTerms: ['手机']
      }),
      createMapping({
        logicalMappingId: '68ee0bd23d17260b7829b139',
        standardizedTerm: 'iPhone',
        normalizedStandardizedTerm: 'iphone',
        synonymTerms: ['苹果手机'],
        normalizedSynonymTerms: ['苹果手机']
      })
    ]);

    const result = matcher.transform('苹果手机和phone');
    expect(result.transformedText).toBe('iPhone和phone');
    expect(result.usedMappings).toEqual([
      {
        mappingId: '68ee0bd23d17260b7829b139',
        datasetId: '68ee0bd23d17260b7829b138',
        fileVersion: 1,
        matchedTerm: '苹果手机',
        standardizedTerm: 'iPhone'
      }
    ]);
  });

  it('matches English case-insensitively at Latin word boundaries', () => {
    const matcher = buildSynonymMatcher([
      createMapping({
        standardizedTerm: '人工智能',
        normalizedStandardizedTerm: '人工智能',
        synonymTerms: ['AI'],
        normalizedSynonymTerms: ['ai']
      })
    ]);

    expect(matcher.transform('AI ai (Ai) RAID AIOps AI_2').transformedText).toBe(
      '人工智能 人工智能 (人工智能) RAID AIOps AI_2'
    );
  });

  it('matches mixed terms beside Chinese but not inside Latin words', () => {
    const matcher = buildSynonymMatcher([
      createMapping({
        standardizedTerm: '大模型',
        normalizedStandardizedTerm: '大模型',
        synonymTerms: ['GPT模型'],
        normalizedSynonymTerms: ['gpt模型']
      })
    ]);

    expect(matcher.transform('使用GPT模型和MyGPT模型').transformedText).toBe(
      '使用大模型和MyGPT模型'
    );
  });

  it('does not scan replacement text again and deduplicates metadata', () => {
    const matcher = buildSynonymMatcher([
      createMapping({
        standardizedTerm: 'bar',
        normalizedStandardizedTerm: 'bar',
        synonymTerms: ['foo'],
        normalizedSynonymTerms: ['foo']
      }),
      createMapping({
        logicalMappingId: '68ee0bd23d17260b7829b139',
        standardizedTerm: 'baz',
        normalizedStandardizedTerm: 'baz',
        synonymTerms: ['bar'],
        normalizedSynonymTerms: ['bar']
      })
    ]);

    const result = matcher.transform('foo foo');
    expect(result.transformedText).toBe('bar bar');
    expect(result.usedMappings).toHaveLength(1);
  });

  it('returns empty results for empty text and prevents replacement inside a longer standard term', () => {
    const matcher = buildSynonymMatcher([
      createMapping({
        standardizedTerm: '苹果手机',
        normalizedStandardizedTerm: '苹果手机',
        synonymTerms: ['iPhone'],
        normalizedSynonymTerms: ['iphone']
      }),
      createMapping({
        logicalMappingId: '68ee0bd23d17260b7829b139',
        standardizedTerm: '移动设备',
        normalizedStandardizedTerm: '移动设备',
        synonymTerms: ['手机'],
        normalizedSynonymTerms: ['手机']
      })
    ]);

    expect(matcher.transform('')).toEqual({ transformedText: '', usedMappings: [] });
    expect(matcher.transform('苹果手机').transformedText).toBe('苹果手机');
  });
});
