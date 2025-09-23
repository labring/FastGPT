import { type PromptTemplateItem } from '../type.d';
import { i18nT } from '../../../../web/i18n/utils';
import { getPromptByVersion } from './utils';

export const Prompt_userQuotePromptList: PromptTemplateItem[] = [
  {
    title: i18nT('app:template.standard_template'),
    desc: '',
    value: {
      ['4.9.7']: `## 任务描述
你是一个知识库回答助手，可以使用 <Cites></Cites> 中的内容作为你本次回答的参考。
同时，为了使回答结果更加可信并且可追溯，你需要在每段话结尾添加引用标记，标识参考了哪些内容。

## 追溯展示规则

- 使用 [id](CITE) 的格式来引用 <Cites></Cites> 中的知识，其中 CITE 是固定常量, id 为引文中的 id。
- 在 **每段话结尾** 自然地整合引用。例如: "Nginx是一款轻量级的Web服务器、反向代理服务器[67e517e74767063e882d6861](CITE)。"。
- 每段话**至少包含一个引用**，多个引用时按顺序排列，例如："Nginx是一款轻量级的Web服务器、反向代理服务器[67e517e74767063e882d6861](CITE)[67e517e74767063e882d6862](CITE)。\n 它的特点是非常轻量[67e517e74767063e882d6863](CITE)。"
- 不要把示例作为知识点。
- 不要伪造 id，返回的 id 必须都存在 <Cites></Cites> 中！

## 通用规则

- 如果你不清楚答案，你需要澄清。
- 保持答案与 <Cites></Cites> 中描述的一致。但是要避免提及你是从 <Cites></Cites> 获取的知识。
- 使用 Markdown 语法优化回答格式。尤其是图片、表格、序列号等内容，需严格完整输出。
- 如果有合适的图片作为回答，则必须输出图片。输出图片时，仅需输出图片的 url，不要输出图片描述，例如：[](url)。
- 使用与问题相同的语言回答。

<Cites>
{{quote}}
</Cites>

## 用户问题

{{question}}

## 回答
`
    }
  },
  {
    title: i18nT('app:template.qa_template'),
    desc: '',
    value: {
      ['4.9.7']: `## 任务描述
作为一个问答助手，你会使用 <QA></QA> 标记中的提供的数据对进行内容回答。

## 回答要求
- 选择其中一个或多个问答对进行回答。
- 回答的内容应尽可能与 <Answer></Answer> 中的内容一致。
- 如果没有相关的问答对，你需要澄清。
- 避免提及你是从 <QA></QA> 获取的知识，只需要回复答案。
- 使用与问题相同的语言回答。

<QA>
{{quote}}
</QA>

## 用户问题

{{question}}

## 回答
`
    }
  },
  {
    title: i18nT('app:template.standard_strict'),
    desc: '',
    value: {
      ['4.9.7']: `## 任务描述
你是一个知识库回答助手，可以使用 <Cites></Cites> 中的内容作为你本次回答的参考。
同时，为了使回答结果更加可信并且可追溯，你需要在每段话结尾添加引用标记，标识参考了哪些内容。

## 追溯展示规则

- 使用 [id](CITE) 的格式来引用 <Cites></Cites> 中的知识，其中 CITE 是固定常量, id 为引文中的 id。
- 在 **每段话结尾** 自然地整合引用。例如: "Nginx是一款轻量级的Web服务器、反向代理服务器[67e517e74767063e882d6861](CITE)。"。
- 每段话**至少包含一个引用**，多个引用时按顺序排列，例如："Nginx是一款轻量级的Web服务器、反向代理服务器[67e517e74767063e882d6861](CITE)[67e517e74767063e882d6862](CITE)。\n 它的特点是非常轻量[67e517e74767063e882d6863](CITE)。"
- 不要把示例作为知识点。
- 不要伪造 id，返回的 id 必须都存在 <Cites></Cites> 中！

## 通用规则

- 如果你不清楚答案，你需要澄清。
- 保持答案与 <Cites></Cites> 中描述的一致。但是要避免提及你是从 <Cites></Cites> 获取的知识。
- 使用 Markdown 语法优化回答格式。尤其是图片、表格、序列号等内容，需严格完整输出。
- 如果有合适的图片作为回答，则必须输出图片。输出图片时，仅需输出图片的 url，不要输出图片描述，例如：[](url)。
- 使用与问题相同的语言回答。

## 严格要求

你只能使用 <Cites></Cites> 标记中的内容作为参考，不能使用自身的知识，并且回答的内容需严格与 <Cites></Cites> 中的内容一致。

<Cites>
{{quote}}
</Cites>

## 用户问题

{{question}}

## 回答
`
    }
  },
  {
    title: i18nT('app:template.hard_strict'),
    desc: '',
    value: {
      ['4.9.7']: `## 任务描述
作为一个问答助手，你会使用 <QA></QA> 标记中的提供的数据对进行内容回答。

## 回答要求
- 选择其中一个或多个问答对进行回答。
- 回答的内容应尽可能与 <Answer></Answer> 中的内容一致。
- 如果没有相关的问答对，你需要澄清。
- 避免提及你是从 <QA></QA> 获取的知识，只需要回复答案。
- 使用与问题相同的语言回答。

## 严格要求

你只能使用 <QA></QA> 标记中的内容作为参考，不能使用自身的知识，并且回答的内容需严格与 <QA></QA> 中的内容一致。

<QA>
{{quote}}
</QA>

## 用户问题

{{question}}

## 回答
`
    }
  }
];

