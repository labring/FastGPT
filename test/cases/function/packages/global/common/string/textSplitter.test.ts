import { it, expect } from 'vitest'; // 必须显式导入
import { splitText2Chunks } from '@fastgpt/global/common/string/textSplitter';
import * as fs from 'fs';

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

FastGPT 在线使用：https://tryfastgpt.ai

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
      `快速了解 FastGPT
FastGPT 的能力与优势

FastGPT 是一个基于 LLM 大语言模型的知识库问答系统，提供开箱即用的数据处理、模型调用等能力。同时可以通过 Flow 可视化进行工作流编排，从而实现复杂的问答场景！

FastGPT 在线使用：https://tryfastgpt.ai

FastGPT 能力 
1. 专属 AI 客服 
通过导入文档或已有问答对进行训练，让 AI 模型能根据你的文档以交互式对话方式回答问题。

2. 简单易用的可视化界面 
FastGPT 采用直观的可视化界面设计，为各种应用场景提供了丰富实用的功能。通过简洁易懂的操作步骤，可以轻松完成 AI 客服的创建和训练流程。

3. 自动数据预处理 
提供手动输入、直接分段、LLM 自动处理和 CSV 等多种数据导入途径，其中“直接分段”支持通过 PDF、WORD、Markdown 和 CSV 文档内容作为上下文。FastGPT 会自动对文本数据进行预处理、向量化和 QA 分割，节省手动训练时间，提升效能。

4. 工作流编排 
基于 Flow 模块的工作流编排，可以帮助你设计更加复杂的问答流程。例如查询数据库、查询库存、预约实验室等。`,
      `5. 强大的 API 集成 
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

在 FastGPT 的 AI 对话模块中，有一个 AI 高级配置，里面包含了 AI 模型的参数配置，本文详细介绍这些配置的含义。`,
      `返回AI内容（高级编排特有） 
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
🍅`,
      `Tips: 可以通过点击上下文按键查看完整的上下文组成，便于调试。

引用模板和提示词设计 
简易模式已移除该功能，仅在工作流中可配置，可点击工作流中AI对话节点内，知识库引用旁边的setting icon进行配置。随着模型的增强，这部分功能将逐步弱化。

引用模板和引用提示词通常是成对出现，引用提示词依赖引用模板。

FastGPT 知识库采用 QA 对(不一定都是问答格式，仅代表两个变量)的格式存储，在转义成字符串时候会根据引用模板来进行格式化。知识库包含多个可用变量： q, a, sourceId（数据的ID）, index(第n个数据), source(数据的集合名、文件名)，score(距离得分，0-1) 可以通过 {{q}} {{a}} {{sourceId}} {{index}} {{source}} {{score}} 按需引入。下面一个模板例子：

可以通过 知识库结构讲解 了解详细的知识库的结构。

引用模板 
{instruction:"{{q}}",output:"{{a}}",source:"{{source}}"}
搜索到的知识库，会自动将 q,a,source 替换成对应的内容。每条搜索到的内容，会通过 
 隔开。例如：`,
      `{instruction:"电影《铃芽之旅》的导演是谁？",output:"电影《铃芽之旅》的导演是新海诚。",source:"手动输入"}
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
转义后则为：`,
      `你的背景知识:
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
我们通过一组你是谁的手动数据，对通用模板与问答模板的效果进行对比。此处特意打了个搞笑的答案，通用模板下 GPT35 就变得不那么听话了，`
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
      `这是测试文本 1，短的`,
      `这是测试文本 2,长的。
FastGPT是一款基于大语言模型（LLM）的智能问答系统，专为提供高效、准确的知识库问答服务而设计。它支持多种数据导入方式，包括手动输入、PDF、WORD、Markdown和CSV等格式，能够自动进行数据预处理、向量化和QA分割，大幅提升数据处理效率。FastGPT的可视化界面设计简洁直观，用户可以通过Flow模块进行工作流编排，轻松实现复杂的问答场景。此外，FastGPT支持多种LLM模型，如GPT、Claude、文心一言等，未来还将支持自定义的向量模型。其强大的API集成能力使得用户可以轻松将其接入现有的GPT应用或其他平台，如企业微信、公众号、飞书等。FastGPT的开源项目遵循Apache License 2.0协议，用户可以进行二次开发和发布。其独特的QA结构设计提高了在大量数据场景中的问答准确性，而可视化工作流则展示了从问题输入到模型输出的完整流程，便于调试和设计复杂流程。FastGPT还提供了多种调试途径，如搜索测试、引用修改和完整对话预览等，方便用户进行调试。其知识库核心流程包括AI相关参数配置说明，如返回AI内容、最大上下文、函数调用、温度、回复上限、系统提示词、引用模板和引用提示词等。`,
      `FastGPT还提供了多种调试途径，如搜索测试、引用修改和完整对话预览等，方便用户进行调试。其知识库核心流程包括AI相关参数配置说明，如返回AI内容、最大上下文、函数调用、温度、回复上限、系统提示词、引用模板和引用提示词等。通过这些配置，用户可以更好地控制和优化AI模型的表现。FastGPT的引用模板和提示词设计使得用户可以根据具体需求进行灵活配置，从而提高问答的准确性和效率。总之，FastGPT是一款功能强大、易于使用的智能问答系统，适用于各种应用场景，帮助用户实现高效、准确的知识库问答服务。FastGPT的设计理念是通过先进的技术手段简化用户的操作流程，使得即便是没有技术背景的用户也能轻松上手。其多样化的数据导入方式确保了用户可以根据自身需求选择最合适的方式进行数据输入，而自动化的数据预处理功能则大大减少了用户的工作量。通过对数据的向量化处理，FastGPT能够更好地理解和分析用户的问题，从而提供更为精准的回答。`
    ]
  };

  const { chunks } = splitText2Chunks({ text: mock.text, chunkSize: 500, customReg: ['----'] });

  expect(chunks).toEqual(mock.result);
});

