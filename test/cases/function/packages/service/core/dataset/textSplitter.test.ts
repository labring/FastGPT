import { it, expect } from 'vitest'; // 必须显式导入
import { rawText2Chunks } from '@fastgpt/service/core/dataset/read';
import { ChunkTriggerConfigTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { splitText2Chunks } from '@fastgpt/global/common/string/textSplitter';

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

// HTML表格分割测试 - 不超出maxSize
it(`Test splitText2Chunks 15 - HTML table split`, () => {
  const mock = {
    text: `测试的呀,第一个HTML表格
<table>
<tbody>
<tr><td>序号</td><td>姓名</td><td>年龄</td><td>职业</td><td>城市</td></tr>
<tr><td>1</td><td>张三</td><td>25</td><td>工程师</td><td>北京</td></tr>
<tr><td>2</td><td>李四</td><td>30</td><td>教师</td><td>上海</td></tr>
<tr><td>3</td><td>王五</td><td>28</td><td>医生</td><td>广州</td></tr>
<tr><td>6</td><td>周八</td><td>32</td><td>会计</td><td>成都</td></tr>
<tr><td>4</td><td>赵六</td><td>35</td><td>律师</td><td>深圳</td></tr>
<tr><td>5</td><td>孙七</td><td>27</td><td>设计师</td><td>杭州</td></tr>
<tr><td>6</td><td>周八</td><td>32</td><td>会计</td><td>成都</td></tr>
<tr><td>6</td><td>周八</td><td>32</td><td>会计</td><td>成都</td></tr>
<tr><td>7</td><td>吴九</td><td>29</td><td>销售</td><td>武汉</td></tr>
<tr><td>8</td><td>郑十</td><td>31</td><td>记者</td><td>南京</td></tr>
<tr><td>9</td><td>刘一</td><td>33</td><td>建筑师</td><td>天津</td></tr>
<tr><td>10</td><td>陈二</td><td>26</td><td>程序员</td><td>重庆</td></tr>
<tr><td>1000</td><td>黄末</td><td>28</td><td>作家</td><td>厦门</td></tr>
<tr><td>1001</td><td>杨一</td><td>34</td><td>程序员</td><td>厦门</td></tr>
<tr><td>1002</td><td>杨二</td><td>34</td><td>程序员</td><td>厦门</td></tr>
<tr><td>1003</td><td>杨三</td><td>34</td><td>程序员</td><td>厦门</td></tr>
<tr><td>6</td><td>周八</td><td>32</td><td>会计</td><td>成都</td></tr>
<tr><td>1004</td><td>杨四</td><td>34</td><td>程序员</td><td>厦门</td></tr>
<tr><td>1005</td><td>杨五</td><td>34</td><td>程序员</td><td>厦门</td></tr>
<tr><td>1000</td><td>黄末</td><td>28</td><td>作家</td><td>厦门</td></tr>
<tr><td>1000</td><td>黄末</td><td>28</td><td>作家</td><td>厦门</td></tr>
<tr><td>1000</td><td>黄末</td><td>28</td><td>作家</td><td>厦门</td></tr>
<tr><td>9</td><td>刘一</td><td>33</td><td>建筑师</td><td>天津</td></tr>
<tr><td>10</td><td>陈二</td><td>26</td><td>程序员</td><td>重庆</td></tr>
<tr><td>1000</td><td>黄末</td><td>28</td><td>作家</td><td>厦门</td></tr>
<tr><td>1001</td><td>杨一</td><td>34</td><td>程序员</td><td>厦门</td></tr>
<tr><td>1002</td><td>杨二</td><td>34</td><td>程序员</td><td>厦门</td></tr>
<tr><td>1003</td><td>杨三</td><td>34</td><td>程序员</td><td>厦门</td></tr>
<tr><td>1004</td><td>杨四</td><td>34</td><td>程序员</td><td>厦门</td></tr>
<tr><td>1005</td><td>杨五</td><td>34</td><td>程序员</td><td>厦门</td></tr>
<tr><td>6</td><td>周八</td><td>32</td><td>会计</td><td>成都</td></tr>
<tr><td>1000</td><td>黄末</td><td>28</td><td>作家</td><td>厦门</td></tr>
<tr><td>1000</td><td>黄末</td><td>28</td><td>作家</td><td>厦门</td></tr>
<tr><td>1000</td><td>黄末</td><td>28</td><td>作家</td><td>厦门</td></tr>
</tbody>
</table>

这是第二段了，第二个HTML表格

<table>
<tbody>
<tr><td>序号</td><td>姓名</td><td>年龄</td><td>职业</td><td>城市</td></tr>
<tr><td>1</td><td>张三</td><td>25</td><td>工程师</td><td>北京</td></tr>
<tr><td>6</td><td>周八</td><td>32</td><td>会计</td><td>成都</td></tr>
<tr><td>2</td><td>李四</td><td>30</td><td>教师</td><td>上海</td></tr>
<tr><td>3</td><td>王五</td><td>28</td><td>医生</td><td>广州</td></tr>
<tr><td>4</td><td>赵六</td><td>35</td><td>律师</td><td>深圳</td></tr>
<tr><td>5</td><td>孙七</td><td>27</td><td>设计师</td><td>杭州</td></tr>
<tr><td>6</td><td>周八</td><td>32</td><td>会计</td><td>成都</td></tr>
<tr><td>7</td><td>吴九</td><td>29</td><td>销售</td><td>武汉</td></tr>
<tr><td>8</td><td>郑十</td><td>31</td><td>记者</td><td>南京</td></tr>
<tr><td>9</td><td>刘一</td><td>33</td><td>建筑师</td><td>天津</td></tr>
<tr><td>10</td><td>陈二</td><td>26</td><td>程序员</td><td>重庆</td></tr>
<tr><td>10004</td><td>黄末</td><td>28</td><td>作家</td><td>厦门</td></tr>
<tr><td>10013</td><td>杨一</td><td>34</td><td>程序员</td><td>厦门</td></tr>
</tbody>
</table>

结束了

<table>
<tbody>
<tr><td>序号22</td><td>姓名</td><td>年龄</td><td>职业</td><td>城市</td></tr>
<tr><td>1</td><td>张三</td><td>25</td><td>工程师</td><td>北京</td></tr>
<tr><td>2</td><td>李四</td><td>30</td><td>教师</td><td>上海</td></tr>
<tr><td>3</td><td>王五</td><td>28</td><td>医生</td><td>广州</td></tr>
<tr><td>4</td><td>赵六</td><td>35</td><td>律师</td><td>深圳</td></tr>
<tr><td>5</td><td>孙七</td><td>27</td><td>设计师</td><td>杭州</td></tr>
<tr><td>6</td><td>周八</td><td>32</td><td>会计</td><td>成都</td></tr>
<tr><td>6</td><td>周八</td><td>32</td><td>会计</td><td>成都</td></tr>
<tr><td>7</td><td>吴九</td><td>29</td><td>销售</td><td>武汉</td></tr>
<tr><td>8</td><td>郑十</td><td>31</td><td>记者</td><td>南京</td></tr>
<tr><td>9</td><td>刘一</td><td>33</td><td>建筑师</td><td>天津</td></tr>
<tr><td>10</td><td>陈二</td><td>26</td><td>程序员</td><td>重庆</td></tr>
<tr><td>10002</td><td>黄末</td><td>28</td><td>作家</td><td>厦门</td></tr>
<tr><td>10012</td><td>杨一</td><td>34</td><td>程序员</td><td>厦门</td></tr>
</tbody>
</table>
`,
    result: [
      `测试的呀,第一个HTML表格
<table>
<tbody>
<tr><td>序号</td><td>姓名</td><td>年龄</td><td>职业</td><td>城市</td></tr>
<tr><td>1</td><td>张三</td><td>25</td><td>工程师</td><td>北京</td></tr>
<tr><td>2</td><td>李四</td><td>30</td><td>教师</td><td>上海</td></tr>
<tr><td>3</td><td>王五</td><td>28</td><td>医生</td><td>广州</td></tr>
<tr><td>6</td><td>周八</td><td>32</td><td>会计</td><td>成都</td></tr>
<tr><td>4</td><td>赵六</td><td>35</td><td>律师</td><td>深圳</td></tr>
<tr><td>5</td><td>孙七</td><td>27</td><td>设计师</td><td>杭州</td></tr>
<tr><td>6</td><td>周八</td><td>32</td><td>会计</td><td>成都</td></tr>
<tr><td>6</td><td>周八</td><td>32</td><td>会计</td><td>成都</td></tr>
<tr><td>7</td><td>吴九</td><td>29</td><td>销售</td><td>武汉</td></tr>
<tr><td>8</td><td>郑十</td><td>31</td><td>记者</td><td>南京</td></tr>
<tr><td>9</td><td>刘一</td><td>33</td><td>建筑师</td><td>天津</td></tr>
<tr><td>10</td><td>陈二</td><td>26</td><td>程序员</td><td>重庆</td></tr>
<tr><td>1000</td><td>黄末</td><td>28</td><td>作家</td><td>厦门</td></tr>
<tr><td>1001</td><td>杨一</td><td>34</td><td>程序员</td><td>厦门</td></tr>
<tr><td>1002</td><td>杨二</td><td>34</td><td>程序员</td><td>厦门</td></tr>
<tr><td>1003</td><td>杨三</td><td>34</td><td>程序员</td><td>厦门</td></tr>
</tbody>
</table>`,
      `<table>
<tbody>
<tr><td>序号</td><td>姓名</td><td>年龄</td><td>职业</td><td>城市</td></tr>
<tr><td>6</td><td>周八</td><td>32</td><td>会计</td><td>成都</td></tr>
<tr><td>1004</td><td>杨四</td><td>34</td><td>程序员</td><td>厦门</td></tr>
<tr><td>1005</td><td>杨五</td><td>34</td><td>程序员</td><td>厦门</td></tr>
<tr><td>1000</td><td>黄末</td><td>28</td><td>作家</td><td>厦门</td></tr>
<tr><td>1000</td><td>黄末</td><td>28</td><td>作家</td><td>厦门</td></tr>
<tr><td>1000</td><td>黄末</td><td>28</td><td>作家</td><td>厦门</td></tr>
<tr><td>9</td><td>刘一</td><td>33</td><td>建筑师</td><td>天津</td></tr>
<tr><td>10</td><td>陈二</td><td>26</td><td>程序员</td><td>重庆</td></tr>
<tr><td>1000</td><td>黄末</td><td>28</td><td>作家</td><td>厦门</td></tr>
<tr><td>1001</td><td>杨一</td><td>34</td><td>程序员</td><td>厦门</td></tr>
<tr><td>1002</td><td>杨二</td><td>34</td><td>程序员</td><td>厦门</td></tr>
<tr><td>1003</td><td>杨三</td><td>34</td><td>程序员</td><td>厦门</td></tr>
<tr><td>1004</td><td>杨四</td><td>34</td><td>程序员</td><td>厦门</td></tr>
<tr><td>1005</td><td>杨五</td><td>34</td><td>程序员</td><td>厦门</td></tr>
<tr><td>6</td><td>周八</td><td>32</td><td>会计</td><td>成都</td></tr>
<tr><td>1000</td><td>黄末</td><td>28</td><td>作家</td><td>厦门</td></tr>
<tr><td>1000</td><td>黄末</td><td>28</td><td>作家</td><td>厦门</td></tr>
</tbody>
</table>`,
      `这是第二段了，第二个HTML表格

<table>
<tbody>
<tr><td>序号</td><td>姓名</td><td>年龄</td><td>职业</td><td>城市</td></tr>
<tr><td>1</td><td>张三</td><td>25</td><td>工程师</td><td>北京</td></tr>
<tr><td>6</td><td>周八</td><td>32</td><td>会计</td><td>成都</td></tr>
<tr><td>2</td><td>李四</td><td>30</td><td>教师</td><td>上海</td></tr>
<tr><td>3</td><td>王五</td><td>28</td><td>医生</td><td>广州</td></tr>
<tr><td>4</td><td>赵六</td><td>35</td><td>律师</td><td>深圳</td></tr>
<tr><td>5</td><td>孙七</td><td>27</td><td>设计师</td><td>杭州</td></tr>
<tr><td>6</td><td>周八</td><td>32</td><td>会计</td><td>成都</td></tr>
<tr><td>7</td><td>吴九</td><td>29</td><td>销售</td><td>武汉</td></tr>
<tr><td>8</td><td>郑十</td><td>31</td><td>记者</td><td>南京</td></tr>
<tr><td>9</td><td>刘一</td><td>33</td><td>建筑师</td><td>天津</td></tr>
<tr><td>10</td><td>陈二</td><td>26</td><td>程序员</td><td>重庆</td></tr>
<tr><td>10004</td><td>黄末</td><td>28</td><td>作家</td><td>厦门</td></tr>
<tr><td>10013</td><td>杨一</td><td>34</td><td>程序员</td><td>厦门</td></tr>
</tbody>
</table>`,
      `结束了

<table>
<tbody>
<tr><td>序号22</td><td>姓名</td><td>年龄</td><td>职业</td><td>城市</td></tr>
<tr><td>1</td><td>张三</td><td>25</td><td>工程师</td><td>北京</td></tr>
<tr><td>2</td><td>李四</td><td>30</td><td>教师</td><td>上海</td></tr>
<tr><td>3</td><td>王五</td><td>28</td><td>医生</td><td>广州</td></tr>
<tr><td>4</td><td>赵六</td><td>35</td><td>律师</td><td>深圳</td></tr>
<tr><td>5</td><td>孙七</td><td>27</td><td>设计师</td><td>杭州</td></tr>
<tr><td>6</td><td>周八</td><td>32</td><td>会计</td><td>成都</td></tr>
<tr><td>6</td><td>周八</td><td>32</td><td>会计</td><td>成都</td></tr>
<tr><td>7</td><td>吴九</td><td>29</td><td>销售</td><td>武汉</td></tr>
<tr><td>8</td><td>郑十</td><td>31</td><td>记者</td><td>南京</td></tr>
<tr><td>9</td><td>刘一</td><td>33</td><td>建筑师</td><td>天津</td></tr>
<tr><td>10</td><td>陈二</td><td>26</td><td>程序员</td><td>重庆</td></tr>
<tr><td>10002</td><td>黄末</td><td>28</td><td>作家</td><td>厦门</td></tr>
<tr><td>10012</td><td>杨一</td><td>34</td><td>程序员</td><td>厦门</td></tr>
</tbody>
</table>`
    ]
  };

  const { chunks } = splitText2Chunks({ text: mock.text, chunkSize: 300 });

  expect(chunks).toEqual(mock.result);
});

// HTML表格合并测试 - 带thead的复杂表格
it(`Test splitText2Chunks 16 - HTML table split with thead`, () => {
  const mock = {
    text: `
## 4.1、关键假设及盈利预测

公司医药工业产品线按治疗领域分心血管类、补益类、清热类、妇科类和其他药品,商业分部包含自有产品销售,相应有分部间抵消,我们分别给予营收增速和毛利率假设, 如下:

1)心脑血管类：心脑血管类为公司核心优势产品,产品包括安宫牛黄丸、牛黄清心丸、同仁堂大活络丸等,2021-2023 年心脑血管类产品营收增速逐年下滑, 毛利率受主要原材料牛黄和麝香价格涨幅较大影响,毛利率承压。我们分别假设 2024-2026 年,心脑血管类产品营收增速分别为 0%、8%和 10%,2025 年受消费上升带动开始恢复性增长,毛利率分别为 47%、50%和 52%,毛利率逐年提升,反映牛黄进口试点后,牛黄原料成本压力缓解。

2)补益类：补益类是公司第二大产品线,包括六味地黄丸、五子衍宗丸等。 我们分别假设 2024-2026 年补益类产品营收年增长 8%、10%和 12%,毛利率均保持稳定为 37.5%。

3)妇科类：妇科类产品包括乌鸡白凤丸、坤宝丸等,历年销售比较平稳。我们假设 2024-2026 年妇科类产品年增长 5%,毛利率维持稳定在 42%。

4)清热类：清热类产品与流行性疾病相关,2023 年为流感大年,感冒清热类产品销售相对旺盛,基数较高。我们假设 2024-2026 年清热类产品年增长-15%、8% 和 10%, 2024 年负增长, 反映上 2023 年基数较高和 2024 年流行性疾病小年影响, 毛利率稳定为 35.0%。

5)其他产品：我们假设 2024-2026 年其他中药品种营收年增长 5%、10%和 15%, 毛利率稳定保持 41%。

6)医药商业：医药商业营收增长主要是旗下同仁堂商业零售门店带动, 2023-2024H1 门店新开显著提速,2024 年上半年新开 116 家门店。我们假设 2024-2026 年医药商业年均增长 9%,毛利率保持 31%水平不变。

7)分部抵消：公司医药商业销售自产药品比例逐年提升,2023 年分部抵消 34.6 亿元,占医药工业营收 31.3%左右,我们假设 2024-2026 年,分部间抵消占医药工业营收分别为 33%、34%和 35%,毛利率为 -2%。



表 4：同仁堂主营业务关键假设及营收拆分

<table>
<thead>
<tr><th>同仁堂经营拆分：</th><th>单位</th><th>2021A</th><th>2022A</th><th>2023A</th><th>2024E</th><th>2025E</th><th>2026E</th></tr>
</thead>
<tbody>
<tr><td>合并营业收入</td><td>亿元</td><td>146.03</td><td>153.72</td><td>178.61</td><td>187.68</td><td>203.30</td><td>222.68</td></tr>
<tr><td>同比</td><td>%</td><td>13.86%</td><td>5.27%</td><td>16.19%</td><td>5.08%</td><td>8.33%</td><td>9.53%</td></tr>
<tr><td>毛利率</td><td>%</td><td>47.62%</td><td>48.80%</td><td>47.29%</td><td>44.53%</td><td>45.50%</td><td>46.46%</td></tr>
<tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td>分产品</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td>一、医药工业分部</td><td>亿元</td><td>88.76</td><td>98.40</td><td>110.79</td><td>113.42</td><td>123.59</td><td>138.44</td></tr>
<tr><td>同比</td><td>%</td><td>15.99%</td><td>10.86%</td><td>12.59%</td><td>2.38%</td><td>8.96%</td><td>12.02%</td></tr>
<tr><td>毛利率</td><td>%</td><td>48.13%</td><td>48.95%</td><td>46.96%</td><td>42.50%</td><td>43.63%</td><td>44.32%</td></tr>
<tr><td>分细分产品:</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td>1、母公司生产：心脑血管类(安宫、清心、大活络等)</td><td>亿元</td><td>36.29</td><td>40.63</td><td>43.88</td><td>43.88</td><td>47.39</td><td>52.13</td></tr>
<tr><td>同比</td><td>%</td><td>20.80%</td><td>11.97%</td><td>8.00%</td><td>0.00%</td><td>8.00%</td><td>10.00%</td></tr>
<tr><td>毛利率</td><td>%</td><td>59.96%</td><td>61.20%</td><td>57.62%</td><td>47.00%</td><td>50.00%</td><td>52.00%</td></tr>
<tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td>2、补益类(六味、金匮、五子衍宗)</td><td></td><td>14.56</td><td>15.67</td><td>17.30</td><td>18.68</td><td>20.55</td><td>23.02</td></tr>
<tr><td>同比</td><td>%</td><td>2.86%</td><td>7.62%</td><td>10.40%</td><td>8.00%</td><td>10.00%</td><td>12.00%</td></tr>
<tr><td>毛利率</td><td>%</td><td>42.45%</td><td>43.00%</td><td>37.39%</td><td>37.50%</td><td>37.50%</td><td>37.50%</td></tr>
<tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td>3、妇科类(乌鸡白凤丸、坤宝丸)</td><td></td><td>3.80</td><td>3.48</td><td>3.77</td><td>3.96</td><td>4.15</td><td>4.36</td></tr>
<tr><td>同比</td><td>%</td><td>23.83%</td><td>-8.38%</td><td>8.28%</td><td>5.00%</td><td>5.00%</td><td>5.00%</td></tr>
<tr><td>毛利率</td><td>%</td><td>40.16%</td><td>38.12%</td><td>42.38%</td><td>42.00%</td><td>42.00%</td><td>42.00%</td></tr>
<tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td>4、清热类(感冒清热颗粒、牛黄解毒)</td><td>亿元</td><td>5.24</td><td>5.29</td><td>6.14</td><td>5.22</td><td>5.64</td><td>6.20</td></tr>
<tr><td>同比</td><td>%</td><td>5.19%</td><td>0.86%</td><td>16.07%</td><td>-15.00%</td><td>8.00%</td><td>10.00%</td></tr>
<tr><td>毛利率</td><td>%</td><td>36.09%</td><td>34.39%</td><td>34.97%</td><td>35.00%</td><td>35.00%</td><td>35.00%</td></tr>
<tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td>5、其他中药品种</td><td>亿元</td><td>28.87</td><td>33.33</td><td>39.70</td><td>41.69</td><td>45.85</td><td>52.73</td></tr>
<tr><td>同比</td><td>%</td><td>18.90%</td><td>15.45%</td><td>19.11%</td><td>5.00%</td><td>10.00%</td><td>15.00%</td></tr>
<tr><td>毛利率</td><td>%</td><td>39.36%</td><td>40.25%</td><td>41.65%</td><td>41.00%</td><td>41.00%</td><td>41.00%</td></tr>
<tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td>二、商业分部(同仁堂商业)</td><td>亿元</td><td>82.41</td><td>84.80</td><td>102.5</td><td>111.7</td><td>121.7</td><td>132.7</td></tr>
<tr><td>同比</td><td>%</td><td>12.64%</td><td>2.90%</td><td>20.83%</td><td>9.00%</td><td>9.00%</td><td>9.00%</td></tr>
<tr><td>毛利率</td><td>%</td><td>31.51%</td><td>30.95%</td><td>31.11%</td><td>31.00%</td><td>31.00%</td><td>31.00%</td></tr>
<tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td>三、分部间抵消</td><td>亿元</td><td>-25.14</td><td>(29.48)</td><td>(34.64)</td><td>(37.43)</td><td>(42.02)</td><td>(48.45)</td></tr>
<tr><td>同比</td><td>%</td><td>17.32%</td><td>17.27%</td><td>17.50%</td><td>8.06%</td><td>12.26%</td><td>15.31%</td></tr>
<tr><td>毛利率</td><td>%</td><td>-3.39%</td><td>-2.05%</td><td>-1.61%</td><td>-2.0%</td><td>-2.0%</td><td>-2.0%</td></tr>
<tr><td>分部抵消营收占工业比例</td><td>%</td><td>28.32%</td><td>29.96%</td><td>31.27%</td><td>33.0%</td><td>34.0%</td><td>35.0%</td></tr>
</tbody>
</table>

资料来源：Wind, 诚通证券研究所



综上,我们预测公司 2024-2026 年,营业收入分别为 187.7/203.3/222.7 亿元, 分别同比增 5.1%/8.3%/9.5%；归母净利润分别为 16.7/19.4/22.6 亿元,分别同比增 0.3%/15.8%/16.7%; 每股 EPS 分别为 1.22/1.41/1.65 元; 毛利率分别为 44.5%/45.5%/46.5%。`,
    result: [
      `## 4.1、关键假设及盈利预测

公司医药工业产品线按治疗领域分心血管类、补益类、清热类、妇科类和其他药品,商业分部包含自有产品销售,相应有分部间抵消,我们分别给予营收增速和毛利率假设, 如下:

1)心脑血管类：心脑血管类为公司核心优势产品,产品包括安宫牛黄丸、牛黄清心丸、同仁堂大活络丸等,2021-2023 年心脑血管类产品营收增速逐年下滑, 毛利率受主要原材料牛黄和麝香价格涨幅较大影响,毛利率承压。我们分别假设 2024-2026 年,心脑血管类产品营收增速分别为 0%、8%和 10%,2025 年受消费上升带动开始恢复性增长,毛利率分别为 47%、50%和 52%,毛利率逐年提升,反映牛黄进口试点后,牛黄原料成本压力缓解。

2)补益类：补益类是公司第二大产品线,包括六味地黄丸、五子衍宗丸等。 我们分别假设 2024-2026 年补益类产品营收年增长 8%、10%和 12%,毛利率均保持稳定为 37.5%。

3)妇科类：妇科类产品包括乌鸡白凤丸、坤宝丸等,历年销售比较平稳。我们假设 2024-2026 年妇科类产品年增长 5%,毛利率维持稳定在 42%。

4)清热类：清热类产品与流行性疾病相关,2023 年为流感大年,感冒清热类产品销售相对旺盛,基数较高。我们假设 2024-2026 年清热类产品年增长-15%、8% 和 10%, 2024 年负增长, 反映上 2023 年基数较高和 2024 年流行性疾病小年影响, 毛利率稳定为 35.0%。

5)其他产品：我们假设 2024-2026 年其他中药品种营收年增长 5%、10%和 15%, 毛利率稳定保持 41%。

6)医药商业：医药商业营收增长主要是旗下同仁堂商业零售门店带动, 2023-2024H1 门店新开显著提速,2024 年上半年新开 116 家门店。我们假设 2024-2026 年医药商业年均增长 9%,毛利率保持 31%水平不变。

7)分部抵消：公司医药商业销售自产药品比例逐年提升,2023 年分部抵消 34.6 亿元,占医药工业营收 31.3%左右,我们假设 2024-2026 年,分部间抵消占医药工业营收分别为 33%、34%和 35%,毛利率为 -2%。

表 4：同仁堂主营业务关键假设及营收拆分`,

      `## 4.1、关键假设及盈利预测
<table>
<thead>
<tr><th>同仁堂经营拆分：</th><th>单位</th><th>2021A</th><th>2022A</th><th>2023A</th><th>2024E</th><th>2025E</th><th>2026E</th></tr>
</thead>
<tbody>
<tr><td>合并营业收入</td><td>亿元</td><td>146.03</td><td>153.72</td><td>178.61</td><td>187.68</td><td>203.30</td><td>222.68</td></tr>
<tr><td>同比</td><td>%</td><td>13.86%</td><td>5.27%</td><td>16.19%</td><td>5.08%</td><td>8.33%</td><td>9.53%</td></tr>
<tr><td>毛利率</td><td>%</td><td>47.62%</td><td>48.80%</td><td>47.29%</td><td>44.53%</td><td>45.50%</td><td>46.46%</td></tr>
<tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td>分产品</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td>一、医药工业分部</td><td>亿元</td><td>88.76</td><td>98.40</td><td>110.79</td><td>113.42</td><td>123.59</td><td>138.44</td></tr>
<tr><td>同比</td><td>%</td><td>15.99%</td><td>10.86%</td><td>12.59%</td><td>2.38%</td><td>8.96%</td><td>12.02%</td></tr>
<tr><td>毛利率</td><td>%</td><td>48.13%</td><td>48.95%</td><td>46.96%</td><td>42.50%</td><td>43.63%</td><td>44.32%</td></tr>
<tr><td>分细分产品:</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td>1、母公司生产：心脑血管类(安宫、清心、大活络等)</td><td>亿元</td><td>36.29</td><td>40.63</td><td>43.88</td><td>43.88</td><td>47.39</td><td>52.13</td></tr>
<tr><td>同比</td><td>%</td><td>20.80%</td><td>11.97%</td><td>8.00%</td><td>0.00%</td><td>8.00%</td><td>10.00%</td></tr>
<tr><td>毛利率</td><td>%</td><td>59.96%</td><td>61.20%</td><td>57.62%</td><td>47.00%</td><td>50.00%</td><td>52.00%</td></tr>
<tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td>2、补益类(六味、金匮、五子衍宗)</td><td></td><td>14.56</td><td>15.67</td><td>17.30</td><td>18.68</td><td>20.55</td><td>23.02</td></tr>
<tr><td>同比</td><td>%</td><td>2.86%</td><td>7.62%</td><td>10.40%</td><td>8.00%</td><td>10.00%</td><td>12.00%</td></tr>
<tr><td>毛利率</td><td>%</td><td>42.45%</td><td>43.00%</td><td>37.39%</td><td>37.50%</td><td>37.50%</td><td>37.50%</td></tr>
<tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td>3、妇科类(乌鸡白凤丸、坤宝丸)</td><td></td><td>3.80</td><td>3.48</td><td>3.77</td><td>3.96</td><td>4.15</td><td>4.36</td></tr>
<tr><td>同比</td><td>%</td><td>23.83%</td><td>-8.38%</td><td>8.28%</td><td>5.00%</td><td>5.00%</td><td>5.00%</td></tr>
<tr><td>毛利率</td><td>%</td><td>40.16%</td><td>38.12%</td><td>42.38%</td><td>42.00%</td><td>42.00%</td><td>42.00%</td></tr>
<tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td>4、清热类(感冒清热颗粒、牛黄解毒)</td><td>亿元</td><td>5.24</td><td>5.29</td><td>6.14</td><td>5.22</td><td>5.64</td><td>6.20</td></tr>
<tr><td>同比</td><td>%</td><td>5.19%</td><td>0.86%</td><td>16.07%</td><td>-15.00%</td><td>8.00%</td><td>10.00%</td></tr>
<tr><td>毛利率</td><td>%</td><td>36.09%</td><td>34.39%</td><td>34.97%</td><td>35.00%</td><td>35.00%</td><td>35.00%</td></tr>
<tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td>5、其他中药品种</td><td>亿元</td><td>28.87</td><td>33.33</td><td>39.70</td><td>41.69</td><td>45.85</td><td>52.73</td></tr>
<tr><td>同比</td><td>%</td><td>18.90%</td><td>15.45%</td><td>19.11%</td><td>5.00%</td><td>10.00%</td><td>15.00%</td></tr>
</tbody>
</table>`,

      `## 4.1、关键假设及盈利预测
<table>
<thead>
<tr><th>同仁堂经营拆分：</th><th>单位</th><th>2021A</th><th>2022A</th><th>2023A</th><th>2024E</th><th>2025E</th><th>2026E</th></tr>
</thead>
<tbody>
<tr><td>毛利率</td><td>%</td><td>39.36%</td><td>40.25%</td><td>41.65%</td><td>41.00%</td><td>41.00%</td><td>41.00%</td></tr>
<tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td>二、商业分部(同仁堂商业)</td><td>亿元</td><td>82.41</td><td>84.80</td><td>102.5</td><td>111.7</td><td>121.7</td><td>132.7</td></tr>
<tr><td>同比</td><td>%</td><td>12.64%</td><td>2.90%</td><td>20.83%</td><td>9.00%</td><td>9.00%</td><td>9.00%</td></tr>
<tr><td>毛利率</td><td>%</td><td>31.51%</td><td>30.95%</td><td>31.11%</td><td>31.00%</td><td>31.00%</td><td>31.00%</td></tr>
<tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td>三、分部间抵消</td><td>亿元</td><td>-25.14</td><td>(29.48)</td><td>(34.64)</td><td>(37.43)</td><td>(42.02)</td><td>(48.45)</td></tr>
<tr><td>同比</td><td>%</td><td>17.32%</td><td>17.27%</td><td>17.50%</td><td>8.06%</td><td>12.26%</td><td>15.31%</td></tr>
<tr><td>毛利率</td><td>%</td><td>-3.39%</td><td>-2.05%</td><td>-1.61%</td><td>-2.0%</td><td>-2.0%</td><td>-2.0%</td></tr>
<tr><td>分部抵消营收占工业比例</td><td>%</td><td>28.32%</td><td>29.96%</td><td>31.27%</td><td>33.0%</td><td>34.0%</td><td>35.0%</td></tr>
</tbody>
</table>

资料来源：Wind, 诚通证券研究所

综上,我们预测公司 2024-2026 年,营业收入分别为 187.7/203.3/222.7 亿元, 分别同比增 5.1%/8.3%/9.5%；归母净利润分别为 16.7/19.4/22.6 亿元,分别同比增 0.3%/15.8%/16.7%; 每股 EPS 分别为 1.22/1.41/1.65 元; 毛利率分别为 44.5%/45.5%/46.5%。`
    ]
  };

  const { chunks } = splitText2Chunks({
    text: mock.text,
    chunkSize: 1000
  });

  expect(chunks).toEqual(mock.result);
});