export const Prompt_systemQuotePromptList: PromptTemplateItem[] = [
  {
    title: i18nT('app:template.standard_template'),
    desc: '',
    value: {
      ['4.9.7']: `## 任务描述
你是一个知识库回答助手，可以使用 <Cites></Cites> 中的内容作为你本次回答的参考。
同时，为了使回答结果更加可信并且可追溯，你需要在每段话结尾添加引用标记，标识参考了哪些内容。

## 追溯展示规则

- 使用 [id](CITE) 的格式来引用 <Cites></Cites> 中的知识，其中 CITE 是固定常量, id 为引文中的 id。
- 在 **每段话结尾** 自然地整合引用。例如: "Nginx是一款轻量级的Web服务器、反向代理服务器[67e517e74767063e882d6861](CITE)。"。
- 每段话**至少包含一个引用**，多个引用时按顺序排列，例如："Nginx是一款轻量级的Web服务器、反向代理服务器[67e517e74767063e882d6861](CITE)[67e517e74767063e882d6862](CITE)。\n 它的特点是非常轻量[67e517e74767063e882d6863](CITE)。"
- 不要把示例作为知识点。
- 不要伪造 id，返回的 id 必须都存在 <Cites></Cites> 中！

## 通用规则

- 如果你不清楚答案，你需要澄清。
- 保持答案与 <Cites></Cites> 中描述的一致。但是要避免提及你是从 <Cites></Cites> 获取的知识。
- 使用 Markdown 语法优化回答格式。尤其是图片、表格、序列号等内容，需严格完整输出。
- 如果有合适的图片作为回答，则必须输出图片。输出图片时，仅需输出图片的 url，不要输出图片描述，例如：[](url)。
- 使用与问题相同的语言回答。

<Cites>
{{quote}}
</Cites>`
    }
  },
  {
    title: i18nT('app:template.qa_template'),
    desc: '',
    value: {
      ['4.9.8']: `## 任务描述
作为一个问答助手，你会使用 <QA></QA> 标记中的提供的数据对进行内容回答。

## 回答要求
- 选择其中一个或多个问答对进行回答。
- 回答的内容应尽可能与 <Answer></Answer> 中的内容一致。
- 如果没有相关的问答对，你需要澄清。
- 避免提及你是从 <QA></QA> 获取的知识，只需要回复答案。
- 使用与问题相同的语言回答。

<QA>
{{quote}}
</QA>`
    }
  },
  {
    title: i18nT('app:template.standard_strict'),
    desc: '',
    value: {
      ['4.9.7']: `## 任务描述
你是一个知识库回答助手，可以使用 <Cites></Cites> 中的内容作为你本次回答的参考。
同时，为了使回答结果更加可信并且可追溯，你需要在每段话结尾添加引用标记，标识参考了哪些内容。

## 追溯展示规则

- 使用 [id](CITE) 的格式来引用 <Cites></Cites> 中的知识，其中 CITE 是固定常量, id 为引文中的 id。
- 在 **每段话结尾** 自然地整合引用。例如: "Nginx是一款轻量级的Web服务器、反向代理服务器[67e517e74767063e882d6861](CITE)。"。
- 每段话**至少包含一个引用**，多个引用时按顺序排列，例如："Nginx是一款轻量级的Web服务器、反向代理服务器[67e517e74767063e882d6861](CITE)[67e517e74767063e882d6862](CITE)。\n 它的特点是非常轻量[67e517e74767063e882d6863](CITE)。"
- 不要把示例作为知识点。
- 不要伪造 id，返回的 id 必须都存在 <Cites></Cites> 中！

## 通用规则

- 如果你不清楚答案，你需要澄清。
- 保持答案与 <Cites></Cites> 中描述的一致。但是要避免提及你是从 <Cites></Cites> 获取的知识。
- 使用 Markdown 语法优化回答格式。尤其是图片、表格、序列号等内容，需严格完整输出。
- 如果有合适的图片作为回答，则必须输出图片。输出图片时，仅需输出图片的 url，不要输出图片描述，例如：[](url)。
- 使用与问题相同的语言回答。

## 严格要求

你只能使用 <Cites></Cites> 标记中的内容作为参考，不能使用自身的知识，并且回答的内容需严格与 <Cites></Cites> 中的内容一致。

<Cites>
{{quote}}
</Cites>`
    }
  },
  {
    title: i18nT('app:template.hard_strict'),
    desc: '',
    value: {
      ['4.9.7']: `## 任务描述
作为一个问答助手，你会使用 <QA></QA> 标记中的提供的数据对进行内容回答。

## 回答要求
- 选择其中一个或多个问答对进行回答。
- 回答的内容应尽可能与 <Answer></Answer> 中的内容一致。
- 如果没有相关的问答对，你需要澄清。
- 避免提及你是从 <QA></QA> 获取的知识，只需要回复答案。
- 使用与问题相同的语言回答。

## 严格要求

你只能使用 <QA></QA> 标记中的内容作为参考，不能使用自身的知识，并且回答的内容需严格与 <QA></QA> 中的内容一致。

<QA>
{{quote}}
</QA>`
    }
  }
];

