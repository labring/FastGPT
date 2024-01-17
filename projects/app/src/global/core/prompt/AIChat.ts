import { PromptTemplateItem } from '@fastgpt/global/core/ai/type.d';
<Question>
export const Prompt_QuoteTemplateList: PromptTemplateItem[] = [
  {
    title: '标准模板',
    desc: '标准提示词，用于结构不固定的知识库。',
    value: `<data>
{{q}}
{{a}}    
</data>`
  },
  {
    title: '问答模板',
    desc: '适合 QA 问答结构的知识库，可以让AI较为严格的按预设内容回答',
    value: `<QA>
<Question>
{{q}}
</Question>
<Answer>
{{a}}
</Answer>
</QA>`
  },
  {
    title: '标准严格模板',
    desc: '在标准模板基础上，对模型的回答做更严格的要求。',
    value: `<data>
{{q}}
{{a}}    
</data>`
  },
  {
    title: '严格问答模板',
    desc: '在问答模板基础上，对模型的回答做更严格的要求。',
    value: `<QA>
<Question>
{{q}}
</Question>
<Answer>
{{a}}
</Answer>
</QA>`
  }
];

export const Prompt_QuotePromptList: PromptTemplateItem[] = [
  {
    title: '标准模板',
    desc: '',
    value: `Use the content within the <data></data> tags as your knowledge:

{{quote}}

Response Requirements:
- If you are unsure of the answer, seek clarification.
- Avoid mentioning that your knowledge is obtained from data.
- Ensure that your answer aligns with the description in the data.

Question: "{{question}}"`

  },
  {
    title: '问答模板',
    desc: '',
    value: `Use the Q&A pairs within <QA></QA> tags for responses.

{{quote}}

Answer Requirements:
- Choose one or more Q&A pairs to respond to.
- Ensure that the response closely aligns with the content within <Answer></Answer>.
- Clarify if there are no relevant Q&A pairs.
- Avoid mentioning that the knowledge is sourced from QA; simply provide the answers.
- All formulas must be expressed in LaTex. Inline format: $g_{\mu\nu}$ and block format: $$i\hbar \frac{\partial}{\partial t}\left|\Psi(t)\right>=H\left|\Psi(t)\right>$$.

Question:"{{question}}"`
  },
  {
    "title": "标准严格模板",
    "desc": "",
    "value": `Forget the knowledge you already have; only use the content within <data></data> tags as your knowledge:
  
  {{quote}}
  
  Thinking process:
  1. Determine if the question is related to the content within <data></data> tags.
  2. If relevant, respond according to the following requirements.
  3. If not relevant, decline to answer the question directly.
  
  Answer Requirements:
  - Avoid mentioning that you obtained knowledge from data.
  - Ensure that the answer aligns with the description within <data></data>.
  - All formulas must be expressed in LaTex. Inline format: $g_{\mu\nu}$ and block format: $$i\hbar \frac{\partial}{\partial t}\left|\Psi(t)\right>=H\left|\Psi(t)\right>$$.
  
  Question: "{{question}}"`
  },
  {
    "title": "严格问答模板",
    "desc": "",
    "value": `Forget the knowledge you already have; only use the Q&A pairs within <QA></QA> tags to respond.
  
  {{quote}}
  
  Thinking process:
  1. Determine if the question is related to the content within <QA></QA> tags.
  2. If not, decline to answer the question directly.
  3. Check for similar or identical questions.
  4. If there are identical questions, provide the corresponding answers.
  5. If there are only similar questions, output both the similar questions and answers together.
  
  Lastly, avoid mentioning that you obtained knowledge from QA; simply provide the answers.
  
  Question: "{{question}}"`
  }  
];