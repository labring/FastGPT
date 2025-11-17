import { it, expect } from 'vitest'; // 必须显式导入
import { splitText2Chunks } from '@fastgpt/global/common/string/textSplitter';
import fs from 'fs';

const simpleChunks = (chunks: string[]) => {
  return chunks.map((chunk) => chunk.replace(/\s+/g, ''));
};

// 简单的嵌套测试
it(`Test splitText2Chunks 1`, () => {
  const mock = {
    text: `# A

af da da fda a a 

## B

阿凡撒发生的都是发大水

### c

dsgsgfsgs22

#### D

dsgsgfsgs22

##### E

dsgsgfsgs22sddddddd
`,
    result: [
      `# A

af da da fda a a`,
      `# A
## B

阿凡撒发生的都是发大水`,
      `# A
## B
### c

dsgsgfsgs22`,
      `# A
## B
### c
#### D

dsgsgfsgs22`,
      `# A
## B
### c
#### D
##### E

dsgsgfsgs22sddddddd`
    ]
  };

  const { chunks } = splitText2Chunks({ text: mock.text, chunkSize: 2000 });
  expect(chunks).toEqual(mock.result);
});
it(`Test splitText2Chunks 2`, () => {
  const mock = {
    text: `# A

af da da fda a a 

### D

dsgsgfsgs22`,
    result: [
      `# A

af da da fda a a`,
      `# A
### D

dsgsgfsgs22`
    ]
  };

  const { chunks } = splitText2Chunks({ text: mock.text, chunkSize: 2000 });
  expect(chunks).toEqual(mock.result);
});

// 普通文本测试：单段不超过 500 字符
it(`Test splitText2Chunks 3`, () => {
  const mock = {
    text: `快速了解 FastGPT
FastGPT 的能力与优势

FastGPT 是一个基于 LLM 大语言模型的知识库问答系统，提供开箱即用的数据处理、模型调用等能力。同时可以通过 Flow 可视化进行工作流编排，从而实现复杂的问答场景！

FastGPT 在线使用：https://fastgpt.io

FastGPT 能力 
1. 专属 AI 客服 
通过导入文档或已有问答对进行训练，让 AI 模型能根据你的文档以交互式对话方式回答问题。

2. 简单易用的可视化界面 
FastGPT 采用直观的可视化界面设计，为各种应用场景提供了丰富实用的功能。通过简洁易懂的操作步骤，可以轻松完成 AI 客服的创建和训练流程。

3. 自动数据预处理 
提供手动输入、直接分段、LLM 自动处理和 CSV 等多种数据导入途径，其中“直接分段”支持通过 PDF、WORD、Markdown 和 CSV 文档内容作为上下文。FastGPT 会自动对文本数据进行预处理、向量化和 QA 分割，节省手动训练时间，提升效能。

4. 工作流编排 
基于 Flow 模块的工作流编排，可以帮助你设计更加复杂的问答流程。例如查询数据库、查询库存、预约实验室等。

5. 强大的 API 集成 
FastGPT 对外的 API 接口对齐了 OpenAI 官方接口，可以直接接入现有的 GPT 应用，也可以轻松集成到企业微信、公众号、飞书等平台。

FastGPT 特点 
项目开源

FastGPT 遵循附加条件 Apache License 2.0 开源协议，你可以 Fork 之后进行二次开发和发布。FastGPT 社区版将保留核心功能，商业版仅在社区版基础上使用 API 的形式进行扩展，不影响学习使用。

独特的 QA 结构

针对客服问答场景设计的 QA 结构，提高在大量数据场景中的问答准确性。

可视化工作流

通过 Flow 模块展示了从问题输入到模型输出的完整流程，便于调试和设计复杂流程。

无限扩展

基于 API 进行扩展，无需修改 FastGPT 源码，也可快速接入现有的程序中。

便于调试

提供搜索测试、引用修改、完整对话预览等多种调试途径。

支持多种模型

支持 GPT、Claude、文心一言等多种 LLM 模型，未来也将支持自定义的向量模型。

知识库核心流程

FastGPT AI 相关参数配置说明

在 FastGPT 的 AI 对话模块中，有一个 AI 高级配置，里面包含了 AI 模型的参数配置，本文详细介绍这些配置的含义。

返回AI内容（高级编排特有） 
这是一个开关，打开的时候，当 AI 对话模块运行时，会将其输出的内容返回到浏览器（API响应）；如果关闭，AI 输出的内容不会返回到浏览器，但是生成的内容仍可以通过【AI回复】进行输出。你可以将【AI回复】连接到其他模块中。

最大上下文 
代表模型最多容纳的文字数量。

函数调用 
支持函数调用的模型，在使用工具时更加准确。

温度 
越低回答越严谨，少废话（实测下来，感觉差别不大）

回复上限 
最大回复 token 数量。注意，是回复的Tokens！不是上下文 tokens。

系统提示词 
被放置在上下文数组的最前面，role 为 system，用于引导模型。

引用模板 & 引用提示词 
这两个参数与知识库问答场景相关，可以控制知识库相关的提示词。

AI 对话消息组成 
想使用明白这两个变量，首先要了解传递传递给 AI 模型的消息格式。它是一个数组，FastGPT 中这个数组的组成形式为：

[
内置提示词（config.json 配置，一般为空）
系统提示词 （用户输入的提示词）
历史记录
问题（由引用提示词、引用模板和用户问题组成）
]
🍅

Tips: 可以通过点击上下文按键查看完整的上下文组成，便于调试。

引用模板和提示词设计 
简易模式已移除该功能，仅在工作流中可配置，可点击工作流中AI对话节点内，知识库引用旁边的setting icon进行配置。随着模型的增强，这部分功能将逐步弱化。

引用模板和引用提示词通常是成对出现，引用提示词依赖引用模板。

FastGPT 知识库采用 QA 对(不一定都是问答格式，仅代表两个变量)的格式存储，在转义成字符串时候会根据引用模板来进行格式化。知识库包含多个可用变量： q, a, sourceId（数据的ID）, index(第n个数据), source(数据的集合名、文件名)，score(距离得分，0-1) 可以通过 {{q}} {{a}} {{sourceId}} {{index}} {{source}} {{score}} 按需引入。下面一个模板例子：

可以通过 知识库结构讲解 了解详细的知识库的结构。

引用模板 
{instruction:"{{q}}",output:"{{a}}",source:"{{source}}"}
搜索到的知识库，会自动将 q,a,source 替换成对应的内容。每条搜索到的内容，会通过 \n 隔开。例如：

{instruction:"电影《铃芽之旅》的导演是谁？",output:"电影《铃芽之旅》的导演是新海诚。",source:"手动输入"}
{instruction:"本作的主人公是谁？",output:"本作的主人公是名叫铃芽的少女。",source:""}
{instruction:"电影《铃芽之旅》男主角是谁？",output:"电影《铃芽之旅》男主角是宗像草太，由松村北斗配音。",source:""}
{instruction:"电影《铃芽之旅》的编剧是谁？22",output:"新海诚是本片的编剧。",source:"手动输入"}
引用提示词 
引用模板需要和引用提示词一起使用，提示词中可以写引用模板的格式说明以及对话的要求等。可以使用 {{quote}} 来使用 引用模板，使用 {{question}} 来引入问题。例如：

你的背景知识:
"""
{{quote}}
"""
对话要求：
1. 背景知识是最新的，其中 instruction 是相关介绍，output 是预期回答或补充。
2. 使用背景知识回答问题。
3. 背景知识无法回答问题时，你可以礼貌的的回答用户问题。
我的问题是:"{{question}}"
转义后则为：

你的背景知识:
"""
{instruction:"电影《铃芽之旅》的导演是谁？",output:"电影《铃芽之旅》的导演是新海诚。",source:"手动输入"}
{instruction:"本作的主人公是谁？",output:"本作的主人公是名叫铃芽的少女。",source:""}
{instruction:"电影《铃芽之旅》男主角是谁？",output:"电影《铃芽之旅》男主角是宗像草太，由松村北斗配音}
"""
对话要求：
1. 背景知识是最新的，其中 instruction 是相关介绍，output 是预期回答或补充。
2. 使用背景知识回答问题。
3. 背景知识无法回答问题时，你可以礼貌的的回答用户问题。
我的问题是:"{{question}}"
总结 
引用模板规定了搜索出来的内容如何组成一句话，其由 q,a,index,source 多个变量组成。

引用提示词由引用模板和提示词组成，提示词通常是对引用模板的一个描述，加上对模型的要求。

引用模板和提示词设计 示例 
通用模板与问答模板对比 
我们通过一组你是谁的手动数据，对通用模板与问答模板的效果进行对比。此处特意打了个搞笑的答案，通用模板下 GPT35 就变得不那么听话了，`,
    result: [
      '快速了解 FastGPT\nFastGPT 的能力与优势\n\nFastGPT 是一个基于 LLM 大语言模型的知识库问答系统，提供开箱即用的数据处理、模型调用等能力。同时可以通过 Flow 可视化进行工作流编排，从而实现复杂的问答场景！\n\nFastGPT 在线使用：https://fastgpt.io\n\nFastGPT 能力 \n1. 专属 AI 客服 \n通过导入文档或已有问答对进行训练，让 AI 模型能根据你的文档以交互式对话方式回答问题。\n\n2. 简单易用的可视化界面 \nFastGPT 采用直观的可视化界面设计，为各种应用场景提供了丰富实用的功能。通过简洁易懂的操作步骤，可以轻松完成 AI 客服的创建和训练流程。\n\n3. 自动数据预处理 \n提供手动输入、直接分段、LLM 自动处理和 CSV 等多种数据导入途径，其中“直接分段”支持通过 PDF、WORD、Markdown 和 CSV 文档内容作为上下文。FastGPT 会自动对文本数据进行预处理、向量化和 QA 分割，节省手动训练时间，提升效能。\n\n4. 工作流编排 \n基于 Flow 模块的工作流编排，可以帮助你设计更加复杂的问答流程。例如查询数据库、查询库存、预约实验室等。\n\n5. 强大的 API 集成 \nFastGPT 对外的 API 接口对齐了 OpenAI 官方接口，可以直接接入现有的 GPT 应用，也可以轻松集成到企业微信、公众号、飞书等平台。',
      'FastGPT 特点 \n项目开源\n\nFastGPT 遵循附加条件 Apache License 2.0 开源协议，你可以 Fork 之后进行二次开发和发布。FastGPT 社区版将保留核心功能，商业版仅在社区版基础上使用 API 的形式进行扩展，不影响学习使用。\n\n独特的 QA 结构\n\n针对客服问答场景设计的 QA 结构，提高在大量数据场景中的问答准确性。\n\n可视化工作流\n\n通过 Flow 模块展示了从问题输入到模型输出的完整流程，便于调试和设计复杂流程。\n\n无限扩展\n\n基于 API 进行扩展，无需修改 FastGPT 源码，也可快速接入现有的程序中。\n\n便于调试\n\n提供搜索测试、引用修改、完整对话预览等多种调试途径。\n\n支持多种模型\n\n支持 GPT、Claude、文心一言等多种 LLM 模型，未来也将支持自定义的向量模型。\n\n知识库核心流程\n\nFastGPT AI 相关参数配置说明\n\n在 FastGPT 的 AI 对话模块中，有一个 AI 高级配置，里面包含了 AI 模型的参数配置，本文详细介绍这些配置的含义。\n\n返回AI内容（高级编排特有） \n这是一个开关，打开的时候，当 AI 对话模块运行时，会将其输出的内容返回到浏览器（API响应）；如果关闭，AI 输出的内容不会返回到浏览器，但是生成的内容仍可以通过【AI回复】进行输出。你可以将【AI回复】连接到其他模块中。',
      '最大上下文 \n代表模型最多容纳的文字数量。\n\n函数调用 \n支持函数调用的模型，在使用工具时更加准确。\n\n温度 \n越低回答越严谨，少废话（实测下来，感觉差别不大）\n\n回复上限 \n最大回复 token 数量。注意，是回复的Tokens！不是上下文 tokens。\n\n系统提示词 \n被放置在上下文数组的最前面，role 为 system，用于引导模型。\n\n引用模板 & 引用提示词 \n这两个参数与知识库问答场景相关，可以控制知识库相关的提示词。\n\nAI 对话消息组成 \n想使用明白这两个变量，首先要了解传递传递给 AI 模型的消息格式。它是一个数组，FastGPT 中这个数组的组成形式为：\n\n[\n内置提示词（config.json 配置，一般为空）\n系统提示词 （用户输入的提示词）\n历史记录\n问题（由引用提示词、引用模板和用户问题组成）\n]\n🍅\n\nTips: 可以通过点击上下文按键查看完整的上下文组成，便于调试。\n\n引用模板和提示词设计 \n简易模式已移除该功能，仅在工作流中可配置，可点击工作流中AI对话节点内，知识库引用旁边的setting icon进行配置。随着模型的增强，这部分功能将逐步弱化。\n\n引用模板和引用提示词通常是成对出现，引用提示词依赖引用模板。',
      'FastGPT 知识库采用 QA 对(不一定都是问答格式，仅代表两个变量)的格式存储，在转义成字符串时候会根据引用模板来进行格式化。知识库包含多个可用变量： q, a, sourceId（数据的ID）, index(第n个数据), source(数据的集合名、文件名)，score(距离得分，0-1) 可以通过 {{q}} {{a}} {{sourceId}} {{index}} {{source}} {{score}} 按需引入。下面一个模板例子：\n\n可以通过 知识库结构讲解 了解详细的知识库的结构。\n\n引用模板 \n{instruction:"{{q}}",output:"{{a}}",source:"{{source}}"}\n搜索到的知识库，会自动将 q,a,source 替换成对应的内容。每条搜索到的内容，会通过 \n 隔开。例如：\n\n{instruction:"电影《铃芽之旅》的导演是谁？",output:"电影《铃芽之旅》的导演是新海诚。",source:"手动输入"}\n{instruction:"本作的主人公是谁？",output:"本作的主人公是名叫铃芽的少女。",source:""}\n{instruction:"电影《铃芽之旅》男主角是谁？",output:"电影《铃芽之旅》男主角是宗像草太，由松村北斗配音。",source:""}\n{instruction:"电影《铃芽之旅》的编剧是谁？22",output:"新海诚是本片的编剧。",source:"手动输入"}\n引用提示词 \n引用模板需要和引用提示词一起使用，提示词中可以写引用模板的格式说明以及对话的要求等。可以使用 {{quote}} 来使用 引用模板，使用 {{question}} 来引入问题。例如：',
      '你的背景知识:\n"""\n{{quote}}\n"""\n对话要求：\n1. 背景知识是最新的，其中 instruction 是相关介绍，output 是预期回答或补充。\n2. 使用背景知识回答问题。\n3. 背景知识无法回答问题时，你可以礼貌的的回答用户问题。\n我的问题是:"{{question}}"\n转义后则为：\n\n你的背景知识:\n"""\n{instruction:"电影《铃芽之旅》的导演是谁？",output:"电影《铃芽之旅》的导演是新海诚。",source:"手动输入"}\n{instruction:"本作的主人公是谁？",output:"本作的主人公是名叫铃芽的少女。",source:""}\n{instruction:"电影《铃芽之旅》男主角是谁？",output:"电影《铃芽之旅》男主角是宗像草太，由松村北斗配音}\n"""\n对话要求：\n1. 背景知识是最新的，其中 instruction 是相关介绍，output 是预期回答或补充。\n2. 使用背景知识回答问题。\n3. 背景知识无法回答问题时，你可以礼貌的的回答用户问题。\n我的问题是:"{{question}}"\n总结 \n引用模板规定了搜索出来的内容如何组成一句话，其由 q,a,index,source 多个变量组成。\n\n引用提示词由引用模板和提示词组成，提示词通常是对引用模板的一个描述，加上对模型的要求。\n\n引用模板和提示词设计 示例 \n通用模板与问答模板对比 \n我们通过一组你是谁的手动数据，对通用模板与问答模板的效果进行对比。此处特意打了个搞笑的答案，通用模板下 GPT35 就变得不那么听话了，'
    ]
  };

  const { chunks } = splitText2Chunks({ text: mock.text, chunkSize: 500 });

  const normalizedChunks = simpleChunks(chunks);
  const normalizedExpected = simpleChunks(mock.result);

  expect(normalizedChunks).toEqual(normalizedExpected);
});

