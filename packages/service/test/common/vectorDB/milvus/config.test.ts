import { describe, it, expect } from 'vitest';
import {
  getMilvusCollectionDefinitions,
  createBM25Function,
  isAnalyzerError,
  extractErrorCode
} from '@fastgpt/service/common/vectorDB/milvus/config';
import { FunctionType } from '@zilliz/milvus2-sdk-node';

describe('milvus/config', () => {
  describe('getMilvusCollectionDefinitions', () => {
    it('includes text/sparse fields for V26', () => {
      const defs = getMilvusCollectionDefinitions(true);
      const main = defs.find((d) => d.name === 'modeldata')!;
      const fieldNames = main.fields.map((f) => f.name);
      expect(fieldNames).toContain('text');
      expect(fieldNames).toContain('sparse');
      expect(fieldNames).not.toContain('metadata');
    });

    it('excludes text/sparse fields for V24', () => {
      const defs = getMilvusCollectionDefinitions(false);
      const main = defs.find((d) => d.name === 'modeldata')!;
      const fieldNames = main.fields.map((f) => f.name);
      expect(fieldNames).not.toContain('text');
      expect(fieldNames).not.toContain('sparse');
    });

    it('defines one collection', () => {
      const defs = getMilvusCollectionDefinitions(true);
      expect(defs).toHaveLength(1);
      expect(defs.map((d) => d.name)).toEqual(['modeldata']);
    });
  });

  describe('createBM25Function', () => {
    it('has correct configuration', () => {
      const fn = createBM25Function();
      expect(fn.name).toBe('text_bm25_emb');
      expect(fn.type).toBe(FunctionType.BM25);
      expect(fn.input_field_names).toEqual(['text']);
      expect(fn.output_field_names).toEqual(['sparse']);
    });
  });

  describe('error helpers', () => {
    it('extracts error code', () => {
      expect(extractErrorCode({ code: 'ANALYZER_NOT_SUPPORTED' })).toBe('ANALYZER_NOT_SUPPORTED');
    });

    it('detects analyzer errors', () => {
      expect(isAnalyzerError({ code: 'ANALYZER_NOT_SUPPORTED' })).toBe(true);
      expect(isAnalyzerError({ code: 'UNKNOWN' })).toBe(false);
    });
  });
});
