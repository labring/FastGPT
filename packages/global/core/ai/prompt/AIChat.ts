import { PromptTemplateItem } from '../type.d';
import { i18nT } from '../../../../web/i18n/utils';

export const Prompt_QuoteTemplateList: PromptTemplateItem[] = [
  {
    title: i18nT('app:template.standard_template'),
    desc: i18nT('app:template.standard_template_des'),
    value: `{
  "sourceName": "{{source}}",
  "updateTime": "{{updateTime}}",
  "content": "{{q}}\n{{a}}"
}
`
  },
  {
    title: i18nT('app:template.qa_template'),
    desc: i18nT('app:template.qa_template_des'),
    value: `<Question>
{{q}}
</Question>
<Answer>
{{a}}
</Answer>`
  },
  {
    title: i18nT('app:template.standard_strict'),
    desc: i18nT('app:template.standard_strict_des'),
    value: `{
  "sourceName": "{{source}}",
  "updateTime": "{{updateTime}}",
  "content": "{{q}}\n{{a}}"
}
`
  },
  {
    title: i18nT('app:template.hard_strict'),
    desc: i18nT('app:template.hard_strict_des'),
    value: `<Question>
{{q}}
</Question>
<Answer>
{{a}}
</Answer>`
  }
];

export const Prompt_userQuotePromptList: PromptTemplateItem[] = [
  {
    title: i18nT('app:template.standard_template'),
    desc: '',
    value: `使用 <Reference></Reference> 标记中的内容作为本次对话的参考:

<Reference>
{{quote}}
</Reference>

回答要求：
- 如果你不清楚答案，你需要澄清。
- 避免提及你是从 <Reference></Reference> 获取的知识。
- 保持答案与 <Reference></Reference> 中描述的一致。
- 使用 Markdown 语法优化回答格式。
- 使用与问题相同的语言回答。

问题:"""{{question}}"""`
  },
  {
    title: i18nT('app:template.qa_template'),
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
    title: i18nT('app:template.standard_strict'),
    desc: '',
    value: `忘记你已有的知识，仅使用 <Reference></Reference> 标记中的内容作为本次对话的参考:

<Reference>
{{quote}}
</Reference>

思考流程：
1. 判断问题是否与 <Reference></Reference> 标记中的内容有关。
2. 如果有关，你按下面的要求回答。
3. 如果无关，你直接拒绝回答本次问题。

回答要求：
- 避免提及你是从 <Reference></Reference> 获取的知识。
- 保持答案与 <Reference></Reference> 中描述的一致。
- 使用 Markdown 语法优化回答格式。
- 使用与问题相同的语言回答。

问题:"""{{question}}"""`
  },
  {
    title: i18nT('app:template.hard_strict'),
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

export const Prompt_systemQuotePromptList: PromptTemplateItem[] = [
  {
    title: i18nT('app:template.standard_template'),
    desc: '',
    value: `使用 <Reference></Reference> 标记中的内容作为本次对话的参考:

<Reference>
{{quote}}
</Reference>

回答要求：
- 如果你不清楚答案，你需要澄清。
- 避免提及你是从 <Reference></Reference> 获取的知识。
- 保持答案与 <Reference></Reference> 中描述的一致。
- 使用 Markdown 语法优化回答格式。
- 使用与问题相同的语言回答。`
  },
  {
    title: i18nT('app:template.qa_template'),
    desc: '',
    value: `使用 <QA></QA> 标记中的问答对进行回答。

<QA>
{{quote}}
</QA>

回答要求：
- 选择其中一个或多个问答对进行回答。
- 回答的内容应尽可能与 <答案></答案> 中的内容一致。
- 如果没有相关的问答对，你需要澄清。
- 避免提及你是从 QA 获取的知识，只需要回复答案。`
  },
  {
    title: i18nT('app:template.standard_strict'),
    desc: '',
    value: `忘记你已有的知识，仅使用 <Reference></Reference> 标记中的内容作为本次对话的参考:

<Reference>
{{quote}}
</Reference>

思考流程：
1. 判断问题是否与 <Reference></Reference> 标记中的内容有关。
2. 如果有关，你按下面的要求回答。
3. 如果无关，你直接拒绝回答本次问题。

回答要求：
- 避免提及你是从 <Reference></Reference> 获取的知识。
- 保持答案与 <Reference></Reference> 中描述的一致。
- 使用 Markdown 语法优化回答格式。
- 使用与问题相同的语言回答。`
  },
  {
    title: i18nT('app:template.hard_strict'),
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
- 使用与问题相同的语言回答。`
  }
];

// Document quote prompt
export const Prompt_DocumentQuote = `将 <FilesContent></FilesContent> 中的内容作为本次对话的参考:
<FilesContent>
{{quote}}
</FilesContent>
`;
