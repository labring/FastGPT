// src/adapters/searchAdapter.ts

import type { AdapterContext } from './base';
import { BaseAdapter } from './base';
import type { ChunkResult } from '../types/chunk';

export interface SearchAdapterOptions {
  preserveRawData?: boolean;
  fieldMapping?: {
    id?: string;
    content?: string;
    score?: string;
    datasetId?: string;
    sourceName?: string;
  };
}

export class SearchAdapter extends BaseAdapter<any> {
  private options: SearchAdapterOptions;

  constructor(context: AdapterContext, options: SearchAdapterOptions = {}) {
    super(context);
    this.options = options;
  }

  toDitingChunk(data: any): ChunkResult {
    const mapping = this.options.fieldMapping || {};

    return {
      id: data[mapping.id || 'id'] || data.id || '',
      content: data[mapping.content || 'content'] || data.content || '',
      score: data[mapping.score || 'score'] ?? data.score ?? 0,
      datasetId: data[mapping.datasetId || 'datasetId'] || data.dataset_id || '',
      sourceName: data[mapping.sourceName || 'sourceName'] || data.source_name || '',
      collectionId: data.collectionId || data.collection_id,
      metadata: data.metadata || {},
      searchSource: data.searchSource,
      vectorScore: data.vectorScore,
      fullTextScore: data.fullTextScore,
      providerMetadata: {
        ...(this.options.preserveRawData ? data : {}),
        q: data.q || data.query,
        a: data.a || data.answer,
        sourceId: data.sourceId || data.source_id,
        documentId: data.documentId || data.document_id,
        fileId: data.fileId || data.file_id,
        position: data.position
      },
      timestamp: data.timestamp || Date.now()
    };
  }

  fromDitingChunk(chunk: ChunkResult): any {
    const mapping = this.options.fieldMapping || {};
    const meta = (chunk.providerMetadata || {}) as Record<string, unknown>;

    return {
      [mapping.id || 'id']: chunk.id,
      [mapping.content || 'content']: chunk.content,
      [mapping.score || 'score']: chunk.score,
      [mapping.datasetId || 'datasetId']: chunk.datasetId,
      [mapping.sourceName || 'sourceName']: chunk.sourceName,
      collectionId: chunk.collectionId,
      metadata: chunk.metadata,
      q: meta.q,
      a: meta.a,
      sourceId: meta.sourceId,
      documentId: meta.documentId,
      fileId: meta.fileId,
      position: meta.position,
      ...meta
    };
  }
}