// 普通文本测试：单段超过 500 字符，有 20% 重叠
it(`Test splitText2Chunks 4`, () => {
  const mock = {
    text: `FastGPT是一款基于大语言模型（LLM）的智能问答系统，专为提供高效、准确的知识库问答服务而设计。它支持多种数据导入方式，包括手动输入、PDF、WORD、Markdown和CSV等格式，能够自动进行数据预处理、向量化和QA分割，大幅提升数据处理效率。FastGPT的可视化界面设计简洁直观，用户可以通过Flow模块进行工作流编排，轻松实现复杂的问答场景。此外，FastGPT支持多种LLM模型，如GPT、Claude、文心一言等，未来还将支持自定义的向量模型。其强大的API集成能力使得用户可以轻松将其接入现有的GPT应用或其他平台，如企业微信、公众号、飞书等。FastGPT的开源项目遵循Apache License 2.0协议，用户可以进行二次开发和发布。其独特的QA结构设计提高了在大量数据场景中的问答准确性，而可视化工作流则展示了从问题输入到模型输出的完整流程，便于调试和设计复杂流程。FastGPT还提供了多种调试途径，如搜索测试、引用修改和完整对话预览等，方便用户进行调试。其知识库核心流程包括AI相关参数配置说明，如返回AI内容、最大上下文、函数调用、温度、回复上限、系统提示词、引用模板和引用提示词等。通过这些配置，用户可以更好地控制和优化AI模型的表现。FastGPT的引用模板和提示词设计使得用户可以根据具体需求进行灵活配置，从而提高问答的准确性和效率。总之，FastGPT是一款功能强大、易于使用的智能问答系统，适用于各种应用场景，帮助用户实现高效、准确的知识库问答服务。FastGPT的设计理念是通过先进的技术手段简化用户的操作流程，使得即便是没有技术背景的用户也能轻松上手。其多样化的数据导入方式确保了用户可以根据自身需求选择最合适的方式进行数据输入，而自动化的数据预处理功能则大大减少了用户的工作量。通过对数据的向量化处理，FastGPT能够更好地理解和分析用户的问题，从而提供更为精准的回答。其支持的多种LLM模型使得用户可以根据不同的应用场景选择最合适的模型进行问答，而未来的自定义向量模型支持则为用户提供了更多的可能性。FastGPT的API集成能力不仅体现在与现有GPT应用的无缝对接上，还可以轻松集成到企业微信、公众号、飞书等平台，使得用户可以在不同的平台上享受到FastGPT带来的便利。其开源项目的开放性使得用户可以根据自身需求进行二次开发和发布，从而实现个性化的问答服务。FastGPT的QA结构设计独具匠心，通过对问答流程的优化，提高了在大量数据场景中的问答准确性。可视化工作流的引入则使得用户可以直观地看到从问题输入到模型输出的完整流程，便于调试和设计复杂流程。FastGPT提供的多种调试途径，如搜索测试、引用修改和完整对话预览等，使得用户可以在使用过程中随时进行调试，确保问答的准确性和效率。其知识库核心流程中的AI相关参数配置说明详细介绍了如何通过配置来优化AI模型的表现，使得用户可以根据具体需求进行灵活配置。FastGPT的引用模板和提示词设计则为用户提供了更多的定制化选项，从而提高问答的准确性和效率。总之，FastGPT是一款功能强大、易于使用的智能问答系统，适用于各种应用场景，帮助用户实现高效、准确的知识库问答服务。FastGPT的设计理念是通过先进的技术手段简化用户的操作流程，使得即便是没有技术背景的用户也能轻松上手。其多样化的数据导入方式确保了用户可以根据自身需求选择最合适的方式进行数据输入，而自动化的数据预处理功能则大大减少了用户的工作量。通过对数据的向量化处理，FastGPT能够更好地理解和分析用户的问题，从而提供更为精准的回答。其支持的多种LLM模型使得用户可以根据不同的应用场景选择最合适的模型进行问答，而未来的自定义向量模型支持则为用户提供了更多的可能性。FastGPT的API集成能力不仅体现在与现有GPT应用的无缝对接上，还可以轻松集成到企业微信、公众号、飞书等平台，使得用户可以在不同的平台上享受到FastGPT带来的便利。其开源项目的开放性使得用户可以根据自身需求进行二次开发和发布，从而实现个性化的问答服务。FastGPT的QA结构设计独具匠心，通过对问答流程的优化，提高了在大量数据场景中的问答准确性。可视化工作流的引入则使得用户可以直观地看到从问题输入到模型输出的完整流程，便于调试和设计复杂流程。FastGPT提供的多种调试途径，如搜索测试、引用修改和完整对话预览等，使得用户可以在使用过程中随时进行调试，确保问答的准确性和效率。其知识库核心流程中的AI相关参数配置说明详细介绍了如何通过配置来优化AI模型的表现，使得用户可以根据具体需求进行灵活配置。FastGPT的引用模板和提示词设计则为用户提供了更多的定制化选项，从而提高问答的准确性和效率。总之，FastGPT是一款功能强大、易于使用的智能问答系统，适用于各种应用场景，帮助用户实现高效、准确的知识库问答服务。`,
    result: [
      `FastGPT是一款基于大语言模型（LLM）的智能问答系统，专为提供高效、准确的知识库问答服务而设计。它支持多种数据导入方式，包括手动输入、PDF、WORD、Markdown和CSV等格式，能够自动进行数据预处理、向量化和QA分割，大幅提升数据处理效率。FastGPT的可视化界面设计简洁直观，用户可以通过Flow模块进行工作流编排，轻松实现复杂的问答场景。此外，FastGPT支持多种LLM模型，如GPT、Claude、文心一言等，未来还将支持自定义的向量模型。其强大的API集成能力使得用户可以轻松将其接入现有的GPT应用或其他平台，如企业微信、公众号、飞书等。FastGPT的开源项目遵循Apache License 2.0协议，用户可以进行二次开发和发布。其独特的QA结构设计提高了在大量数据场景中的问答准确性，而可视化工作流则展示了从问题输入到模型输出的完整流程，便于调试和设计复杂流程。FastGPT还提供了多种调试途径，如搜索测试、引用修改和完整对话预览等，方便用户进行调试。其知识库核心流程包括AI相关参数配置说明，如返回AI内容、最大上下文、函数调用、温度、回复上限、系统提示词、引用模板和引用提示词等。`,
      `FastGPT还提供了多种调试途径，如搜索测试、引用修改和完整对话预览等，方便用户进行调试。其知识库核心流程包括AI相关参数配置说明，如返回AI内容、最大上下文、函数调用、温度、回复上限、系统提示词、引用模板和引用提示词等。通过这些配置，用户可以更好地控制和优化AI模型的表现。FastGPT的引用模板和提示词设计使得用户可以根据具体需求进行灵活配置，从而提高问答的准确性和效率。总之，FastGPT是一款功能强大、易于使用的智能问答系统，适用于各种应用场景，帮助用户实现高效、准确的知识库问答服务。FastGPT的设计理念是通过先进的技术手段简化用户的操作流程，使得即便是没有技术背景的用户也能轻松上手。其多样化的数据导入方式确保了用户可以根据自身需求选择最合适的方式进行数据输入，而自动化的数据预处理功能则大大减少了用户的工作量。通过对数据的向量化处理，FastGPT能够更好地理解和分析用户的问题，从而提供更为精准的回答。其支持的多种LLM模型使得用户可以根据不同的应用场景选择最合适的模型进行问答，而未来的自定义向量模型支持则为用户提供了更多的可能性。FastGPT的API集成能力不仅体现在与现有GPT应用的无缝对接上，还可以轻松集成到企业微信、公众号、飞书等平台，使得用户可以在不同的平台上享受到FastGPT带来的便利。`,
      `其支持的多种LLM模型使得用户可以根据不同的应用场景选择最合适的模型进行问答，而未来的自定义向量模型支持则为用户提供了更多的可能性。FastGPT的API集成能力不仅体现在与现有GPT应用的无缝对接上，还可以轻松集成到企业微信、公众号、飞书等平台，使得用户可以在不同的平台上享受到FastGPT带来的便利。其开源项目的开放性使得用户可以根据自身需求进行二次开发和发布，从而实现个性化的问答服务。FastGPT的QA结构设计独具匠心，通过对问答流程的优化，提高了在大量数据场景中的问答准确性。可视化工作流的引入则使得用户可以直观地看到从问题输入到模型输出的完整流程，便于调试和设计复杂流程。FastGPT提供的多种调试途径，如搜索测试、引用修改和完整对话预览等，使得用户可以在使用过程中随时进行调试，确保问答的准确性和效率。其知识库核心流程中的AI相关参数配置说明详细介绍了如何通过配置来优化AI模型的表现，使得用户可以根据具体需求进行灵活配置。FastGPT的引用模板和提示词设计则为用户提供了更多的定制化选项，从而提高问答的准确性和效率。总之，FastGPT是一款功能强大、易于使用的智能问答系统，适用于各种应用场景，帮助用户实现高效、准确的知识库问答服务。`,
      `FastGPT的引用模板和提示词设计则为用户提供了更多的定制化选项，从而提高问答的准确性和效率。总之，FastGPT是一款功能强大、易于使用的智能问答系统，适用于各种应用场景，帮助用户实现高效、准确的知识库问答服务。FastGPT的设计理念是通过先进的技术手段简化用户的操作流程，使得即便是没有技术背景的用户也能轻松上手。其多样化的数据导入方式确保了用户可以根据自身需求选择最合适的方式进行数据输入，而自动化的数据预处理功能则大大减少了用户的工作量。通过对数据的向量化处理，FastGPT能够更好地理解和分析用户的问题，从而提供更为精准的回答。其支持的多种LLM模型使得用户可以根据不同的应用场景选择最合适的模型进行问答，而未来的自定义向量模型支持则为用户提供了更多的可能性。FastGPT的API集成能力不仅体现在与现有GPT应用的无缝对接上，还可以轻松集成到企业微信、公众号、飞书等平台，使得用户可以在不同的平台上享受到FastGPT带来的便利。其开源项目的开放性使得用户可以根据自身需求进行二次开发和发布，从而实现个性化的问答服务。FastGPT的QA结构设计独具匠心，通过对问答流程的优化，提高了在大量数据场景中的问答准确性。`,
      `FastGPT的API集成能力不仅体现在与现有GPT应用的无缝对接上，还可以轻松集成到企业微信、公众号、飞书等平台，使得用户可以在不同的平台上享受到FastGPT带来的便利。其开源项目的开放性使得用户可以根据自身需求进行二次开发和发布，从而实现个性化的问答服务。FastGPT的QA结构设计独具匠心，通过对问答流程的优化，提高了在大量数据场景中的问答准确性。可视化工作流的引入则使得用户可以直观地看到从问题输入到模型输出的完整流程，便于调试和设计复杂流程。FastGPT提供的多种调试途径，如搜索测试、引用修改和完整对话预览等，使得用户可以在使用过程中随时进行调试，确保问答的准确性和效率。其知识库核心流程中的AI相关参数配置说明详细介绍了如何通过配置来优化AI模型的表现，使得用户可以根据具体需求进行灵活配置。FastGPT的引用模板和提示词设计则为用户提供了更多的定制化选项，从而提高问答的准确性和效率。总之，FastGPT是一款功能强大、易于使用的智能问答系统，适用于各种应用场景，帮助用户实现高效、准确的知识库问答服务。`
    ]
  };

  const { chunks } = splitText2Chunks({ text: mock.text, chunkSize: 500, overlapRatio: 0.2 });

  expect(chunks).toEqual(mock.result);
});

