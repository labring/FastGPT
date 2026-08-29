import { describe, expect, it } from 'vitest';
import { DataType, FunctionType } from '@zilliz/milvus2-sdk-node';
import {
  buildAnalyzerParams,
  createBM25Function,
  createFullTextFieldDefs,
  createFullTextIndexParams,
  getMilvusLanguageIdentifier,
  MILVUS_QUERY_MAX_LENGTH,
  MILVUS_TEXT_MAX_LENGTH,
  truncateFullTextByBytes
} from '@fastgpt/service/common/vectorDB/milvus/fullTextConfig';

describe('fullTextConfig', () => {
  it('TC-4.1 lingua analyzer maps Chinese with jieba', () => {
    // 被测函数: buildAnalyzerParams  等级: 3-High
    // （正常场景）lingua 标识 -> analyzers 含 Chinese(tokenizer=jieba)，不含 Mandarin
    const params = buildAnalyzerParams('lingua');
    const analyzers = params.tokenizer.analyzers;
    expect(analyzers.Chinese).toEqual({ tokenizer: 'jieba' });
    expect(analyzers.Mandarin).toBeUndefined();
  });

  it('TC-4.2 whatlang analyzer maps Mandarin with jieba', () => {
    // 被测函数: buildAnalyzerParams  等级: 3-High
    // （正常场景）whatlang 标识 -> analyzers 含 Mandarin(tokenizer=jieba)，不含 Chinese
    const params = buildAnalyzerParams('whatlang');
    const analyzers = params.tokenizer.analyzers;
    expect(analyzers.Mandarin).toEqual({ tokenizer: 'jieba' });
    expect(analyzers.Chinese).toBeUndefined();
  });

  it('TC-4.3 BM25 function wires text -> sparse', () => {
    // 被测函数: createBM25Function  等级: 3-High
    // （正常场景）BM25 function: type=BM25，input=[text]，output=[sparse]
    const fn = createBM25Function();
    expect(fn.type).toBe(FunctionType.BM25);
    expect(fn.input_field_names).toEqual(['text']);
    expect(fn.output_field_names).toEqual(['sparse']);
  });

  it('TC-4.4 field defs include id PK, vector, analyzable text, sparse, audit fields', () => {
    // 被测函数: createFullTextFieldDefs  等级: 3-High
    // （正常场景）8 字段齐备；id 为 Int64 PK；vector 为 FloatVector；text 开启 analyzer/match 且 max_length 等于 MILVUS_TEXT_MAX_LENGTH；无冗余 dataId 字段
    const fields = createFullTextFieldDefs(buildAnalyzerParams('lingua'));
    const names = fields.map((f) => f.name);
    expect(names).toContain('id');
    expect(names).toContain('vector');
    expect(names).not.toContain('dataId');
    expect(names).toContain('text');
    expect(names).toContain('sparse');
    expect(names).toContain('createTime');
    expect(names).toContain('teamId');
    expect(names).toContain('datasetId');
    expect(names).toContain('collectionId');

    const idField = fields.find((f) => f.name === 'id')!;
    expect(idField.is_primary_key).toBe(true);
    expect(idField.data_type).toBe(DataType.Int64);
    const vectorField = fields.find((f) => f.name === 'vector')!;
    expect(vectorField.data_type).toBe(DataType.FloatVector);
    const textField = fields.find((f) => f.name === 'text')!;
    expect(textField.enable_analyzer).toBe(true);
    expect(textField.enable_match).toBe(true);
    expect(textField.max_length).toBe(MILVUS_TEXT_MAX_LENGTH);
    expect(MILVUS_TEXT_MAX_LENGTH).toBe(65535);
  });

  it('TC-4.5 index params use SPARSE_INVERTED_INDEX + BM25', () => {
    // 被测函数: createFullTextIndexParams  等级: 3-High
    // （正常场景）sparse 索引为 SPARSE_INVERTED_INDEX + BM25 + {bm25_k1:1.2,bm25_b:0.75}
    const params = createFullTextIndexParams();
    const sparseIdx = params.find((p) => p.field_name === 'sparse')!;
    expect(sparseIdx.index_type).toBe('SPARSE_INVERTED_INDEX');
    expect(sparseIdx.metric_type).toBe('BM25');
    expect(sparseIdx.params).toEqual({ bm25_k1: 1.2, bm25_b: 0.75 });
    expect(MILVUS_QUERY_MAX_LENGTH).toBe(4000);
  });

  it('TC-4.6 getMilvusLanguageIdentifier returns default lingua', () => {
    // 被测函数: getMilvusLanguageIdentifier  等级: 3-High
    // （正常场景）测试环境未显式设置 MILVUS_LANGUAGE_IDENTIFIER，回退 zod 默认值 lingua
    expect(getMilvusLanguageIdentifier()).toBe('lingua');
  });

  it('TC-4.7 truncateFullTextByBytes keeps short text unchanged', () => {
    // 被测函数: truncateFullTextByBytes  等级: 3-High
    // （边界值）文本字节数未超上限, 期望: 原样返回
    expect(truncateFullTextByBytes('hello 全文', 65535)).toBe('hello 全文');
    expect(truncateFullTextByBytes('', 65535)).toBe('');
  });

  it('TC-4.8 truncateFullTextByBytes cuts Chinese text at UTF-8 byte boundary', () => {
    // 被测函数: truncateFullTextByBytes  等级: 3-High
    // （异常场景）VarChar max_length 按字节计, 中文 3 字节/字符: 30000 个"中"=90000 字节超 65535
    // 期望: 截断后 UTF-8 字节数 ≤ 65535 且为完整"中"字符(21845*3=65535), 不被 JS 字符长度误导
    const truncated = truncateFullTextByBytes('中'.repeat(30000), MILVUS_TEXT_MAX_LENGTH);
    expect(Buffer.byteLength(truncated, 'utf8')).toBeLessThanOrEqual(MILVUS_TEXT_MAX_LENGTH);
    expect(Buffer.byteLength(truncated, 'utf8')).toBe(65535);
    expect(truncated).toBe('中'.repeat(21845));
  });

  it('TC-4.9 truncateFullTextByBytes never splits a surrogate pair', () => {
    // 被测函数: truncateFullTextByBytes  等级: 3-High
    // （异常场景）emoji 是 4 字节、2 个 UTF-16 码元的代理对, 期望: 截断结果不拆代理对
    const truncated = truncateFullTextByBytes('😀'.repeat(20000), MILVUS_TEXT_MAX_LENGTH);
    expect(Buffer.byteLength(truncated, 'utf8')).toBeLessThanOrEqual(MILVUS_TEXT_MAX_LENGTH);
    // 16383*4=65532 是 ≤65535 的最大整 emoji 数;结果应恰好为完整 emoji
    expect(truncated).toBe('😀'.repeat(16383));
  });
});
