import { PromptTemplateItem } from '@fastgpt/global/core/ai/type.d';

export const Prompt_QuoteTemplateList: PromptTemplateItem[] = [
  {
    title: '标准模板',
    desc: '标准提示词，用于结构不固定的知识库。',
    value: `{{q}}
{{a}}`
  },
  {
    title: '问答模板',
    desc: '适合 QA 问答结构的知识库，可以让AI较为严格的按预设内容回答',
    value: `<QA>
<问题>
{{q}}
</Question>
<Answer>
{{a}}
</答案>
</QA>`
  },
  {
    title: '标准严格模板',
    desc: '在标准模板基础上，对模型的回答做更严格的要求。',
    value: `{{q}}
{{a}}`
  },
  {
    title: '严格问答模板',
    desc: '在问答模板基础上，对模型的回答做更严格的要求。',
    value: `<QA>
<问题>
{{q}}
</Question>
<Answer>
{{a}}
</答案>
</QA>`
  }
];

export const Prompt_QuotePromptList: PromptTemplateItem[] = [
  {
    title: '标准模板',
    desc: '',
    value: `使用 <data></data> 标记中的内容作为你的知识:

<Data>
{{quote}}
</Data>

回答要求：
- 如果你不清楚答案，你需要澄清。
- 避免提及你是从 <data></data> 获取的知识。
- 保持答案与 <data></data> 中描述的一致。
- 使用 Markdown 语法优化回答格式。
- 使用与问题相同的语言回答。

问题:"""{{question}}"""`
  },
  {
    title: '问答模板',
    desc: '',
    value: `Use the Q&A pairs within <QA></QA> tags for responses.

<QA>
{{quote}}
</QA>

Answer Requirements:
- Choose one or more Q&A pairs to respond to.
- Ensure that the response closely aligns with the content within <Answer></Answer>.
- Clarify if there are no relevant Q&A pairs.
- Avoid mentioning that knowledge comes from Q&A pairs unless the user mentions
- All Mathematical symbols and formulas must be expressed in the following LaTex format. Inline format $g_{\\mu\\nu}$ and display format: 
$$
i\\hbar \\frac{\\partial}{\\partial t}\\left|\\Psi(t)\\right>=H\\left|\\Psi(t)\\right>
$$

Question:"""{{question}}"""`
  },
  {
    title: '标准严格模板',
    desc: '',
    value: `忘记你已有的知识，仅使用 <data></data> 标记中的内容作为你的知识:

{{quote}}

思考流程：
1. 判断问题是否与 <data></data> 标记中的内容有关。
2. 如果有关，你按下面的要求回答。
3. 如果无关，你直接拒绝回答本次问题。

回答要求：
- 避免提及你是从 <data></data> 获取的知识。
- 保持答案与 <data></data> 中描述的一致。
- 使用 Markdown 语法优化回答格式。
- 使用与问题相同的语言回答。

问题:"""{{question}}"""`
  },
  {
    title: '严格问答模板',
    desc: '',
    value: `忘记你已有的知识，仅使用 <QA></QA> 标记中的问答对进行回答。

{{quote}}

思考流程：
1. 判断问题是否与 <QA></QA> 标记中的内容有关。
2. 如果无关，你直接拒绝回答本次问题。
3. 判断是否有相近或相同的问题。
4. 如果有相同的问题，直接输出对应答案。
5. 如果只有相近的问题，请把相近的问题和答案一起输出。

最后，避免提及你是从 QA 获取的知识，只需要回复答案。

问题:"""{{question}}"""`
  }
];