// 自定义分隔符测试：分割后，内容少
it(`Test splitText2Chunks 5`, () => {
  const mock = {
    text: `这是测试文本 1
----
这是测试文本 2,
---
----
这是测试文本 3
----
这是测试文本 4
----`,
    result: [
      `这是测试文本 1`,
      `这是测试文本 2,
---`,
      `这是测试文本 3`,
      `这是测试文本 4`
    ]
  };

  const { chunks } = splitText2Chunks({ text: mock.text, chunkSize: 500, customReg: ['----'] });

  expect(chunks).toEqual(mock.result);
});

// 自定义分隔符测试：分割后，内容超长，二次分割，有重叠。
it(`Test splitText2Chunks 6`, () => {
  const mock = {
    text: `这是测试文本 1，短的
----
这是测试文本 2,长的。
FastGPT是一款基于大语言模型（LLM）的智能问答系统，专为提供高效、准确的知识库问答服务而设计。它支持多种数据导入方式，包括手动输入、PDF、WORD、Markdown和CSV等格式，能够自动进行数据预处理、向量化和QA分割，大幅提升数据处理效率。FastGPT的可视化界面设计简洁直观，用户可以通过Flow模块进行工作流编排，轻松实现复杂的问答场景。此外，FastGPT支持多种LLM模型，如GPT、Claude、文心一言等，未来还将支持自定义的向量模型。其强大的API集成能力使得用户可以轻松将其接入现有的GPT应用或其他平台，如企业微信、公众号、飞书等。FastGPT的开源项目遵循Apache License 2.0协议，用户可以进行二次开发和发布。其独特的QA结构设计提高了在大量数据场景中的问答准确性，而可视化工作流则展示了从问题输入到模型输出的完整流程，便于调试和设计复杂流程。FastGPT还提供了多种调试途径，如搜索测试、引用修改和完整对话预览等，方便用户进行调试。其知识库核心流程包括AI相关参数配置说明，如返回AI内容、最大上下文、函数调用、温度、回复上限、系统提示词、引用模板和引用提示词等。通过这些配置，用户可以更好地控制和优化AI模型的表现。FastGPT的引用模板和提示词设计使得用户可以根据具体需求进行灵活配置，从而提高问答的准确性和效率。总之，FastGPT是一款功能强大、易于使用的智能问答系统，适用于各种应用场景，帮助用户实现高效、准确的知识库问答服务。FastGPT的设计理念是通过先进的技术手段简化用户的操作流程，使得即便是没有技术背景的用户也能轻松上手。其多样化的数据导入方式确保了用户可以根据自身需求选择最合适的方式进行数据输入，而自动化的数据预处理功能则大大减少了用户的工作量。通过对数据的向量化处理，FastGPT能够更好地理解和分析用户的问题，从而提供更为精准的回答。`,
    result: [
      '这是测试文本 1，短的',
      '这是测试文本 2,长的。\nFastGPT是一款基于大语言模型（LLM）的智能问答系统，专为提供高效、准确的知识库问答服务而设计。它支持多种数据导入方式，包括手动输入、PDF、WORD、Markdown和CSV等格式，能够自动进行数据预处理、向量化和QA分割，大幅提升数据处理效率。FastGPT的可视化界面设计简洁直观，用户可以通过Flow模块进行工作流编排，轻松实现复杂的问答场景。此外，FastGPT支持多种LLM模型，如GPT、Claude、文心一言等，未来还将支持自定义的向量模型。其强大的API集成能力使得用户可以轻松将其接入现有的GPT应用或其他平台，如企业微信、公众号、飞书等。FastGPT的开源项目遵循Apache License 2.0协议，用户可以进行二次开发和发布。其独特的QA结构设计提高了在大量数据场景中的问答准确性，而可视化工作流则展示了从问题输入到模型输出的完整流程，便于调试和设计复杂流程。FastGPT还提供了多种调试途径，如搜索测试、引用修改和完整对话预览等，方便用户进行调试。其知识库核心流程包括AI相关参数配置说明，如返回AI内容、最大上下文、函数调用、温度、回复上限、系统提示词、引用模板和引用提示词等。通过这些配置，用户可以更好地控制和优化AI模型的表现。FastGPT的引用模板和提示词设计使得用户可以根据具体需求进行灵活配置，从而提高问答的准确性和效率。总之，FastGPT是一款功能强大、易于使用的智能问答系统，适用于各种应用场景，帮助用户实现高效、准确的知识库问答服务。FastGPT的设计理念是通过先进的技术手段简化用户的操作流程，使得即便是没有技术背景的用户也能轻松上手。其多样化的数据导入方式确保了用户可以根据自身需求选择最合适的方式进行数据输入，而自动化的数据预处理功能则大大减少了用户的工作量。通过对数据的向量化处理，FastGPT能够更好地理解和分析用户的问题，从而提供更为精准的回答。'
    ]
  };

  const { chunks } = splitText2Chunks({ text: mock.text, chunkSize: 500, customReg: ['----'] });

  expect(chunks).toEqual(mock.result);
});