// 自定义分隔符测试：换行符号
it(`Test splitText2Chunks 1`, () => {
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

// 长代码块分割
it(`Test splitText2Chunks 7`, () => {
  const mock = {
    text: `这是一个测试的内容，包含代码块

快速了解 FastGPT
FastGPT 的能力与优势

FastGPT 是一个基于 LLM 大语言模型的知识库问答系统，提供开箱即用的数据处理、模型调用等能力。同时可以通过 Flow 可视化进行工作流编排，从而实现复杂的问答场景！

FastGPT 在线使用：https://tryfastgpt.ai

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
      `这是一个测试的内容，包含代码块

快速了解 FastGPT
FastGPT 的能力与优势

FastGPT 是一个基于 LLM 大语言模型的知识库问答系统，提供开箱即用的数据处理、模型调用等能力。同时可以通过 Flow 可视化进行工作流编排，从而实现复杂的问答场景！

FastGPT 在线使用：https://tryfastgpt.ai

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
~~~`,
      `3. 自动数据预处理 
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
`,
      `无限扩展

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
代表模型最多容纳的文字数量。`
    ]
  };

  const { chunks } = splitText2Chunks({
    text: mock.text,
    chunkSize: 500,
    maxSize: 100000,
    customReg: ['----']
  });

  const normalizedChunks = simpleChunks(chunks);
  const normalizedExpected = simpleChunks(mock.result);

  expect(normalizedChunks).toEqual(normalizedExpected);
});

// 表格分割测试 - 不超出maxSize
it(`Test splitText2Chunks 1`, () => {
  const mock = {
    text: `测试的呀

| 序号 | 姓名 | 年龄 | 职业 | 城市 |
|------|------|------|------|------|
| 1 | 张三 | 25 | 工程师 | 北京 |
| 2 | 李四 | 30 | 教师 | 上海 |
| 3 | 王五 | 28 | 医生 | 广州 |
| 4 | 赵六 | 35 | 律师 | 深圳 |
| 5 | 孙七 | 27 | 设计师 | 杭州 |
| 6 | 周八 | 32 | 会计 | 成都 |
| 7 | 吴九 | 29 | 销售 | 武汉 |
| 8 | 郑十 | 31 | 记者 | 南京 |
| 9 | 刘一 | 33 | 建筑师 | 天津 |
| 10 | 陈二 | 26 | 程序员 | 重庆 |
| 1000 | 黄末 | 28 | 作家 | 厦门 |
| 1001 | 杨一 | 34 | 程序员 | 厦门 |
| 1002 | 杨二 | 34 | 程序员 | 厦门 |
| 1003 | 杨三 | 34 | 程序员 | 厦门 |
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
| 1000 | 黄末 | 28 | 作家 | 厦门 |
| 1000 | 黄末 | 28 | 作家 | 厦门 |
| 1000 | 黄末 | 28 | 作家 | 厦门 |

这是第二段了`,
    result: [
      `测试的呀

| 序号 | 姓名 | 年龄 | 职业 | 城市 |
|------|------|------|------|------|
| 1 | 张三 | 25 | 工程师 | 北京 |
| 2 | 李四 | 30 | 教师 | 上海 |
| 3 | 王五 | 28 | 医生 | 广州 |
| 4 | 赵六 | 35 | 律师 | 深圳 |
| 5 | 孙七 | 27 | 设计师 | 杭州 |
| 6 | 周八 | 32 | 会计 | 成都 |
| 7 | 吴九 | 29 | 销售 | 武汉 |
| 8 | 郑十 | 31 | 记者 | 南京 |
| 9 | 刘一 | 33 | 建筑师 | 天津 |
| 10 | 陈二 | 26 | 程序员 | 重庆 |
| 1000 | 黄末 | 28 | 作家 | 厦门 |
| 1001 | 杨一 | 34 | 程序员 | 厦门 |
| 1002 | 杨二 | 34 | 程序员 | 厦门 |
| 1003 | 杨三 | 34 | 程序员 | 厦门 |
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
| 1000 | 黄末 | 28 | 作家 | 厦门 |
| 1000 | 黄末 | 28 | 作家 | 厦门 |
| 1000 | 黄末 | 28 | 作家 | 厦门 |

这是第二段了`
    ]
  };

  const { chunks } = splitText2Chunks({ text: mock.text, chunkSize: 2000 });
  expect(chunks).toEqual(mock.result);
});
// 表格分割测试 - 超出maxSize
it(`Test splitText2Chunks 1`, () => {
  const mock = {
    text: `测试的呀

| 序号 | 姓名 | 年龄 | 职业 | 城市 |
|------|------|------|------|------|
| 1 | 张三 | 25 | 工程师 | 北京 |
| 2 | 李四 | 30 | 教师 | 上海 |
| 3 | 王五 | 28 | 医生 | 广州 |
| 4 | 赵六 | 35 | 律师 | 深圳 |
| 5 | 孙七 | 27 | 设计师 | 杭州 |
| 6 | 周八 | 32 | 会计 | 成都 |
| 7 | 吴九 | 29 | 销售 | 武汉 |
| 8 | 郑十 | 31 | 记者 | 南京 |
| 9 | 刘一 | 33 | 建筑师 | 天津 |
| 10 | 陈二 | 26 | 程序员 | 重庆 |
| 1000 | 黄末 | 28 | 作家 | 厦门 |
| 1001 | 杨一 | 34 | 程序员 | 厦门 |
| 1002 | 杨二 | 34 | 程序员 | 厦门 |
| 1003 | 杨三 | 34 | 程序员 | 厦门 |
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
| 1000 | 黄末 | 28 | 作家 | 厦门 |
| 1000 | 黄末 | 28 | 作家 | 厦门 |
| 1000 | 黄末 | 28 | 作家 | 厦门 |

这是第二段了`,
    result: [
      `测试的呀

| 序号 | 姓名 | 年龄 | 职业 | 城市 |
|------|------|------|------|------|
| 1 | 张三 | 25 | 工程师 | 北京 |
| 2 | 李四 | 30 | 教师 | 上海 |
| 3 | 王五 | 28 | 医生 | 广州 |
| 4 | 赵六 | 35 | 律师 | 深圳 |
| 5 | 孙七 | 27 | 设计师 | 杭州 |
| 6 | 周八 | 32 | 会计 | 成都 |
| 7 | 吴九 | 29 | 销售 | 武汉 |
| 8 | 郑十 | 31 | 记者 | 南京 |
| 9 | 刘一 | 33 | 建筑师 | 天津 |
| 10 | 陈二 | 26 | 程序员 | 重庆 |
| 1000 | 黄末 | 28 | 作家 | 厦门 |
| 1001 | 杨一 | 34 | 程序员 | 厦门 |
| 1002 | 杨二 | 34 | 程序员 | 厦门 |
| 1003 | 杨三 | 34 | 程序员 | 厦门 |
| 1004 | 杨四 | 34 | 程序员 | 厦门 |
| 1005 | 杨五 | 34 | 程序员 | 厦门 |`,
      `| 1000 | 黄末 | 28 | 作家 | 厦门 |
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
| 1000 | 黄末 | 28 | 作家 | 厦门 |
| 1000 | 黄末 | 28 | 作家 | 厦门 |
| 1000 | 黄末 | 28 | 作家 | 厦门 |

这是第二段了`
    ]
  };

  const { chunks } = splitText2Chunks({ text: mock.text, chunkSize: 512, maxSize: 512 });

  expect(chunks).toEqual(mock.result);
});
