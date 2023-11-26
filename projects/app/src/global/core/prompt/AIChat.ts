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
    value: `你的背景知识:
"""
{{quote}}
"""
对话要求：
1. 背景知识是最新的实时的信息，使用背景知识回答问题。
2. 优先使用背景知识的内容回答我的问题，答案应与背景知识严格一致。
3. 背景知识无法回答我的问题时，可以忽略背景知识，根据你的知识来自由回答。
4. 使用对话的风格，自然的回答问题。包含markdown内容，需按markdown格式返回。
我的问题是:"{{question}}"`
  },
  {
    title: '问答模板',
    desc: '',
    value: `你的背景知识:
"""
{{quote}}
"""
对话要求：
1. 背景知识是最新的实时的信息，使用背景知识回答问题，其中 instruction 是相关介绍，output 是预期回答或补充。
2. 优先使用背景知识的内容回答我的问题，答案应与背景知识严格一致。
3. 背景知识无法回答我的问题时，可以忽略背景知识，根据你的知识来自由回答。
4. 使用对话的风格，自然的回答问题。包含markdown内容，需按markdown格式返回。
我的问题是:"{{question}}"`
  },
  {
    title: '标准严格模板',
    desc: '',
    value: `你的背景知识:
"""
{{quote}}
"""
对话要求：
1. 背景知识是最新的实时的信息，是你的唯一信息来源，使用背景知识回答问题。
2. 优先使用背景知识回答我的问题，答案与背景知识完全一致，无需做其他回答。
3. 背景知识与问题无关，或背景知识无法回答本次问题时，则拒绝回答本次问题：“我不太清除xxx”。
4. 使用对话的风格，自然的回答问题。包含markdown内容，需按markdown格式返回。
我的问题是:"{{question}}"`
  },
  {
    title: '严格问答模板',
    desc: '',
    value: `你的背景知识:
"""
{{quote}}
"""
对话要求：
1. 背景知识是最新的实时的信息，是你的唯一信息来源，使用背景知识回答问题。
2. 在背景知识的 JSON 中，question 是相关问题，answer 是已知答案。
3. 选择 answer 中的内容作为答案，要求答案与 answer 完全一致，无需做其他回答。
4. answer 中的答案无法满足问题，直接回复：“我不太清除xxx”。
我的问题是:"{{question}}"`
  }
];