// 自定义分隔符测试：换行符号
it(`Test splitText2Chunks 7`, () => {
  const mock = {
    text: `111
222

333`,
    result: [
      `111
222`,
      '333'
    ]
  };

  const { chunks } = splitText2Chunks({ customReg: ['\\n\\n'], text: mock.text, chunkSize: 2000 });

  expect(chunks).toEqual(mock.result);
});

// 自定义分隔符测试:使用 maxSize 而非 chunkSize 进行分割
it(`Test splitText2Chunks 7.5 - Custom separator uses maxSize for splitting`, () => {
  const mock = {
    text: `第一段内容。FastGPT 是一个基于 LLM 大语言模型的知识库问答系统,提供开箱即用的数据处理、模型调用等能力。它支持多种数据导入方式,包括手动输入、PDF、WORD、Markdown 和 CSV 等格式,能够自动进行数据预处理、向量化和 QA 分割,大幅提升数据处理效率。FastGPT 的可视化界面设计简洁直观,用户可以通过 Flow 模块进行工作流编排,轻松实现复杂的问答场景。补充几个字，hello！！！
----
第二段内容。FastGPT 支持多种 LLM 模型,如 GPT、Claude、文心一言等,未来还将支持自定义的向量模型。其强大的 API 集成能力使得用户可以轻松将其接入现有的 GPT 应用或其他平台,如企业微信、公众号、飞书等。FastGPT 的开源项目遵循 Apache License 2.0 协议,用户可以进行二次开发和发布。,轻松实现复杂的问答场景。补充几个字，hello！！！,轻松实现复杂的问答场景。补充几个字，hello！！！`,
    chunkSize: 200, // 设置较小的 chunkSize
    maxSize: 2000 // maxSize 远大于 chunkSize
  };

  const { chunks } = splitText2Chunks({
    text: mock.text,
    chunkSize: mock.chunkSize,
    maxSize: mock.maxSize,
    customReg: ['----']
  });

  // 应该分成 2 个块(通过 ---- 分隔符分割)
  expect(chunks.length).toBe(2);

  // 验证第一个块大于 chunkSize(200),说明使用的是 maxSize
  expect(chunks[0].length).toBeGreaterThan(mock.chunkSize);
  expect(chunks[0].length).toBeLessThanOrEqual(mock.maxSize);

  // 验证第二个块大于 chunkSize(200),说明使用的是 maxSize
  expect(chunks[1].length).toBeGreaterThan(mock.chunkSize);
  expect(chunks[1].length).toBeLessThanOrEqual(mock.maxSize);

  // 验证包含完整内容(去除分隔符和空白后)
  expect(chunks[0]).toContain('第一段内容');
  expect(chunks[0]).toContain('FastGPT 是一个基于 LLM 大语言模型');
  expect(chunks[1]).toContain('第二段内容');
  expect(chunks[1]).toContain('FastGPT 支持多种 LLM 模型');
});

