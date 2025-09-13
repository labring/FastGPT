import { it, expect } from 'vitest'; // 必须显式导入
import { rawText2Chunks } from '@fastgpt/service/core/dataset/read';
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
