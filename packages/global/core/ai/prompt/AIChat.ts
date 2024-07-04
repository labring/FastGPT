import { PromptTemplateItem } from '../type.d';

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
    value: `<Question>
{{q}}
</Question>
<Answer>
{{a}}
</Answer>`
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
    value: `<Question>
{{q}}
</Question>
<Answer>
{{a}}
</Answer>`
  }
];

export const Prompt_QuotePromptList: PromptTemplateItem[] = [
  {
    title: '标准模板',
    desc: '',
    value: `使用 <Data></Data> 标记中的内容作为你的知识:

<Data>
{{quote}}
</Data>

回答要求：
- 如果你不清楚答案，你需要澄清。
- 避免提及你是从 <Data></Data> 获取的知识。
- 保持答案与 <Data></Data> 中描述的一致。
- 使用 Markdown 语法优化回答格式。
- 使用与问题相同的语言回答。

问题:"""{{question}}"""`
  },
  {
    title: '问答模板',
    desc: '',
    value: `使用 <QA></QA> 标记中的问答对进行回答。

<QA>
{{quote}}
</QA>

回答要求：
- 选择其中一个或多个问答对进行回答。
- 回答的内容应尽可能与 <答案></答案> 中的内容一致。
- 如果没有相关的问答对，你需要澄清。
- 避免提及你是从 QA 获取的知识，只需要回复答案。

问题:"""{{question}}"""`
  },
  {
    title: '标准严格模板',
    desc: '',
    value: `忘记你已有的知识，仅使用 <Data></Data> 标记中的内容作为你的知识:

<Data>
{{quote}}
</Data>

思考流程：
1. 判断问题是否与 <Data></Data> 标记中的内容有关。
2. 如果有关，你按下面的要求回答。
3. 如果无关，你直接拒绝回答本次问题。

回答要求：
- 避免提及你是从 <Data></Data> 获取的知识。
- 保持答案与 <Data></Data> 中描述的一致。
- 使用 Markdown 语法优化回答格式。
- 使用与问题相同的语言回答。

问题:"""{{question}}"""`
  },
  {
    title: '严格问答模板',
    desc: '',
    value: `忘记你已有的知识，仅使用 <QA></QA> 标记中的问答对进行回答。

<QA>
{{quote}}
</QA>

思考流程：
1. 判断问题是否与 <QA></QA> 标记中的内容有关。
2. 如果无关，你直接拒绝回答本次问题。
3. 判断是否有相近或相同的问题。
4. 如果有相同的问题，直接输出对应答案。
5. 如果只有相近的问题，请把相近的问题和答案一起输出。

回答要求：
- 如果没有相关的问答对，你需要澄清。
- 回答的内容应尽可能与 <QA></QA> 标记中的内容一致。
- 避免提及你是从 QA 获取的知识，只需要回复答案。
- 使用 Markdown 语法优化回答格式。
- 使用与问题相同的语言回答。

问题:"""{{question}}"""`
  }
];