// 长代码块分割
it(`Test splitText2Chunks 8`, () => {
  const mock = {
    text: `这是一个测试的内容，包含代码块

快速了解 FastGPT
FastGPT 的能力与优势

FastGPT 是一个基于 LLM 大语言模型的知识库问答系统，提供开箱即用的数据处理、模型调用等能力。同时可以通过 Flow 可视化进行工作流编排，从而实现复杂的问答场景！

FastGPT 在线使用：https://fastgpt.io

FastGPT 能力 
1. 专属 AI 客服 
通过导入文档或已有问答对进行训练，让 AI 模型能根据你的文档以交互式对话方式回答问题。

2. 简单易用的可视化界面 
FastGPT 采用直观的可视化界面设计，为各种应用场景提供了丰富实用的功能。通过简洁易懂的操作步骤，可以轻松完成 AI 客服的创建和训练流程。

~~~js
import { defaultMaxChunkSize } from '../../core/dataset/training/utils';
import { getErrText } from '../error/utils';

const getOneTextOverlapText = ({ text, step }: { text: string; step: number }): string => {
    const forbidOverlap = checkForbidOverlap(step);
    const maxOverlapLen = chunkSize * 0.4;

    // step >= stepReges.length: Do not overlap incomplete sentences
    if (forbidOverlap || overlapLen === 0 || step >= stepReges.length) return '';

    const splitTexts = getSplitTexts({ text, step });
    let overlayText = '';

    for (let i = splitTexts.length - 1; i >= 0; i--) {
      const currentText = splitTexts[i].text;
      const newText = currentText + overlayText;
      const newTextLen = newText.length;

      if (newTextLen > overlapLen) {
        if (newTextLen > maxOverlapLen) {
          const text = getOneTextOverlapText({ text: newText, step: step + 1 });
          return text || overlayText;
        }
        return newText;
      }

      overlayText = newText;
    }
    return overlayText;
  };

  const getOneTextOverlapText = ({ text, step }: { text: string; step: number }): string => {
    const forbidOverlap = checkForbidOverlap(step);
    const maxOverlapLen = chunkSize * 0.4;

    // step >= stepReges.length: Do not overlap incomplete sentences
    if (forbidOverlap || overlapLen === 0 || step >= stepReges.length) return '';

    const splitTexts = getSplitTexts({ text, step });
    let overlayText = '';

    for (let i = splitTexts.length - 1; i >= 0; i--) {
      const currentText = splitTexts[i].text;
      const newText = currentText + overlayText;
      const newTextLen = newText.length;

      if (newTextLen > overlapLen) {
        if (newTextLen > maxOverlapLen) {
          const text = getOneTextOverlapText({ text: newText, step: step + 1 });
          return text || overlayText;
        }
        return newText;
      }

      overlayText = newText;
    }
    return overlayText;
  };

  const getOneTextOverlapText = ({ text, step }: { text: string; step: number }): string => {
    const forbidOverlap = checkForbidOverlap(step);
    const maxOverlapLen = chunkSize * 0.4;

    // step >= stepReges.length: Do not overlap incomplete sentences
    if (forbidOverlap || overlapLen === 0 || step >= stepReges.length) return '';

    const splitTexts = getSplitTexts({ text, step });
    let overlayText = '';

    for (let i = splitTexts.length - 1; i >= 0; i--) {
      const currentText = splitTexts[i].text;
      const newText = currentText + overlayText;
      const newTextLen = newText.length;

      if (newTextLen > overlapLen) {
        if (newTextLen > maxOverlapLen) {
          const text = getOneTextOverlapText({ text: newText, step: step + 1 });
          return text || overlayText;
        }
        return newText;
      }

      overlayText = newText;
    }
    return overlayText;
  };

  const getOneTextOverlapText = ({ text, step }: { text: string; step: number }): string => {
    const forbidOverlap = checkForbidOverlap(step);
    const maxOverlapLen = chunkSize * 0.4;

    // step >= stepReges.length: Do not overlap incomplete sentences
    if (forbidOverlap || overlapLen === 0 || step >= stepReges.length) return '';

    const splitTexts = getSplitTexts({ text, step });
    let overlayText = '';

    for (let i = splitTexts.length - 1; i >= 0; i--) {
      const currentText = splitTexts[i].text;
      const newText = currentText + overlayText;
      const newTextLen = newText.length;

      if (newTextLen > overlapLen) {
        if (newTextLen > maxOverlapLen) {
          const text = getOneTextOverlapText({ text: newText, step: step + 1 });
          return text || overlayText;
        }
        return newText;
      }

      overlayText = newText;
    }
    return overlayText;
  };

  const getOneTextOverlapText = ({ text, step }: { text: string; step: number }): string => {
    const forbidOverlap = checkForbidOverlap(step);
    const maxOverlapLen = chunkSize * 0.4;

    // step >= stepReges.length: Do not overlap incomplete sentences
    if (forbidOverlap || overlapLen === 0 || step >= stepReges.length) return '';

    const splitTexts = getSplitTexts({ text, step });
    let overlayText = '';

    for (let i = splitTexts.length - 1; i >= 0; i--) {
      const currentText = splitTexts[i].text;
      const newText = currentText + overlayText;
      const newTextLen = newText.length;

      if (newTextLen > overlapLen) {
        if (newTextLen > maxOverlapLen) {
          const text = getOneTextOverlapText({ text: newText, step: step + 1 });
          return text || overlayText;
        }
        return newText;
      }

      overlayText = newText;
    }
    return overlayText;
  };
~~~

3. 自动数据预处理 
提供手动输入、直接分段、LLM 自动处理和 CSV 等多种数据导入途径，其中“直接分段”支持通过 PDF、WORD、Markdown 和 CSV 文档内容作为上下文。FastGPT 会自动对文本数据进行预处理、向量化和 QA 分割，节省手动训练时间，提升效能。

4. 工作流编排 
基于 Flow 模块的工作流编排，可以帮助你设计更加复杂的问答流程。例如查询数据库、查询库存、预约实验室等。

5. 强大的 API 集成 
FastGPT 对外的 API 接口对齐了 OpenAI 官方接口，可以直接接入现有的 GPT 应用，也可以轻松集成到企业微信、公众号、飞书等平台。

FastGPT 特点 
项目开源

FastGPT 遵循附加条件 Apache License 2.0 开源协议，你可以 Fork 之后进行二次开发和发布。FastGPT 社区版将保留核心功能，商业版仅在社区版基础上使用 API 的形式进行扩展，不影响学习使用。

独特的 QA 结构

针对客服问答场景设计的 QA 结构，提高在大量数据场景中的问答准确性。

可视化工作流

通过 Flow 模块展示了从问题输入到模型输出的完整流程，便于调试和设计复杂流程。

无限扩展

基于 API 进行扩展，无需修改 FastGPT 源码，也可快速接入现有的程序中。

便于调试

提供搜索测试、引用修改、完整对话预览等多种调试途径。

支持多种模型

支持 GPT、Claude、文心一言等多种 LLM 模型，未来也将支持自定义的向量模型。

知识库核心流程

FastGPT AI 相关参数配置说明

在 FastGPT 的 AI 对话模块中，有一个 AI 高级配置，里面包含了 AI 模型的参数配置，本文详细介绍这些配置的含义。

返回AI内容（高级编排特有） 
这是一个开关，打开的时候，当 AI 对话模块运行时，会将其输出的内容返回到浏览器（API响应）；如果关闭，AI 输出的内容不会返回到浏览器，但是生成的内容仍可以通过【AI回复】进行输出。你可以将【AI回复】连接到其他模块中。

最大上下文 
代表模型最多容纳的文字数量。`,
    result: [
      "这是一个测试的内容，包含代码块\n\n快速了解 FastGPT\nFastGPT 的能力与优势\n\nFastGPT 是一个基于 LLM 大语言模型的知识库问答系统，提供开箱即用的数据处理、模型调用等能力。同时可以通过 Flow 可视化进行工作流编排，从而实现复杂的问答场景！\n\nFastGPT 在线使用：https://fastgpt.io\n\nFastGPT 能力 \n1. 专属 AI 客服 \n通过导入文档或已有问答对进行训练，让 AI 模型能根据你的文档以交互式对话方式回答问题。\n\n2. 简单易用的可视化界面 \nFastGPT 采用直观的可视化界面设计，为各种应用场景提供了丰富实用的功能。通过简洁易懂的操作步骤，可以轻松完成 AI 客服的创建和训练流程。\n\n~~~js\nimport { defaultMaxChunkSize } from '../../core/dataset/training/utils';\nimport { getErrText } from '../error/utils';\n\nconst getOneTextOverlapText = ({ text, step }: { text: string; step: number }): string => {\n    const forbidOverlap = checkForbidOverlap(step);\n    const maxOverlapLen = chunkSize * 0.4;\n\n    // step >= stepReges.length: Do not overlap incomplete sentences\n    if (forbidOverlap || overlapLen === 0 || step >= stepReges.length) return '';\n\n    const splitTexts = getSplitTexts({ text, step });\n    let overlayText = '';\n\n    for (let i = splitTexts.length - 1; i >= 0; i--) {\n      const currentText = splitTexts[i].text;\n      const newText = currentText + overlayText;\n      const newTextLen = newText.length;\n\n      if (newTextLen > overlapLen) {\n        if (newTextLen > maxOverlapLen) {\n          const text = getOneTextOverlapText({ text: newText, step: step + 1 });\n          return text || overlayText;\n        }\n        return newText;\n      }\n\n      overlayText = newText;\n    }\n    return overlayText;\n  };\n\n  const getOneTextOverlapText = ({ text, step }: { text: string; step: number }): string => {\n    const forbidOverlap = checkForbidOverlap(step);\n    const maxOverlapLen = chunkSize * 0.4;\n\n    // step >= stepReges.length: Do not overlap incomplete sentences\n    if (forbidOverlap || overlapLen === 0 || step >= stepReges.length) return '';\n\n    const splitTexts = getSplitTexts({ text, step });\n    let overlayText = '';\n\n    for (let i = splitTexts.length - 1; i >= 0; i--) {\n      const currentText = splitTexts[i].text;\n      const newText = currentText + overlayText;\n      const newTextLen = newText.length;\n\n      if (newTextLen > overlapLen) {\n        if (newTextLen > maxOverlapLen) {\n          const text = getOneTextOverlapText({ text: newText, step: step + 1 });\n          return text || overlayText;\n        }\n        return newText;\n      }\n\n      overlayText = newText;\n    }\n    return overlayText;\n  };\n\n  const getOneTextOverlapText = ({ text, step }: { text: string; step: number }): string => {\n    const forbidOverlap = checkForbidOverlap(step);\n    const maxOverlapLen = chunkSize * 0.4;\n\n    // step >= stepReges.length: Do not overlap incomplete sentences\n    if (forbidOverlap || overlapLen === 0 || step >= stepReges.length) return '';\n\n    const splitTexts = getSplitTexts({ text, step });\n    let overlayText = '';\n\n    for (let i = splitTexts.length - 1; i >= 0; i--) {\n      const currentText = splitTexts[i].text;\n      const newText = currentText + overlayText;\n      const newTextLen = newText.length;\n\n      if (newTextLen > overlapLen) {\n        if (newTextLen > maxOverlapLen) {\n          const text = getOneTextOverlapText({ text: newText, step: step + 1 });\n          return text || overlayText;\n        }\n        return newText;\n      }\n\n      overlayText = newText;\n    }\n    return overlayText;\n  };\n\n  const getOneTextOverlapText = ({ text, step }: { text: string; step: number }): string => {\n    const forbidOverlap = checkForbidOverlap(step);\n    const maxOverlapLen = chunkSize * 0.4;\n\n    // step >= stepReges.length: Do not overlap incomplete sentences\n    if (forbidOverlap || overlapLen === 0 || step >= stepReges.length) return '';\n\n    const splitTexts = getSplitTexts({ text, step });\n    let overlayText = '';\n\n    for (let i = splitTexts.length - 1; i >= 0; i--) {\n      const currentText = splitTexts[i].text;\n      const newText = currentText + overlayText;\n      const newTextLen = newText.length;\n\n      if (newTextLen > overlapLen) {\n        if (newTextLen > maxOverlapLen) {\n          const text = getOneTextOverlapText({ text: newText, step: step + 1 });\n          return text || overlayText;\n        }\n        return newText;\n      }\n\n      overlayText = newText;\n    }\n    return overlayText;\n  };\n\n  const getOneTextOverlapText = ({ text, step }: { text: string; step: number }): string => {\n    const forbidOverlap = checkForbidOverlap(step);\n    const maxOverlapLen = chunkSize * 0.4;\n\n    // step >= stepReges.length: Do not overlap incomplete sentences\n    if (forbidOverlap || overlapLen === 0 || step >= stepReges.length) return '';\n\n    const splitTexts = getSplitTexts({ text, step });\n    let overlayText = '';\n\n    for (let i = splitTexts.length - 1; i >= 0; i--) {\n      const currentText = splitTexts[i].text;\n      const newText = currentText + overlayText;\n      const newTextLen = newText.length;\n\n      if (newTextLen > overlapLen) {\n        if (newTextLen > maxOverlapLen) {\n          const text = getOneTextOverlapText({ text: newText, step: step + 1 });\n          return text || overlayText;\n        }\n        return newText;\n      }\n\n      overlayText = newText;\n    }\n    return overlayText;\n  };\n~~~",
      '3. 自动数据预处理 \n提供手动输入、直接分段、LLM 自动处理和 CSV 等多种数据导入途径，其中“直接分段”支持通过 PDF、WORD、Markdown 和 CSV 文档内容作为上下文。FastGPT 会自动对文本数据进行预处理、向量化和 QA 分割，节省手动训练时间，提升效能。\n\n4. 工作流编排 \n基于 Flow 模块的工作流编排，可以帮助你设计更加复杂的问答流程。例如查询数据库、查询库存、预约实验室等。\n\n5. 强大的 API 集成 \nFastGPT 对外的 API 接口对齐了 OpenAI 官方接口，可以直接接入现有的 GPT 应用，也可以轻松集成到企业微信、公众号、飞书等平台。\n\nFastGPT 特点 \n项目开源\n\nFastGPT 遵循附加条件 Apache License 2.0 开源协议，你可以 Fork 之后进行二次开发和发布。FastGPT 社区版将保留核心功能，商业版仅在社区版基础上使用 API 的形式进行扩展，不影响学习使用。\n\n独特的 QA 结构\n\n针对客服问答场景设计的 QA 结构，提高在大量数据场景中的问答准确性。\n\n可视化工作流\n\n通过 Flow 模块展示了从问题输入到模型输出的完整流程，便于调试和设计复杂流程。\n\n无限扩展\n\n基于 API 进行扩展，无需修改 FastGPT 源码，也可快速接入现有的程序中。',
      '便于调试\n\n提供搜索测试、引用修改、完整对话预览等多种调试途径。\n\n支持多种模型\n\n支持 GPT、Claude、文心一言等多种 LLM 模型，未来也将支持自定义的向量模型。\n\n知识库核心流程\n\nFastGPT AI 相关参数配置说明\n\n在 FastGPT 的 AI 对话模块中，有一个 AI 高级配置，里面包含了 AI 模型的参数配置，本文详细介绍这些配置的含义。\n\n返回AI内容（高级编排特有） \n这是一个开关，打开的时候，当 AI 对话模块运行时，会将其输出的内容返回到浏览器（API响应）；如果关闭，AI 输出的内容不会返回到浏览器，但是生成的内容仍可以通过【AI回复】进行输出。你可以将【AI回复】连接到其他模块中。\n\n最大上下文 \n代表模型最多容纳的文字数量。'
    ]
  };

  const { chunks } = splitText2Chunks({
    text: mock.text,
    chunkSize: 500,
    maxSize: 100000
  });

  const normalizedChunks = simpleChunks(chunks);
  const normalizedExpected = simpleChunks(mock.result);

  expect(normalizedChunks).toEqual(normalizedExpected);
});

