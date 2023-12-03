import { PromptTemplateItem } from '@fastgpt/global/core/ai/type.d';

export const Prompt_QuoteTemplateList: PromptTemplateItem[] = [
  {
    title: '标准模板',
    desc: '标准提示词，用于结构不固定的知识库。',
    value: `{{q}}\n{{a}}`
  },
  {
    title: '问答模板',
    desc: '适合 QA 问答结构的知识库，或大部分核心介绍位于 a 的知识库。',
    value: `{instruction:"{{q}}",output:"{{a}}"}`
  },
  {
    title: '标准严格模板',
    desc: '在标准模板基础上，对模型的回答做更严格的要求。',
    value: `{{q}}\n{{a}}`
  },
  {
    title: '严格问答模板',
    desc: '在问答模板基础上，对模型的回答做更严格的要求。',
    value: `{question:"{{q}}",answer:"{{a}}"}`
  }
];

export const Prompt_QuotePromptList: PromptTemplateItem[] = [
  {
    title: '标准模板',
    desc: '',
    value: `你的知识库:
"""
{{quote}}
"""
回答要求：
1. 优先使用知识库内容回答问题。
2. 你可以回答我不知道。
3. 不要提及你是从知识库获取的知识。
4. 知识库包含 markdown 内容时，按 markdown 格式返回。
我的问题是:"{{question}}"`
  },
  {
    title: '问答模板',
    desc: '',
    value: `你的知识库:
"""
{{quote}}
"""
回答要求：
1. 优先使用知识库内容回答问题，其中 instruction 是相关介绍，output 是预期回答或补充。
2. 你可以回答我不知道。
3. 不要提及你是从知识库获取的知识。
4. 知识库包含 markdown 内容时，按 markdown 格式返回。
我的问题是:"{{question}}"`
  },
  {
    title: '标准严格模板',
    desc: '',
    value: `你的知识库:
"""
{{quote}}
"""
回答要求：
1. 仅使用知识库内容回答问题。
2. 与知识库无关的问题，你直接回答我不知道。
3. 不要提及你是从知识库获取的知识。
4. 知识库包含 markdown 内容时，按 markdown 格式返回。
我的问题是:"{{question}}"`
  },
  {
    title: '严格问答模板',
    desc: '',
    value: `你的知识库:
"""
{{quote}}
"""
回答要求：
1. 从知识库中选择一个合适的答案进行回答，其中 instruction 是相关问题，answer 是已知答案。
2. 与知识库无关的问题，你直接回答我不知道。
3. 不要提及你是从知识库获取的知识。
我的问题是:"{{question}}"`
  }
];
