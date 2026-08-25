import { describe, it, expect } from 'vitest'; // 必须显式导入
import { parseDatasetCsvHeaders, rawText2Chunks } from '@fastgpt/service/core/dataset/read';
import { ChunkTriggerConfigTypeEnum } from '@fastgpt/global/core/dataset/constants';

const formatChunks = (
  chunks: {
    q: string;
    a: string;
    indexes?: string[];
  }[]
) => {
  return chunks.map((chunk) => chunk.q.replace(/\s+/g, ''));
};
const formatResult = (result: string[]) => {
  return result.map((item) => item.replace(/\s+/g, ''));
};

// 最大值分块测试-小于最大值，不分块
it(`Test splitText2Chunks 1`, async () => {
  const mock = {
    text: `# A
  
af da da fda a a 

## B

阿凡撒发生的都是发大水

### c

dsgsgfsgs22

#### D

dsgsgfsgs22

##### E

dsgsgfsgs22sddddddd
`,
    result: [
      `# A
  
af da da fda a a 

## B

阿凡撒发生的都是发大水

### c

dsgsgfsgs22

#### D

dsgsgfsgs22

##### E

dsgsgfsgs22sddddddd`
    ]
  };

  const data = await rawText2Chunks({
    rawText: mock.text,
    chunkTriggerType: ChunkTriggerConfigTypeEnum.maxSize,
    chunkTriggerMinSize: 1000,
    maxSize: 20000,
    chunkSize: 512,
    backupParse: false
  });
  expect(formatChunks(data)).toEqual(formatResult(mock.result));
});
// 最大值分块测试-大于最大值，分块
it(`Test splitText2Chunks 2`, async () => {
  const mock = {
    text: `# A

af da da fda a a 

## B

阿凡撒发生的都是发大水

### c

dsgsgfsgs22

#### D

dsgsgfsgs22

##### E

dsgsgfsgs22sddddddd`,
    result: [
      `# A

af da da fda a a`,
      `# A
## B

阿凡撒发生的都是发大水`,
      `# A
## B
### c

dsgsgfsgs22`,
      `# A
## B
### c
#### D

dsgsgfsgs22`,
      `# A
## B
### c
#### D
##### E

dsgsgfsgs22sddddddd`
    ]
  };

  const data = await rawText2Chunks({
    rawText: mock.text,
    chunkTriggerType: ChunkTriggerConfigTypeEnum.maxSize,
    chunkTriggerMinSize: 10,
    maxSize: 10,
    chunkSize: 512,
    backupParse: false
  });

  expect(formatChunks(data)).toEqual(formatResult(mock.result));
});

// 最小值分块测试-大于最小值，不分块
it(`Test splitText2Chunks 3`, async () => {
  const mock = {
    text: `# A
  
  af da da fda a a 
  
  ## B
  
  阿凡撒发生的都是发大水
  
  ### c
  
  dsgsgfsgs22
  
  #### D
  
  dsgsgfsgs22
  
  ##### E
  
  dsgsgfsgs22sddddddd`,
    result: [
      `# A
  
  af da da fda a a 
  
  ## B
  
  阿凡撒发生的都是发大水
  
  ### c
  
  dsgsgfsgs22
  
  #### D
  
  dsgsgfsgs22
  
  ##### E
  
  dsgsgfsgs22sddddddd`
    ]
  };

  const data = await rawText2Chunks({
    rawText: mock.text,
    chunkTriggerType: ChunkTriggerConfigTypeEnum.minSize,
    chunkTriggerMinSize: 1000,
    maxSize: 1000,
    chunkSize: 512,
    backupParse: false
  });

  expect(formatChunks(data)).toEqual(formatResult(mock.result));
});
// 最小值分块测试-小于最小值，分块
it(`Test splitText2Chunks 4`, async () => {
  const mock = {
    text: `# A

af da da fda a a 

## B

阿凡撒发生的都是发大水

### c

dsgsgfsgs22

#### D

dsgsgfsgs22

##### E

dsgsgfsgs22sddddddd`,
    result: [
      `# A
  
  af da da fda a a`,
      `# A
  ## B
  
  阿凡撒发生的都是发大水`,
      `# A
  ## B
  ### c
  
  dsgsgfsgs22`,
      `# A
  ## B
  ### c
  #### D
  
  dsgsgfsgs22`,
      `# A
  ## B
  ### c
  #### D
  ##### E
  
  dsgsgfsgs22sddddddd`
    ]
  };

  const data = await rawText2Chunks({
    rawText: mock.text,
    chunkTriggerType: ChunkTriggerConfigTypeEnum.minSize,
    chunkTriggerMinSize: 10,
    maxSize: 10,
    chunkSize: 512,
    backupParse: false
  });

  expect(formatChunks(data)).toEqual(formatResult(mock.result));
});