// 表格分割测试 - 不超出maxSize
it(`Test splitText2Chunks 9`, () => {
  const mock = {
    text: `测试的呀,第一个表格
| 序号 | 姓名 | 年龄 | 职业 | 城市 |
| --- | --- | --- | --- | --- |
| 1 | 张三 | 25 | 工程师 | 北京 |
| 2 | 李四 | 30 | 教师 | 上海 |
| 3 | 王五 | 28 | 医生 | 广州 |
| 6 | 周八 | 32 | 会计 | 成都 |
| 4 | 赵六 | 35 | 律师 | 深圳 |
| 5 | 孙七 | 27 | 设计师 | 杭州 |
| 6 | 周八 | 32 | 会计 | 成都 |
| 6 | 周八 | 32 | 会计 | 成都 |
| 7 | 吴九 | 29 | 销售 | 武汉 |
| 8 | 郑十 | 31 | 记者 | 南京 |
| 9 | 刘一 | 33 | 建筑师 | 天津 |
| 10 | 陈二 | 26 | 程序员 | 重庆 |
| 1000 | 黄末 | 28 | 作家 | 厦门 |
| 1001 | 杨一 | 34 | 程序员 | 厦门 |
| 1002 | 杨二 | 34 | 程序员 | 厦门 |
| 1003 | 杨三 | 34 | 程序员 | 厦门 |
| 6 | 周八 | 32 | 会计 | 成都 |
| 1004 | 杨四 | 34 | 程序员 | 厦门 |
| 1005 | 杨五 | 34 | 程序员 | 厦门 |
| 1000 | 黄末 | 28 | 作家 | 厦门 |
| 1000 | 黄末 | 28 | 作家 | 厦门 |
| 1000 | 黄末 | 28 | 作家 | 厦门 |
| 9 | 刘一 | 33 | 建筑师 | 天津 |
| 10 | 陈二 | 26 | 程序员 | 重庆 |
| 1000 | 黄末 | 28 | 作家 | 厦门 |
| 1001 | 杨一 | 34 | 程序员 | 厦门 |
| 1002 | 杨二 | 34 | 程序员 | 厦门 |
| 1003 | 杨三 | 34 | 程序员 | 厦门 |
| 1004 | 杨四 | 34 | 程序员 | 厦门 |
| 1005 | 杨五 | 34 | 程序员 | 厦门 |
| 6 | 周八 | 32 | 会计 | 成都 |
| 1000 | 黄末 | 28 | 作家 | 厦门 |
| 1000 | 黄末 | 28 | 作家 | 厦门 |
| 1000 | 黄末 | 28 | 作家 | 厦门 |

这是第二段了，第二表格

| 序号 | 姓名 | 年龄 | 职业 | 城市 |
| --- | --- | --- | --- | --- |
| 1 | 张三 | 25 | 工程师 | 北京 |
| 6 | 周八 | 32 | 会计 | 成都 |
| 2 | 李四 | 30 | 教师 | 上海 |
| 3 | 王五 | 28 | 医生 | 广州 |
| 4 | 赵六 | 35 | 律师 | 深圳 |
| 5 | 孙七 | 27 | 设计师 | 杭州 |
| 6 | 周八 | 32 | 会计 | 成都 |
| 7 | 吴九 | 29 | 销售 | 武汉 |
| 8 | 郑十 | 31 | 记者 | 南京 |
| 9 | 刘一 | 33 | 建筑师 | 天津 |
| 10 | 陈二 | 26 | 程序员 | 重庆 |
| 10004 | 黄末 | 28 | 作家 | 厦门 |
| 10013 | 杨一 | 34 | 程序员 | 厦门 |

结束了

| 序号22 | 姓名 | 年龄 | 职业 | 城市 |
| --- | --- | --- | --- | --- |
| 1 | 张三 | 25 | 工程师 | 北京 |
| 2 | 李四 | 30 | 教师 | 上海 |
| 3 | 王五 | 28 | 医生 | 广州 |
| 4 | 赵六 | 35 | 律师 | 深圳 |
| 5 | 孙七 | 27 | 设计师 | 杭州 |
| 6 | 周八 | 32 | 会计 | 成都 |
| 6 | 周八 | 32 | 会计 | 成都 |
| 7 | 吴九 | 29 | 销售 | 武汉 |
| 8 | 郑十 | 31 | 记者 | 南京 |
| 9 | 刘一 | 33 | 建筑师 | 天津 |
| 10 | 陈二 | 26 | 程序员 | 重庆 |
| 10002 | 黄末 | 28 | 作家 | 厦门 |
| 10012 | 杨一 | 34 | 程序员 | 厦门 |
`,
    result: [
      `测试的呀,第一个表格
| 序号 | 姓名 | 年龄 | 职业 | 城市 |
| --- | --- | --- | --- | --- |
| 1 | 张三 | 25 | 工程师 | 北京 |
| 2 | 李四 | 30 | 教师 | 上海 |
| 3 | 王五 | 28 | 医生 | 广州 |
| 6 | 周八 | 32 | 会计 | 成都 |
| 4 | 赵六 | 35 | 律师 | 深圳 |
| 5 | 孙七 | 27 | 设计师 | 杭州 |
| 6 | 周八 | 32 | 会计 | 成都 |
| 6 | 周八 | 32 | 会计 | 成都 |
| 7 | 吴九 | 29 | 销售 | 武汉 |
| 8 | 郑十 | 31 | 记者 | 南京 |
| 9 | 刘一 | 33 | 建筑师 | 天津 |
| 10 | 陈二 | 26 | 程序员 | 重庆 |
| 1000 | 黄末 | 28 | 作家 | 厦门 |
| 1001 | 杨一 | 34 | 程序员 | 厦门 |
| 1002 | 杨二 | 34 | 程序员 | 厦门 |
| 1003 | 杨三 | 34 | 程序员 | 厦门 |`,
      `| 6 | 周八 | 32 | 会计 | 成都 |
| 1004 | 杨四 | 34 | 程序员 | 厦门 |
| 1005 | 杨五 | 34 | 程序员 | 厦门 |
| 1000 | 黄末 | 28 | 作家 | 厦门 |
| 1000 | 黄末 | 28 | 作家 | 厦门 |
| 1000 | 黄末 | 28 | 作家 | 厦门 |
| 9 | 刘一 | 33 | 建筑师 | 天津 |
| 10 | 陈二 | 26 | 程序员 | 重庆 |
| 1000 | 黄末 | 28 | 作家 | 厦门 |
| 1001 | 杨一 | 34 | 程序员 | 厦门 |
| 1002 | 杨二 | 34 | 程序员 | 厦门 |
| 1003 | 杨三 | 34 | 程序员 | 厦门 |
| 1004 | 杨四 | 34 | 程序员 | 厦门 |
| 1005 | 杨五 | 34 | 程序员 | 厦门 |
| 6 | 周八 | 32 | 会计 | 成都 |
| 1000 | 黄末 | 28 | 作家 | 厦门 |
| 1000 | 黄末 | 28 | 作家 | 厦门 |`,
      `这是第二段了，第二表格

| 序号 | 姓名 | 年龄 | 职业 | 城市 |
| --- | --- | --- | --- | --- |
| 1 | 张三 | 25 | 工程师 | 北京 |
| 6 | 周八 | 32 | 会计 | 成都 |
| 2 | 李四 | 30 | 教师 | 上海 |
| 3 | 王五 | 28 | 医生 | 广州 |
| 4 | 赵六 | 35 | 律师 | 深圳 |
| 5 | 孙七 | 27 | 设计师 | 杭州 |
| 6 | 周八 | 32 | 会计 | 成都 |
| 7 | 吴九 | 29 | 销售 | 武汉 |
| 8 | 郑十 | 31 | 记者 | 南京 |
| 9 | 刘一 | 33 | 建筑师 | 天津 |
| 10 | 陈二 | 26 | 程序员 | 重庆 |
| 10004 | 黄末 | 28 | 作家 | 厦门 |
| 10013 | 杨一 | 34 | 程序员 | 厦门 |`,
      `结束了

| 序号22 | 姓名 | 年龄 | 职业 | 城市 |
| --- | --- | --- | --- | --- |
| 1 | 张三 | 25 | 工程师 | 北京 |
| 2 | 李四 | 30 | 教师 | 上海 |
| 3 | 王五 | 28 | 医生 | 广州 |
| 4 | 赵六 | 35 | 律师 | 深圳 |
| 5 | 孙七 | 27 | 设计师 | 杭州 |
| 6 | 周八 | 32 | 会计 | 成都 |
| 6 | 周八 | 32 | 会计 | 成都 |
| 7 | 吴九 | 29 | 销售 | 武汉 |
| 8 | 郑十 | 31 | 记者 | 南京 |
| 9 | 刘一 | 33 | 建筑师 | 天津 |
| 10 | 陈二 | 26 | 程序员 | 重庆 |
| 10002 | 黄末 | 28 | 作家 | 厦门 |
| 10012 | 杨一 | 34 | 程序员 | 厦门 |`
    ]
  };

  const { chunks } = splitText2Chunks({ text: mock.text, chunkSize: 300 });

  expect(chunks).toEqual(mock.result);
});

