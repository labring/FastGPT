import { describe, expect, it } from 'vitest';
import {
  Prompt_AgentQA,
  getExtractJsonPrompt,
  getExtractJsonToolPrompt,
  getCQSystemPrompt,
  QuestionGuidePrompt,
  QuestionGuideFooterPrompt
} from '@fastgpt/global/core/ai/prompt/agent';

describe('Prompt_AgentQA', () => {
  it('should have description and fixedText properties', () => {
    expect(Prompt_AgentQA).toHaveProperty('description');
    expect(Prompt_AgentQA).toHaveProperty('fixedText');
  });

  it('should contain key instructions in description', () => {
    expect(Prompt_AgentQA.description).toContain('<Context></Context>');
    expect(Prompt_AgentQA.description).toContain('最多提出 50 个问题');
    expect(Prompt_AgentQA.description).toContain('Markdown');
  });

  it('should contain template placeholder in fixedText', () => {
    expect(Prompt_AgentQA.fixedText).toContain('{{text}}');
    expect(Prompt_AgentQA.fixedText).toContain('<Context>');
    expect(Prompt_AgentQA.fixedText).toContain('</Context>');
    expect(Prompt_AgentQA.fixedText).toContain('Q1:');
    expect(Prompt_AgentQA.fixedText).toContain('A1:');
  });
});

describe('getExtractJsonPrompt', () => {
  it('should return prompt with only default list items when no optional params', () => {
    const result = getExtractJsonPrompt({});
    expect(result).toContain('【历史记录】');
    expect(result).toContain('【用户输入】');
    expect(result).not.toContain('【背景知识】');
    expect(result).not.toContain('【历史提取结果】');
  });

  it('should include schema in output', () => {
    const result = getExtractJsonPrompt({ schema: '{"type":"object"}' });
    expect(result).toContain('{"type":"object"}');
    expect(result).toContain('## JSON Schema');
  });

  it('should include systemPrompt section when systemPrompt is provided', () => {
    const result = getExtractJsonPrompt({ systemPrompt: '请提取用户姓名' });
    expect(result).toContain('【背景知识】');
    expect(result).toContain('## 特定要求');
    expect(result).toContain('请提取用户姓名');
  });

  it('should include memory section when memory is provided', () => {
    const result = getExtractJsonPrompt({ memory: '上次提取: name=张三' });
    expect(result).toContain('【历史提取结果】');
    expect(result).toContain('## 历史提取结果');
    expect(result).toContain('上次提取: name=张三');
  });

  it('should include all sections when all params are provided', () => {
    const result = getExtractJsonPrompt({
      schema: '{"name":"string"}',
      systemPrompt: '提取姓名',
      memory: '历史结果'
    });
    expect(result).toContain('【历史记录】');
    expect(result).toContain('【用户输入】');
    expect(result).toContain('【背景知识】');
    expect(result).toContain('【历史提取结果】');
    expect(result).toContain('## 特定要求');
    expect(result).toContain('## 历史提取结果');
    expect(result).toContain('## JSON Schema');
    expect(result).toContain('## 输出要求');
  });

  it('should replace triple or more newlines with double newlines', () => {
    const result = getExtractJsonPrompt({});
    // When systemPrompt and memory are empty, the template produces consecutive newlines
    // that should be collapsed
    expect(result).not.toMatch(/\n{3,}/);
  });

  it('should join list items with Chinese comma separator', () => {
    const result = getExtractJsonPrompt({ systemPrompt: 'sp', memory: 'mem' });
    expect(result).toContain('【历史记录】、【用户输入】、【背景知识】、【历史提取结果】');
  });

  it('should filter empty strings from list', () => {
    // Without systemPrompt and memory, list should only have 2 items
    const result = getExtractJsonPrompt({});
    expect(result).toContain('【历史记录】、【用户输入】');
    expect(result).not.toContain('、、');
  });

  it('should always contain output requirements section', () => {
    const result = getExtractJsonPrompt({});
    expect(result).toContain('严格输出 json 字符串');
    expect(result).toContain('不要回答问题');
  });
});

describe('getExtractJsonToolPrompt', () => {
  it('should return prompt with only default list items when no optional params', () => {
    const result = getExtractJsonToolPrompt({});
    expect(result).toContain('【历史记录】');
    expect(result).toContain('【用户输入】');
    expect(result).not.toContain('【背景知识】');
    expect(result).not.toContain('【历史提取结果】');
  });

  it('should mention request_function in background section', () => {
    const result = getExtractJsonToolPrompt({});
    expect(result).toContain('request_function');
  });

  it('should include systemPrompt section when systemPrompt is provided', () => {
    const result = getExtractJsonToolPrompt({ systemPrompt: '提取地址信息' });
    expect(result).toContain('【背景知识】');
    expect(result).toContain('## 特定要求');
    expect(result).toContain('提取地址信息');
  });

  it('should include memory section when memory is provided', () => {
    const result = getExtractJsonToolPrompt({ memory: '上次结果: city=北京' });
    expect(result).toContain('【历史提取结果】');
    expect(result).toContain('## 历史提取结果');
    expect(result).toContain('上次结果: city=北京');
  });

  it('should include all sections when all params are provided', () => {
    const result = getExtractJsonToolPrompt({
      systemPrompt: '提取信息',
      memory: '历史数据'
    });
    expect(result).toContain('【历史记录】');
    expect(result).toContain('【用户输入】');
    expect(result).toContain('【背景知识】');
    expect(result).toContain('【历史提取结果】');
    expect(result).toContain('## 特定要求');
    expect(result).toContain('## 历史提取结果');
  });

  it('should replace triple or more newlines with double newlines', () => {
    const result = getExtractJsonToolPrompt({});
    expect(result).not.toMatch(/\n{3,}/);
  });

  it('should join list items with Chinese comma separator', () => {
    const result = getExtractJsonToolPrompt({ systemPrompt: 'sp', memory: 'mem' });
    expect(result).toContain('【历史记录】、【用户输入】、【背景知识】、【历史提取结果】');
  });

  it('should filter empty strings from list', () => {
    const result = getExtractJsonToolPrompt({});
    expect(result).toContain('【历史记录】、【用户输入】');
    expect(result).not.toContain('、、');
  });

  it('should contain basic requirements about returning JSON', () => {
    const result = getExtractJsonToolPrompt({});
    expect(result).toContain('返回一个 JSON 字符串');
  });
});