// 强制分块测试-小于最小值和最大值
it(`Test splitText2Chunks 5`, async () => {
  const mock = {
    text: `# A

af da da fda a a 

## B

阿凡撒发生的都是发大水

### c

dsgsgfsgs22

#### D

dsgsgfsgs22

##### E

dsgsgfsgs22sddddddd`,
    result: [
      `# A
    
    af da da fda a a`,
      `# A
    ## B
    
    阿凡撒发生的都是发大水`,
      `# A
    ## B
    ### c
    
    dsgsgfsgs22`,
      `# A
    ## B
    ### c
    #### D
    
    dsgsgfsgs22`,
      `# A
    ## B
    ### c
    #### D
    ##### E
    
    dsgsgfsgs22sddddddd`
    ]
  };

  const data = await rawText2Chunks({
    rawText: mock.text,
    chunkTriggerType: ChunkTriggerConfigTypeEnum.forceChunk,
    chunkTriggerMinSize: 1000,
    maxSize: 10000,
    chunkSize: 512,
    backupParse: false
  });

  expect(formatChunks(data)).toEqual(formatResult(mock.result));
});

// 强制分块测试-大于最小值
it(`Test splitText2Chunks 6`, async () => {
  const mock = {
    text: `# A
  
af da da fda a a 

## B

阿凡撒发生的都是发大水

### c

dsgsgfsgs22

#### D

dsgsgfsgs22

##### E

dsgsgfsgs22sddddddd`,
    result: [
      `# A
      
      af da da fda a a`,
      `# A
      ## B
      
      阿凡撒发生的都是发大水`,
      `# A
      ## B
      ### c
      
      dsgsgfsgs22`,
      `# A
      ## B
      ### c
      #### D
      
      dsgsgfsgs22`,
      `# A
      ## B
      ### c
      #### D
      ##### E
      
      dsgsgfsgs22sddddddd`
    ]
  };

  const data = await rawText2Chunks({
    rawText: mock.text,
    chunkTriggerType: ChunkTriggerConfigTypeEnum.forceChunk,
    chunkTriggerMinSize: 10,
    maxSize: 10000,
    chunkSize: 512,
    backupParse: false
  });

  expect(formatChunks(data)).toEqual(formatResult(mock.result));
});

it('should preserve escaped pipe in markdown table cells when splitting', async () => {
  const text = `| 项目系数 | 垫付首年考核费 \\| cc | 4.90% |
| --- | --- | --- |
| 项目系数 | 投资回报率 \\| abcd | 6.86% |
| 项目系数 | 当年运营管理成本,cc | 1,500,000.00 |`;

  const data = await rawText2Chunks({
    rawText: text,
    chunkTriggerType: ChunkTriggerConfigTypeEnum.forceChunk,
    chunkTriggerMinSize: 10,
    maxSize: 10000,
    chunkSize: 80,
    backupParse: false
  });

  expect(data.length).toBeGreaterThan(1);

  for (const chunk of data) {
    const lines = chunk.q.split('\n');
    expect(lines[0]).toBe('| 项目系数 | 垫付首年考核费 \\| cc | 4.90% |');
    expect(lines[1]).toBe('| --- | --- | --- |');
    expect(lines[1]).not.toBe('| --- | --- | --- | --- |');
  }

  expect(data.map((chunk) => chunk.q).join('\n')).toContain('投资回报率 \\| abcd');
});

it('should skip markdown table header-only chunks when building dataset chunks', async () => {
  const data = await rawText2Chunks({
    rawText: `| id | payload | note |
| --- | --- | --- |`,
    chunkTriggerType: ChunkTriggerConfigTypeEnum.forceChunk,
    chunkTriggerMinSize: 10,
    maxSize: 10000,
    chunkSize: 40,
    backupParse: false
  });

  expect(data).toEqual([]);
});

