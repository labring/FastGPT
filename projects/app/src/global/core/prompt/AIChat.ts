import { PromptTemplateItem } from '@fastgpt/global/core/ai/type.d';

export const Prompt_QuoteTemplateList: PromptTemplateItem[] = [
  {
    title: '通用模板',
    desc: '包含 q 和 a 两个变量的标准模板',
    value: `{{q}}\n{{a}}`
  },
  {
    title: '问答模板',
    desc: '包含 q 和 a 两个变量的问答类型模板',
    value: `{instruction:"{{q}}",output:"{{a}}"}`
  },
  {
    title: '全部变量',
    desc: '包含 q 和 a 两个变量的标准模板',
    value: `{instruction:"{{q}}",output:"{{a}}",source:"{{source}}",sourceId:"{{sourceId}}",index:"{{index}}"}`
  }
];

export const Prompt_QuotePromptList: PromptTemplateItem[] = [
  {
    title: '通用模板',
    desc: '',
    value: `你的背景知识:
"""
{{quote}}
"""
对话要求：
1. 背景知识是最新的实时的信息，使用背景知识回答问题。
2. 优先使用背景知识的内容回答我的问题，答案应与背景知识严格一致。
3. 背景知识无法回答我的问题时，可以忽略背景知识，根据你的知识来自由回答。
4. 使用对话的风格，自然的回答问题。
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
4. 使用对话的风格，自然的回答问题。
我的问题是:"{{question}}"`
  },
  {
    title: '严格模板',
    desc: '',
    value: `你的背景知识:
"""
{{quote}}
"""
对话要求：
1. 背景知识是最新的实时的信息，是你的唯一信息来源，使用背景知识回答问题。
2. 优先使用背景知识的内容回答我的问题，答案应与背景知识严格一致，不允许使用背景知识外的内容回答。
3. 问题与背景知识无关，或背景知识无法回答本次问题时，则拒绝回答本次问题：“我不太清除xxx”。
4. 使用对话的风格，自然的回答问题。
我的问题是:"{{question}}"`
  }
];