// 段落优化先测试 - 段落深度 0
it(`Test splitText2Chunks 10`, () => {
  const mock = {
    text: `# A
af da da fda a a 

## B
段落 2
### D
段落 3
## E
段落 4`,
    result: [
      `# A
af da da fda a a 

## B
段落 2
### D
段落 3
## E
段落 4`
    ]
  };

  const { chunks } = splitText2Chunks({ text: mock.text, chunkSize: 2000, paragraphChunkDeep: 0 });
  expect(chunks).toEqual(mock.result);
});

// 段落优化先测试 - 段落深度 1
it(`Test splitText2Chunks 11`, () => {
  const mock = {
    text: `# A
af da da fda a a 

## B
段落 2
### D
段落 3
## E
段落 4`,
    result: [
      `# A
af da da fda a a 

## B
段落 2
### D
段落 3
## E
段落 4`
    ]
  };

  const { chunks } = splitText2Chunks({ text: mock.text, chunkSize: 2000, paragraphChunkDeep: 1 });
  expect(chunks).toEqual(mock.result);
});

// 段落优化先测试 - 段落深度 2
it(`Test splitText2Chunks 12`, () => {
  const mock = {
    text: `# A
af da da fda a a 

## B
段落 2
### D
段落 3
## E
段落 4`,
    result: [
      `# A
af da da fda a a`,
      `# A
## B
段落 2
### D
段落 3`,
      `# A
## E
段落 4`
    ]
  };

  const { chunks } = splitText2Chunks({ text: mock.text, chunkSize: 2000, paragraphChunkDeep: 2 });
  expect(chunks).toEqual(mock.result);
});

