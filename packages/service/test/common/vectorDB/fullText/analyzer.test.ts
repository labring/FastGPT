import { describe, expect, it } from 'vitest';
import { jiebaSearchTokens, jiebaSplit } from '@fastgpt/service/common/string/jieba/index';
import {
  SQL_FULL_TEXT_EXTERNAL_ANALYZER,
  toSqlFullTextQueryTerms,
  toSqlFullTextTokens,
  tokenizeSqlFullTextRows
} from '@fastgpt/service/common/vectorDB/fullText/analyzer';
import {
  splitSqlFullTextRows,
  SQL_FULL_TEXT_MAX_BYTES
} from '@fastgpt/service/common/vectorDB/fullText/utils';
import { SqlFullTextMetadataSchema } from '@fastgpt/global/core/dataset/fullText/schema';
import { PG_FULL_TEXT_ANALYZER_VERSION } from '@fastgpt/service/common/vectorDB/pg/fullText';
import { OPENGAUSS_FULL_TEXT_ANALYZER_VERSION } from '@fastgpt/service/common/vectorDB/opengauss/fullText';
import { OceanBaseFullTextAdapter } from '@fastgpt/service/common/vectorDB/oceanbase/fullText';

describe('SQL full-text external analyzer', () => {
  it('uses jieba search mode so abbreviations and full names share terms', async () => {
    expect(await jiebaSearchTokens({ text: '复旦大学在哪个城市？' })).toEqual([
      '复旦',
      '大学',
      '复旦大学',
      '城市'
    ]);
    // Mongo 旧全文的普通模式保持不变：不输出重叠词
    expect(await jiebaSplit({ text: '复旦大学在哪个城市？' })).toBe('复旦大学 城市');
  });

  it('lowercases, removes stopwords and keeps jiebaSplit preprocessing rules', async () => {
    expect(await jiebaSearchTokens({ text: 'The C++ 和 H2O' })).toEqual(['c++', 'h2o']);
    // 与 jiebaSplit 相同：去掉 Markdown 符号（# 等）与网址
    expect(await jiebaSearchTokens({ text: 'C# 访问 https://fastgpt.cn/docs' })).toEqual([
      'c',
      '访问'
    ]);
    expect(await jiebaSearchTokens({ text: '是什么意思？' })).toEqual([]);
    expect(await jiebaSearchTokens({ text: '' })).toEqual([]);
  });

  it('strips embedded URLs without wiping surrounding Chinese text, adjacent ASCII tokens or plain http words', async () => {
    // 中文无空格夹带网址：只去掉网址本身，保留前后中文词（jiebaSplit 与 jiebaSearchTokens 一致受益）
    expect(
      await jiebaSearchTokens({ text: '请登录https://etax.chinatax.gov.cn/xx?a=1查看办理流程' })
    ).toEqual(['请', '登录', '查看', '办理', '流程']);
    expect(await jiebaSplit({ text: '网址：http://www.sz.gov.cn，电话12345' })).toBe(
      '网址 电话 12345'
    );

    // Markdown / 尖括号 / 引号包裹的网址（含内部成对圆括号与大写协议）：不吞掉闭合符后紧贴的英文数字
    expect(
      await jiebaSearchTokens({
        text: '[开发文档](HTTPS://en.wikipedia.org/wiki/Rust_(programming_language))v4.18发布'
      })
    ).toEqual(['开发', '文档', 'v4.18', '发布']);
    expect(await jiebaSearchTokens({ text: '<http://[::1]:3000/api>API接口2026' })).toContain(
      'api'
    );
    expect(await jiebaSearchTokens({ text: '<http://[::1]:3000/api>API接口2026' })).toContain(
      '2026'
    );
    expect(
      await jiebaSearchTokens({ text: '详见“https://fastgpt.cn/docs”FastGPT部署指南' })
    ).toContain('fastgpt');
    expect(await jiebaSearchTokens({ text: '地址https://fastgpt.cn/docs——FastGPT指南' })).toContain(
      'fastgpt'
    );
    expect(
      await jiebaSearchTokens({ text: '访问http://[::ffff:127.0.0.1]:3000/api测试API' })
    ).toContain('api');

    // 不带 :// 的普通“http/https”词汇不能当作网址删掉
    expect(await jiebaSearchTokens({ text: '使用HTTP协议传输HTTPS流量' })).toEqual([
      'http',
      '协议',
      '传输',
      'https',
      '流量'
    ]);
  });

  it('joins tokens for storage, keeps empty input empty and enforces the input contract without rejecting valid < 1 MiB expanded inputs', async () => {
    expect(await toSqlFullTextTokens('复旦大学在哪个城市？')).toBe('复旦 大学 复旦大学 城市');
    expect(await toSqlFullTextTokens('')).toBe('');
    await expect(toSqlFullTextTokens('a\0b')).rejects.toThrow('null character');
    await expect(
      toSqlFullTextTokens('中'.repeat(Math.ceil(SQL_FULL_TEXT_MAX_BYTES / 3)))
    ).rejects.toThrow('1 MiB');

    // 合法 < 1 MiB 原文（720 KB）经搜索模式重叠分词后超过 1 MiB，写入与拆批均应放行并单行成批
    const denseValidInput = '复旦大学'.repeat(60000);
    expect(Buffer.byteLength(denseValidInput, 'utf8')).toBeLessThan(SQL_FULL_TEXT_MAX_BYTES);
    const expandedTokens = await toSqlFullTextTokens(denseValidInput);
    expect(Buffer.byteLength(expandedTokens, 'utf8')).toBeGreaterThan(SQL_FULL_TEXT_MAX_BYTES);
    const chunks = [
      ...splitSqlFullTextRows([
        { vectorId: '1', teamId: 't', datasetId: 'd', collectionId: 'c', tokens: expandedTokens },
        { vectorId: '2', teamId: 't', datasetId: 'd', collectionId: 'c', tokens: '短词' }
      ])
    ];
    expect(chunks.map((chunk) => chunk.length)).toEqual([1, 1]);
  });

  it('deduplicates query terms and returns no terms for stopword-only queries', async () => {
    expect(await toSqlFullTextQueryTerms('中文 中文 全文')).toEqual(['中文', '全文']);
    expect(await toSqlFullTextQueryTerms('是什么意思？')).toEqual([]);
  });

  it('tokenizes rows in order without keeping the raw text', async () => {
    const base = { teamId: 't', datasetId: 'd', collectionId: 'c' };
    expect(
      await tokenizeSqlFullTextRows([
        { ...base, vectorId: '1', text: '复旦大学' },
        { ...base, vectorId: '2', text: '' }
      ])
    ).toEqual([
      { ...base, vectorId: '1', tokens: '复旦 大学 复旦大学' },
      { ...base, vectorId: '2', tokens: '' }
    ]);
  });

  it('keeps every provider analyzer version in sync with the shared schema and analyzer signature', () => {
    const versions = [
      PG_FULL_TEXT_ANALYZER_VERSION,
      OPENGAUSS_FULL_TEXT_ANALYZER_VERSION,
      new OceanBaseFullTextAdapter('oceanbase').analyzerVersion,
      new OceanBaseFullTextAdapter('seekdb').analyzerVersion
    ];
    expect([...versions].sort()).toEqual(
      [...SqlFullTextMetadataSchema.shape.analyzerVersion.options].sort()
    );
    for (const version of versions)
      expect(version.endsWith(SQL_FULL_TEXT_EXTERNAL_ANALYZER)).toBe(true);
  });
});
