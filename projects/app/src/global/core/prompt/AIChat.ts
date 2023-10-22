import { PromptTemplateItem } from '@fastgpt/core/ai/type.d';

export const Prompt_QuoteTemplateList: PromptTemplateItem[] = [
  {
    title: '标准模板',
    desc: '包含 q 和 a 两个变量的标准模板',
    value: `{instruction:"{{q}}",output:"{{a}}"}`
  },
  {
    title: '全部变量',
    desc: '包含 q 和 a 两个变量的标准模板',
    value: `{instruction:"{{q}}",output:"{{a}}",source:"{{source}}",file_id:"{{file_id}}",index:"{{index}}"}`
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
3. 背景知识无法满足问题时，你需严谨的回答问题。
 

以上是我的要求，你要认真理解我的意思。
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
3. 背景知识无法满足问题时，你需严谨的回答问题。
4. 回复中如果有代码代码块前加上“请运行以下代码”，代码请使用python+pyplot实现代码 
  请将rcParams["font.sans-serif"]设置为["SimHei"] 
  代码是需要在后台运行的，所以不用写如plt.show()展示，而是将图片保存到一个文件中，文件名为随机产生以保证唯一，但需要使用print(文件名)来输出
 
我的问题是:"{{question}}"`
  }
];