// 表格合并测试
it(`Test splitText2Chunks 13 - Table split with empty lastText`, () => {
  const mock = {
    text: `
## 4.1、关键假设及盈利预测

公司医药工业产品线按治疗领域分心血管类、补益类、清热类、妇科类和其他药品,商业分部包含自有产品销售,相应有分部间抵消,我们分别给予营收增速和毛利率假设, 如下:

1)心脑血管类：心脑血管类为公司核心优势产品,产品包括安宫牛黄丸、牛黄清心丸、同仁堂大活络丸等,2021-2023 年心脑血管类产品营收增速逐年下滑, 毛利率受主要原材料牛黄和麝香价格涨幅较大影响,毛利率承压。我们分别假设 2024-2026 年,心脑血管类产品营收增速分别为 0%、8%和 10%,2025 年受消费上升带动开始恢复性增长,毛利率分别为 47%、50%和 52%,毛利率逐年提升,反映牛黄进口试点后,牛黄原料成本压力缓解。

2)补益类：补益类是公司第二大产品线,包括六味地黄丸、五子衍宗丸等。 我们分别假设 2024-2026 年补益类产品营收年增长 8%、10%和 12%,毛利率均保持稳定为 37.5%。

3)妇科类：妇科类产品包括乌鸡白凤丸、坤宝丸等,历年销售比较平稳。我们假设 2024-2026 年妇科类产品年增长 5%,毛利率维持稳定在 42%。

4)清热类：清热类产品与流行性疾病相关,2023 年为流感大年,感冒清热类产品销售相对旺盛,基数较高。我们假设 2024-2026 年清热类产品年增长-15%、8% 和 10%, 2024 年负增长, 反映上 2023 年基数较高和 2024 年流行性疾病小年影响, 毛利率稳定为 35.0%。

5)其他产品：我们假设 2024-2026 年其他中药品种营收年增长 5%、10%和 15%, 毛利率稳定保持 41%。

6)医药商业：医药商业营收增长主要是旗下同仁堂商业零售门店带动, 2023-2024H1 门店新开显著提速,2024 年上半年新开 116 家门店。我们假设 2024-2026 年医药商业年均增长 9%,毛利率保持 31%水平不变。

7)分部抵消：公司医药商业销售自产药品比例逐年提升,2023 年分部抵消 34.6 亿元,占医药工业营收 31.3%左右,我们假设 2024-2026 年,分部间抵消占医药工业营收分别为 33%、34%和 35%,毛利率为 -2%。



表 4：同仁堂主营业务关键假设及营收拆分

| 同仁堂经营拆分： | 单位 | 2021A | 2022A | 2023A | 2024E | 2025E | 2026E |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 合并营业收入 | 亿元 | 146.03 | 153.72 | 178.61 | 187.68 | 203.30 | 222.68 |
| 同比 | % | 13.86% | 5.27% | 16.19% | 5.08% | 8.33% | 9.53% |
| 毛利率 | % | 47.62% | 48.80% | 47.29% | 44.53% | 45.50% | 46.46% |
|   |   |   |   |   |   |   |   |
| 分产品 |   |   |   |   |   |   |   |
| 一、医药工业分部 | 亿元 | 88.76 | 98.40 | 110.79 | 113.42 | 123.59 | 138.44 |
| 同比 | % | 15.99% | 10.86% | 12.59% | 2.38% | 8.96% | 12.02% |
| 毛利率 | % | 48.13% | 48.95% | 46.96% | 42.50% | 43.63% | 44.32% |
| 分细分产品: |   |   |   |   |   |   |   |
| 1、母公司生产：心脑血管类(安宫、清心、大活络等) | 亿元 | 36.29 | 40.63 | 43.88 | 43.88 | 47.39 | 52.13 |
| 同比 | % | 20.80% | 11.97% | 8.00% | 0.00% | 8.00% | 10.00% |
| 毛利率 | $ \% $ | 59.96% | 61.20% | 57.62% | 47.00% | 50.00% | 52.00% |
|   |   |   |   |   |   |   |   |
| 2、补益类(六味、金匮、五子衍宗) |   | 14.56 | 15.67 | 17.30 | 18.68 | 20.55 | 23.02 |
| 同比 | % | 2.86% | 7.62% | 10.40% | 8.00% | 10.00% | 12.00% |
| 毛利率 | $ \% $ | 42.45% | 43.00% | 37.39% | 37.50% | 37.50% | 37.50% |
|   |   |   |   |   |   |   |   |
| 3、妇科类(乌鸡白凤丸、坤宝丸) |   | 3.80 | 3.48 | 3.77 | 3.96 | 4.15 | 4.36 |
| 同比 | % | 23.83% | -8.38% | 8.28% | 5.00% | 5.00% | 5.00% |
| 毛利率 | % | 40.16% | 38.12% | 42.38% | 42.00% | 42.00% | 42.00% |
|   |   |   |   |   |   |   |   |
| 4、清热类(感冒清热颗粒、牛黄解毒) | 亿元 | 5.24 | 5.29 | 6.14 | 5.22 | 5.64 | 6.20 |
| 同比 | % | 5.19% | 0.86% | 16.07% | -15.00% | 8.00% | 10.00% |
| 毛利率 | $ \% $ | 36.09% | 34.39% | 34.97% | 35.00% | 35.00% | 35.00% |
|   |   |   |   |   |   |   |   |
| 5、其他中药品种 | 亿元 | 28.87 | 33.33 | 39.70 | 41.69 | 45.85 | 52.73 |
| 同比 | % | 18.90% | 15.45% | 19.11% | 5.00% | 10.00% | 15.00% |
| 毛利率 | $ \% $ | 39.36% | 40.25% | 41.65% | 41.00% | 41.00% | 41.00% |
|   |   |   |   |   |   |   |   |
| 二、商业分部(同仁堂商业) | 亿元 | 82.41 | 84.80 | 102.5 | 111.7 | 121.7 | 132.7 |
| 同比 | % | 12.64% | 2.90% | 20.83% | 9.00% | 9.00% | 9.00% |
| 毛利率 | % | 31.51% | 30.95% | 31.11% | 31.00% | 31.00% | 31.00% |
|   |   |   |   |   |   |   |   |
| 三、分部间抵消 | 亿元 | -25.14 | (29.48) | (34.64) | (37.43) | (42.02) | (48.45) |
| 同比 | % | 17.32% | 17.27% | 17.50% | 8.06% | 12.26% | 15.31% |
| 毛利率 | % | -3.39% | -2.05% | -1.61% | -2.0% | -2.0% | -2.0% |
| 分部抵消营收占工业比例 | % | 28.32% | 29.96% | 31.27% | 33.0% | 34.0% | 35.0% |

资料来源：Wind, 诚通证券研究所



综上,我们预测公司 2024-2026 年,营业收入分别为 187.7/203.3/222.7 亿元, 分别同比增 5.1%/8.3%/9.5%；归母净利润分别为 16.7/19.4/22.6 亿元,分别同比增 $ {0.3}\% /{15.8}\% /{16.7}\% $ ; 每股 EPS 分别为 1.22/1.41/1.65 元; 毛利率分别为 44.5%/45.5%/46.5%。`,
    result: [
      `## 4.1、关键假设及盈利预测

公司医药工业产品线按治疗领域分心血管类、补益类、清热类、妇科类和其他药品,商业分部包含自有产品销售,相应有分部间抵消,我们分别给予营收增速和毛利率假设, 如下:

1)心脑血管类：心脑血管类为公司核心优势产品,产品包括安宫牛黄丸、牛黄清心丸、同仁堂大活络丸等,2021-2023 年心脑血管类产品营收增速逐年下滑, 毛利率受主要原材料牛黄和麝香价格涨幅较大影响,毛利率承压。我们分别假设 2024-2026 年,心脑血管类产品营收增速分别为 0%、8%和 10%,2025 年受消费上升带动开始恢复性增长,毛利率分别为 47%、50%和 52%,毛利率逐年提升,反映牛黄进口试点后,牛黄原料成本压力缓解。

2)补益类：补益类是公司第二大产品线,包括六味地黄丸、五子衍宗丸等。 我们分别假设 2024-2026 年补益类产品营收年增长 8%、10%和 12%,毛利率均保持稳定为 37.5%。

3)妇科类：妇科类产品包括乌鸡白凤丸、坤宝丸等,历年销售比较平稳。我们假设 2024-2026 年妇科类产品年增长 5%,毛利率维持稳定在 42%。

4)清热类：清热类产品与流行性疾病相关,2023 年为流感大年,感冒清热类产品销售相对旺盛,基数较高。我们假设 2024-2026 年清热类产品年增长-15%、8% 和 10%, 2024 年负增长, 反映上 2023 年基数较高和 2024 年流行性疾病小年影响, 毛利率稳定为 35.0%。

5)其他产品：我们假设 2024-2026 年其他中药品种营收年增长 5%、10%和 15%, 毛利率稳定保持 41%。

6)医药商业：医药商业营收增长主要是旗下同仁堂商业零售门店带动, 2023-2024H1 门店新开显著提速,2024 年上半年新开 116 家门店。我们假设 2024-2026 年医药商业年均增长 9%,毛利率保持 31%水平不变。

7)分部抵消：公司医药商业销售自产药品比例逐年提升,2023 年分部抵消 34.6 亿元,占医药工业营收 31.3%左右,我们假设 2024-2026 年,分部间抵消占医药工业营收分别为 33%、34%和 35%,毛利率为 -2%。

表 4：同仁堂主营业务关键假设及营收拆分`,

      `## 4.1、关键假设及盈利预测
| 同仁堂经营拆分： | 单位 | 2021A | 2022A | 2023A | 2024E | 2025E | 2026E |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 合并营业收入 | 亿元 | 146.03 | 153.72 | 178.61 | 187.68 | 203.30 | 222.68 |
| 同比 | % | 13.86% | 5.27% | 16.19% | 5.08% | 8.33% | 9.53% |
| 毛利率 | % | 47.62% | 48.80% | 47.29% | 44.53% | 45.50% | 46.46% |
|   |   |   |   |   |   |   |   |
| 分产品 |   |   |   |   |   |   |   |
| 一、医药工业分部 | 亿元 | 88.76 | 98.40 | 110.79 | 113.42 | 123.59 | 138.44 |
| 同比 | % | 15.99% | 10.86% | 12.59% | 2.38% | 8.96% | 12.02% |
| 毛利率 | % | 48.13% | 48.95% | 46.96% | 42.50% | 43.63% | 44.32% |
| 分细分产品: |   |   |   |   |   |   |   |
| 1、母公司生产：心脑血管类(安宫、清心、大活络等) | 亿元 | 36.29 | 40.63 | 43.88 | 43.88 | 47.39 | 52.13 |
| 同比 | % | 20.80% | 11.97% | 8.00% | 0.00% | 8.00% | 10.00% |
| 毛利率 | $ \% $ | 59.96% | 61.20% | 57.62% | 47.00% | 50.00% | 52.00% |
|   |   |   |   |   |   |   |   |
| 2、补益类(六味、金匮、五子衍宗) |   | 14.56 | 15.67 | 17.30 | 18.68 | 20.55 | 23.02 |
| 同比 | % | 2.86% | 7.62% | 10.40% | 8.00% | 10.00% | 12.00% |
| 毛利率 | $ \% $ | 42.45% | 43.00% | 37.39% | 37.50% | 37.50% | 37.50% |
|   |   |   |   |   |   |   |   |
| 3、妇科类(乌鸡白凤丸、坤宝丸) |   | 3.80 | 3.48 | 3.77 | 3.96 | 4.15 | 4.36 |
| 同比 | % | 23.83% | -8.38% | 8.28% | 5.00% | 5.00% | 5.00% |
| 毛利率 | % | 40.16% | 38.12% | 42.38% | 42.00% | 42.00% | 42.00% |
|   |   |   |   |   |   |   |   |
| 4、清热类(感冒清热颗粒、牛黄解毒) | 亿元 | 5.24 | 5.29 | 6.14 | 5.22 | 5.64 | 6.20 |
| 同比 | % | 5.19% | 0.86% | 16.07% | -15.00% | 8.00% | 10.00% |
| 毛利率 | $ \% $ | 36.09% | 34.39% | 34.97% | 35.00% | 35.00% | 35.00% |
|   |   |   |   |   |   |   |   |
| 5、其他中药品种 | 亿元 | 28.87 | 33.33 | 39.70 | 41.69 | 45.85 | 52.73 |
| 同比 | % | 18.90% | 15.45% | 19.11% | 5.00% | 10.00% | 15.00% |`,

      `## 4.1、关键假设及盈利预测
| 同仁堂经营拆分： | 单位 | 2021A | 2022A | 2023A | 2024E | 2025E | 2026E |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 毛利率 | $ \% $ | 39.36% | 40.25% | 41.65% | 41.00% | 41.00% | 41.00% |
|   |   |   |   |   |   |   |   |
| 二、商业分部(同仁堂商业) | 亿元 | 82.41 | 84.80 | 102.5 | 111.7 | 121.7 | 132.7 |
| 同比 | % | 12.64% | 2.90% | 20.83% | 9.00% | 9.00% | 9.00% |
| 毛利率 | % | 31.51% | 30.95% | 31.11% | 31.00% | 31.00% | 31.00% |
|   |   |   |   |   |   |   |   |
| 三、分部间抵消 | 亿元 | -25.14 | (29.48) | (34.64) | (37.43) | (42.02) | (48.45) |
| 同比 | % | 17.32% | 17.27% | 17.50% | 8.06% | 12.26% | 15.31% |
| 毛利率 | % | -3.39% | -2.05% | -1.61% | -2.0% | -2.0% | -2.0% |
| 分部抵消营收占工业比例 | % | 28.32% | 29.96% | 31.27% | 33.0% | 34.0% | 35.0% |

资料来源：Wind, 诚通证券研究所

综上,我们预测公司 2024-2026 年,营业收入分别为 187.7/203.3/222.7 亿元, 分别同比增 5.1%/8.3%/9.5%；归母净利润分别为 16.7/19.4/22.6 亿元,分别同比增 $ {0.3}\% /{15.8}\% /{16.7}\% $ ; 每股 EPS 分别为 1.22/1.41/1.65 元; 毛利率分别为 44.5%/45.5%/46.5%。`
    ]
  };

  const { chunks } = splitText2Chunks({
    text: mock.text,
    chunkSize: 1000
  });

  expect(chunks).toEqual(mock.result);
});

// Test for lastText handling when all strategies exhausted (Issue #5770)
it(`Test splitText2Chunks 14 - lastText not lost when strategies exhausted`, () => {
  // This test verifies that when all splitting strategies are exhausted
  // and forced character-based splitting occurs, lastText is not lost.
  // The bug was: step >= stepReges.length returned [text] ignoring lastText

  const mock = {
    // Create text with NO good split points (no punctuation, newlines, etc.)
    // This forces the algorithm to exhaust all strategies
    text: 'A'.repeat(1800),
    chunkSize: 500
  };

  const { chunks, chars } = splitText2Chunks({
    text: mock.text,
    chunkSize: mock.chunkSize,
    overlapRatio: 0
  });

  // Critical test: No data loss - total characters in chunks should equal input
  // This would fail with the bug because lastText would be dropped
  // Even if the text is not split (treated as one chunk), data should not be lost
  const totalCharsInChunks = chunks.join('').length;
  expect(totalCharsInChunks).toBe(mock.text.length);

  // Also verify the chars count is correct
  expect(chars).toBe(mock.text.length);

  // Verify no chunk is empty
  chunks.forEach((chunk) => {
    expect(chunk.length).toBeGreaterThan(0);
  });
});
