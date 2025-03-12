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
    value: `Use the contents of the <Reference></Reference> tag as the reference for this conversation:

<Reference>
{{quote}}
</Reference>

Answer requirements:
- If you are not clear about the answer, you need to clarify.
- Avoid mentioning knowledge that you obtained from <Reference></Reference>.
- Keep your answer as described in <Reference></Reference>.
- Answer in the same language as the question.

Question:"""{{question}}"""`
  },
  {
    title: i18nT('app:template.qa_template'),
    desc: '',
    value: `Answer using the question and answer pairs in the <QA></QA> tag.

<QA>
{{quote}}
</QA>

Answer requirements:
- Select one or more of the Q&A pairs to answer.
- The answer should be as close as possible to what is in <Answer></Answer>.
- If there are no relevant Q&A pairs, you need to clarify.
- Avoid mentioning the knowledge you gained from QA, just reply to the answer.

Question:"""{{question}}"""`
  },
  {
    title: i18nT('app:template.standard_strict'),
    desc: '',
    value: `Forget what you already know and use only what's in the <Reference></Reference> tag as a reference for this conversation:

<Reference>
{{quote}}
</Reference>

Thought Flow:
1. Determine if the question is related to the content in the <Reference></Reference> tag.
2. If it is relevant, you answer as follows.
3. If it is not relevant, you simply refuse to answer the question.

Answer requirements:
- Avoid mentioning knowledge that you obtained from <Reference></Reference>.
- Keep your answer as described in <Reference></Reference>.
- Answer in the same language as the question.

Question:"""{{question}}"""`
  },
  {
    title: i18nT('app:template.hard_strict'),
    desc: '',
    value: `Forget what you already know and answer using only the Q&A pairs in the <QA></QA> tags.

<QA>
{{quote}}
</QA>

Thought Flow:
1. Determine if the problem is related to the contents of the <QA></QA> tag.
2. If it is not relevant, you directly refuse to answer this question.
3. Determine whether there are similar or identical issues.
4. If there is an identical question, directly output the corresponding answer.
5. If there are only similar questions, output the similar questions and answers together.

Answer requirements:
- If there is no relevant Q&A pair, you need to clarify.
- The content of the response should be as consistent as possible with the content in the <QA></QA> tag.
- Avoid mentioning the knowledge you obtained from QA and just reply with the answer.
- Answer in the same language as the question.

Question:"""{{question}}"""`
  }
];

export const Prompt_systemQuotePromptList: PromptTemplateItem[] = [
  {
    title: i18nT('app:template.standard_template'),
    desc: '',
    value: `Use the contents of the <Reference></Reference> tag as a reference for this conversation:

<Reference>
{{quote}}
</Reference>

Answer requirements:
- If you're not sure of the answer, you need to clarify.
- Avoid mentioning knowledge that you obtained from <Reference></Reference>.
- Keep your answer as described in <Reference></Reference>.
- Answer in the same language as the question.`
  },
  {
    title: i18nT('app:template.qa_template'),
    desc: '',
    value: `Use the Q&A pairs in the <QA></QA> tags to answer.

<QA>
{{quote}}
</QA>

Answer requirements:
- Choose one or more of the Q&A pairs to answer.
- Answers should be as consistent as possible with those in <answer></answer>.
- If there is no relevant Q&A pair, you need to clarify.
- Avoid mentioning the knowledge you obtained from QA and just reply with the answer.`
  },
  {
    title: i18nT('app:template.standard_strict'),
    desc: '',
    value: `Forget what you already know and use only what is in the <Reference></Reference> tags as a reference for this conversation:

<Reference>
{{quote}}
</Reference>

Thought Flow:
1. Determine whether the problem is related to the contents of the <Reference></Reference> tag.
2. If relevant, you answer as requested below.
3. If not relevant, you simply decline to answer this question.

Answer requirements:
- Avoid mentioning knowledge that you obtained from <Reference></Reference>.
- Keep your answer as described in <Reference></Reference>.
- Answer in the same language as the question.`
  },
  {
    title: i18nT('app:template.hard_strict'),
    desc: '',
    value: `Forget what you already know and answer using only the Q&A pairs in the <QA></QA> tags.

<QA>
{{quote}}
</QA>

Thought Flow:
1. Determine if the problem is related to the contents of the <QA></QA> tag.
2. If it is not relevant, you directly refuse to answer this question.
3. Determine whether there are similar or identical issues.
4. If there is an identical question, directly output the corresponding answer.
5. If there are only similar questions, output the similar questions and answers together.

Answer requirements:
- If there is no relevant Q&A pair, you need to clarify.
- The content of the response should be as consistent as possible with the content in the <QA></QA> tag.
- Avoid mentioning the knowledge you obtained from QA and just reply with the answer.
- Answer in the same language as the question.`
  }
];

// Document quote prompt
export const Prompt_DocumentQuote = `Use the contents of <FilesContent></FilesContent> as a reference for this conversation:
<FilesContent>
{{quote}}
</FilesContent>
`;