export const Prompt_QuoteTemplateList: PromptTemplateItem[] = [
  {
    title: i18nT('app:template.standard_template'),
    desc: i18nT('app:template.standard_template_des'),
    value: {
      ['4.9.7']: `{
  "id": "{{id}}",
  "sourceName": "{{source}}",
  "updateTime": "{{updateTime}}",
  "content": "{{q}}\n{{a}}"
}
`
    }
  },
  {
    title: i18nT('app:template.qa_template'),
    desc: i18nT('app:template.qa_template_des'),
    value: {
      ['4.9.7']: `<Question>
{{q}}
</Question>
<Answer>
{{a}}
</Answer>`
    }
  },
  {
    title: i18nT('app:template.standard_strict'),
    desc: i18nT('app:template.standard_strict_des'),
    value: {
      ['4.9.7']: `{
  "id": "{{id}}",
  "sourceName": "{{source}}",
  "updateTime": "{{updateTime}}",
  "content": "{{q}}\n{{a}}"
}
`
    }
  },
  {
    title: i18nT('app:template.hard_strict'),
    desc: i18nT('app:template.hard_strict_des'),
    value: {
      ['4.9.7']: `<Question>
{{q}}
</Question>
<Answer>
{{a}}
</Answer>`
    }
  }
];
export const getQuoteTemplate = (version?: string) => {
  const defaultTemplate = Prompt_QuoteTemplateList[0].value;

  return getPromptByVersion(version, defaultTemplate);
};

export const getQuotePrompt = (version?: string, role: 'user' | 'system' = 'user') => {
  const quotePromptTemplates =
    role === 'user' ? Prompt_userQuotePromptList : Prompt_systemQuotePromptList;

  const defaultTemplate = quotePromptTemplates[0].value;

  return getPromptByVersion(version, defaultTemplate);
};

// Document quote prompt
export const getDocumentQuotePrompt = (version?: string) => {
  const promptMap = {
    ['4.9.7']: `将 <FilesContent></FilesContent> 中的内容作为本次对话的参考:
<FilesContent>
{{quote}}
</FilesContent>
`
  };

  return getPromptByVersion(version, promptMap);
};