describe('getCQSystemPrompt', () => {
  const defaultTypeList = '1. 技术问题\n2. 产品咨询\n3. 其他';

  it('should return prompt with only history list item when no optional params', () => {
    const result = getCQSystemPrompt({ typeList: defaultTypeList });
    expect(result).toContain('【历史记录】');
    expect(result).not.toContain('【背景知识】');
    expect(result).not.toContain('【上一轮分类结果】');
  });

  it('should include typeList in output', () => {
    const result = getCQSystemPrompt({ typeList: defaultTypeList });
    expect(result).toContain('## 分类清单');
    expect(result).toContain(defaultTypeList);
  });

  it('should include systemPrompt section when systemPrompt is provided', () => {
    const result = getCQSystemPrompt({
      typeList: defaultTypeList,
      systemPrompt: '你是客服助手'
    });
    expect(result).toContain('【背景知识】');
    expect(result).toContain('## 背景知识');
    expect(result).toContain('你是客服助手');
  });

  it('should include memory section when memory is provided', () => {
    const result = getCQSystemPrompt({
      typeList: defaultTypeList,
      memory: '上一轮: 技术问题'
    });
    expect(result).toContain('【上一轮分类结果】');
    expect(result).toContain('## 上一轮分类结果');
    expect(result).toContain('上一轮: 技术问题');
  });

  it('should include all sections when all params are provided', () => {
    const result = getCQSystemPrompt({
      typeList: defaultTypeList,
      systemPrompt: '背景信息',
      memory: '分类历史'
    });
    expect(result).toContain('【背景知识】');
    expect(result).toContain('【历史记录】');
    expect(result).toContain('【上一轮分类结果】');
    expect(result).toContain('## 背景知识');
    expect(result).toContain('## 上一轮分类结果');
    expect(result).toContain('## 分类清单');
  });

  it('should replace triple or more newlines with double newlines', () => {
    const result = getCQSystemPrompt({ typeList: defaultTypeList });
    expect(result).not.toMatch(/\n{3,}/);
  });

  it('should join list items with Chinese comma separator', () => {
    const result = getCQSystemPrompt({
      typeList: defaultTypeList,
      systemPrompt: 'sp',
      memory: 'mem'
    });
    expect(result).toContain('【背景知识】、【历史记录】、【上一轮分类结果】');
  });

  it('should filter empty strings from list', () => {
    const result = getCQSystemPrompt({ typeList: defaultTypeList });
    // Only 【历史记录】 should remain
    expect(result).toContain('【历史记录】');
    expect(result).not.toContain('、、');
  });

  it('should contain classification requirements', () => {
    const result = getCQSystemPrompt({ typeList: defaultTypeList });
    expect(result).toContain('## 分类要求');
    expect(result).toContain('分类结果必须从分类清单中选择');
    expect(result).toContain('## 输出格式');
    expect(result).toContain('只需要输出分类的 id');
  });

  it('should describe the role as classification assistant', () => {
    const result = getCQSystemPrompt({ typeList: defaultTypeList });
    expect(result).toContain('分类助手');
  });
});

describe('QuestionGuidePrompt', () => {
  it('should be a non-empty string', () => {
    expect(typeof QuestionGuidePrompt).toBe('string');
    expect(QuestionGuidePrompt.length).toBeGreaterThan(0);
  });

  it('should contain key instructions about generating 3 questions', () => {
    expect(QuestionGuidePrompt).toContain('3 potential questions');
  });

  it('should instruct to use same language as user', () => {
    expect(QuestionGuidePrompt).toContain('same language');
  });

  it('should instruct to keep questions under 20 characters', () => {
    expect(QuestionGuidePrompt).toContain('20 characters');
  });
});

describe('QuestionGuideFooterPrompt', () => {
  it('should be a non-empty string', () => {
    expect(typeof QuestionGuideFooterPrompt).toBe('string');
    expect(QuestionGuideFooterPrompt.length).toBeGreaterThan(0);
  });

  it('should contain JSON format instruction', () => {
    expect(QuestionGuideFooterPrompt).toContain('JSON format');
  });

  it('should contain example output format with Question placeholders', () => {
    expect(QuestionGuideFooterPrompt).toContain("'Question 1'");
    expect(QuestionGuideFooterPrompt).toContain("'Question 2'");
    expect(QuestionGuideFooterPrompt).toContain("'Question 3'");
  });
});
