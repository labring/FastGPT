import { PromptTemplateItem } from '@fastgpt/global/core/ai/type.d';

export const Prompt_QuoteTemplateList: PromptTemplateItem[] = [
  {
    title: '标准模板',
    desc: '包含 q 和 a 两个变量的标准模板',
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
    title: '标准模式',
    desc: '',
    value: `你的背景知识:
"""
{{quote}}
"""
对话要求：
1. 背景知识是最新的，其中 instruction 是相关介绍，output 是预期回答或补充。
2. 使用背景知识回答问题。
3. 使用对话的风格回答我的问题，答案要和背景知识表述一致。
我的问题是:"{{question}}"`
  },
  {
    title: '严格模式',
    desc: '',
    value: `你的背景知识:
"""
{{quote}}
"""
对话要求：
1. 背景知识是最新的，其中 instruction 是相关介绍，output 是预期回答或补充。
2. 使用背景知识回答问题。
3. 背景知识无法满足问题时，你需要回答：我不清楚关于xxx的内容。
我的问题是:"{{question}}"`
  }
];