it('should not create header-only chunk for markdown table with a long first row', async () => {
  const data = await rawText2Chunks({
    rawText: `| id | payload | note |
| --- | --- | --- |
| 1 | ${'𠮷'.repeat(3000)} | old split keeps this single markdown table row as one index chunk |`,
    chunkTriggerType: ChunkTriggerConfigTypeEnum.forceChunk,
    chunkTriggerMinSize: 10,
    maxSize: 10000,
    chunkSize: 512,
    backupParse: false
  });

  expect(data.length).toBeGreaterThan(0);
  expect(data.map((chunk) => chunk.q)).not.toContain(
    '| id | payload | note |\n| --- | --- | --- |'
  );
  expect(data.map((chunk) => chunk.q).join('\n')).toContain('| 1 |');
});

// ── backupParse (parseDatasetBackup2Chunks) ──

function buildCsv(rows: string[][]): string {
  return rows.map((row) => row.join(',')).join('\n');
}

describe('parseDatasetCsvHeaders', () => {
  it('accepts current and legacy dataset CSV headers', () => {
    expect(parseDatasetCsvHeaders(['metadata', 'index', 'a', 'q', 'index'])).toEqual({
      normalized: ['metadata', 'index', 'a', 'q', 'index'],
      typedHeader: true,
      validTypedHeader: true
    });
    expect(parseDatasetCsvHeaders([' q ', ' A ', 'indexes'])).toEqual({
      normalized: ['q', 'a', 'indexes'],
      typedHeader: true,
      validTypedHeader: true
    });
  });

  it('rejects empty, duplicate required, duplicate metadata, and unknown headers', () => {
    expect(parseDatasetCsvHeaders([]).validTypedHeader).toBe(false);
    expect(parseDatasetCsvHeaders(['q', 'q', 'a']).validTypedHeader).toBe(false);
    expect(parseDatasetCsvHeaders(['q', 'a', 'a']).validTypedHeader).toBe(false);
    expect(parseDatasetCsvHeaders(['q', 'a', 'metadata', 'metadata']).validTypedHeader).toBe(false);
    expect(parseDatasetCsvHeaders(['q', 'a', 'source'])).toEqual({
      normalized: ['q', 'a', 'source'],
      typedHeader: false,
      validTypedHeader: false
    });
  });
});

describe('rawText2Chunks backupParse', () => {
  it('accepts typed CSV headers in any order and parses one JSON metadata column', async () => {
    const csv =
      'metadata,index,a,q,index\n"{""source"":""crm"",""rank"":3}",tag1,answer,question,tag2';
    const result = await rawText2Chunks({ rawText: csv, backupParse: true });

    expect(result).toEqual([
      {
        q: 'question',
        a: 'answer',
        indexes: ['tag1', 'tag2'],
        metadata: { source: 'crm', rank: 3 },
        imageIdList: undefined
      }
    ]);
  });

  it('returns empty array when CSV has only a header row', async () => {
    const csv = buildCsv([['q', 'a']]);
    const result = await rawText2Chunks({ rawText: csv, backupParse: true });
    expect(result).toEqual([]);
  });

  it('detects a semicolon delimiter when a short CSV has a trailing blank line', async () => {
    const result = await rawText2Chunks({
      rawText: 'q;a\r\nquestion;answer\r\n',
      backupParse: true
    });

    expect(result).toEqual([
      {
        q: 'question',
        a: 'answer',
        indexes: [],
        metadata: undefined,
        imageIdList: undefined
      }
    ]);
  });

  it('returns empty array for empty string', async () => {
    const result = await rawText2Chunks({ rawText: '', backupParse: true });
    expect(result).toEqual([]);
  });

  it('parses basic q and a columns', async () => {
    const csv = buildCsv([
      ['q', 'a'],
      ['What is FastGPT?', 'A knowledge base QA system'],
      ['How to deploy?', 'Use docker-compose']
    ]);
    const result = await rawText2Chunks({ rawText: csv, backupParse: true });
    expect(result).toEqual([
      {
        q: 'What is FastGPT?',
        a: 'A knowledge base QA system',
        indexes: [],
        metadata: undefined,
        imageIdList: undefined
      },
      {
        q: 'How to deploy?',
        a: 'Use docker-compose',
        indexes: [],
        metadata: undefined,
        imageIdList: undefined
      }
    ]);
  });

  it('handles headers with mixed case by lowercasing them', async () => {
    const csv = buildCsv([
      ['Q', 'A'],
      ['question', 'answer']
    ]);
    const result = await rawText2Chunks({ rawText: csv, backupParse: true });
    expect(result).toEqual([
      { q: 'question', a: 'answer', indexes: [], metadata: undefined, imageIdList: undefined }
    ]);
  });

  it('trims whitespace from headers', async () => {
    const csv = buildCsv([
      [' q ', ' a '],
      ['question', 'answer']
    ]);
    const result = await rawText2Chunks({ rawText: csv, backupParse: true });
    expect(result).toEqual([
      { q: 'question', a: 'answer', indexes: [], metadata: undefined, imageIdList: undefined }
    ]);
  });

  it('parses indexes column into an array', async () => {
    const csv = buildCsv([
      ['q', 'a', 'indexes'],
      ['question', 'answer', 'tag1 tag2']
    ]);
    const result = await rawText2Chunks({ rawText: csv, backupParse: true });
    expect(result[0].indexes).toEqual(['tag1 tag2']);
  });

  it('keeps trailing indexes from the legacy q,a,indexes export format', async () => {
    const csv = buildCsv([
      ['q', 'a', 'indexes'],
      ['question', 'answer', 'tag1', 'tag2', 'tag3']
    ]);
    const result = await rawText2Chunks({ rawText: csv, backupParse: true });
    expect(result[0].indexes).toEqual(['tag1', 'tag2', 'tag3']);
  });

  it('filters out empty index values', async () => {
    const csv = buildCsv([
      ['q', 'a', 'indexes'],
      ['question', 'answer', '']
    ]);
    const result = await rawText2Chunks({ rawText: csv, backupParse: true });
    expect(result[0].indexes).toEqual([]);
  });

  it('collects extra columns as metadata', async () => {
    const csv = buildCsv([
      ['q', 'a', 'category', 'source'],
      ['What is FastGPT?', 'A QA system', 'docs', 'official']
    ]);
    const result = await rawText2Chunks({ rawText: csv, backupParse: true });
    expect(result[0].metadata).toEqual({ category: 'docs', source: 'official' });
  });

  it('preserves original-case metadata keys (not lowercased)', async () => {
    const csv = buildCsv([
      ['q', 'a', 'Category', 'SourceURL'],
      ['question', 'answer', 'docs', 'https://example.com']
    ]);
    const result = await rawText2Chunks({ rawText: csv, backupParse: true });
    expect(result[0].metadata).toEqual({
      Category: 'docs',
      SourceURL: 'https://example.com'
    });
  });

  it('excludes empty metadata values from the metadata object', async () => {
    const csv = buildCsv([
      ['q', 'a', 'category', 'source'],
      ['question', 'answer', '', '']
    ]);
    const result = await rawText2Chunks({ rawText: csv, backupParse: true });
    expect(result[0].metadata).toBeUndefined();
  });

  it('includes only non-empty metadata values (mixed)', async () => {
    const csv = buildCsv([
      ['q', 'a', 'category', 'source'],
      ['question', 'answer', 'docs', '']
    ]);
    const result = await rawText2Chunks({ rawText: csv, backupParse: true });
    expect(result[0].metadata).toEqual({ category: 'docs' });
  });

  it('filters out rows where both q and a are empty', async () => {
    const csv = buildCsv([
      ['q', 'a'],
      ['', ''],
      ['valid question', 'valid answer'],
      ['', '']
    ]);
    const result = await rawText2Chunks({ rawText: csv, backupParse: true });
    expect(result).toHaveLength(1);
    expect(result[0].q).toBe('valid question');
  });

  it('keeps rows where only q is present', async () => {
    const csv = buildCsv([
      ['q', 'a'],
      ['only question', '']
    ]);
    const result = await rawText2Chunks({ rawText: csv, backupParse: true });
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(expect.objectContaining({ q: 'only question', a: '' }));
  });

  it('keeps rows where only a is present', async () => {
    const csv = buildCsv([
      ['q', 'a'],
      ['', 'only answer']
    ]);
    const result = await rawText2Chunks({ rawText: csv, backupParse: true });
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(expect.objectContaining({ q: '', a: 'only answer' }));
  });

  it('handles missing q column by returning empty string for q', async () => {
    const csv = buildCsv([
      ['a', 'notes'],
      ['answer text', 'some notes']
    ]);
    const result = await rawText2Chunks({ rawText: csv, backupParse: true });
    expect(result).toEqual([
      {
        q: '',
        a: 'answer text',
        indexes: [],
        metadata: { notes: 'some notes' },
        imageIdList: undefined
      }
    ]);
  });

  it('handles missing a column by returning empty string for a', async () => {
    const csv = buildCsv([
      ['q', 'notes'],
      ['question text', 'some notes']
    ]);
    const result = await rawText2Chunks({ rawText: csv, backupParse: true });
    expect(result).toEqual([
      {
        q: 'question text',
        a: '',
        indexes: [],
        metadata: { notes: 'some notes' },
        imageIdList: undefined
      }
    ]);
  });

  it('propagates imageIdList to every chunk', async () => {
    const csv = buildCsv([
      ['q', 'a'],
      ['q1', 'a1'],
      ['q2', 'a2']
    ]);
    const result = await rawText2Chunks({
      rawText: csv,
      backupParse: true,
      imageIdList: ['img1', 'img2']
    });
    expect(result).toHaveLength(2);
    expect(result[0].imageIdList).toEqual(['img1', 'img2']);
    expect(result[1].imageIdList).toEqual(['img1', 'img2']);
  });

  it('handles multiple indexes columns', async () => {
    const csv = buildCsv([
      ['q', 'a', 'indexes', 'indexes'],
      ['question', 'answer', 'tag1', 'tag2']
    ]);
    const result = await rawText2Chunks({ rawText: csv, backupParse: true });
    expect(result[0].indexes).toEqual(['tag1', 'tag2']);
  });

  it('handles a complex CSV with q, a, indexes, and multiple metadata columns', async () => {
    const csv = buildCsv([
      ['q', 'a', 'indexes', 'category', 'priority', 'source'],
      ['What is FastGPT?', 'A QA system', 'intro docs', 'documentation', 'high', 'official'],
      ['How to install?', 'Run docker', '', 'guide', '', '']
    ]);
    const result = await rawText2Chunks({ rawText: csv, backupParse: true });
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      q: 'What is FastGPT?',
      a: 'A QA system',
      indexes: ['intro docs'],
      metadata: { category: 'documentation', priority: 'high', source: 'official' },
      imageIdList: undefined
    });
    expect(result[1]).toEqual({
      q: 'How to install?',
      a: 'Run docker',
      indexes: [],
      metadata: { category: 'guide' },
      imageIdList: undefined
    });
  });

  it('handles CSV values with commas by quoting (PapaParse built-in)', async () => {
    const csv =
      'q,a,category\n"What is FastGPT, really?","A knowledge base QA system with, many features",docs';
    const result = await rawText2Chunks({ rawText: csv, backupParse: true });
    expect(result).toHaveLength(1);
    expect(result[0].q).toBe('What is FastGPT, really?');
    expect(result[0].a).toBe('A knowledge base QA system with, many features');
    expect(result[0].metadata).toEqual({ category: 'docs' });
  });

  it('preserves order of rows from CSV', async () => {
    const csv = buildCsv([
      ['q', 'a'],
      ['first', '1'],
      ['second', '2'],
      ['third', '3']
    ]);
    const result = await rawText2Chunks({ rawText: csv, backupParse: true });
    expect(result.map((c) => c.q)).toEqual(['first', 'second', 'third']);
  });

  it('does not trim whitespace from q/a values', async () => {
    const csv = buildCsv([
      ['q', 'a'],
      ['  question with spaces  ', '  answer with spaces  ']
    ]);
    const result = await rawText2Chunks({ rawText: csv, backupParse: true });
    expect(result[0].q).toBe('  question with spaces  ');
    expect(result[0].a).toBe('  answer with spaces  ');
  });
});
