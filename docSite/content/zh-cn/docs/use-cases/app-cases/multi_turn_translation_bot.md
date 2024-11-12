---
title: "多轮翻译机器人"
description: "如何使用 FastGPT 构建一个多轮翻译机器人，实现连续的对话翻译功能"
icon: "translate"
draft: false
toc: true
weight: 606
---

吴恩达老师提出了一种反思翻译的大语言模型(LLM)翻译工作流程——[GitHub - andrewyng/translation-agent](https://github.com/andrewyng/translation-agent)，具体工作流程如下：

1. 提示一个 LLM 将文本从 `source_language` 翻译到 `target_language`；
2. 让 LLM 反思翻译结果并提出建设性的改进建议；
3. 使用这些建议来改进翻译。

这个翻译流程应该是目前比较新的一种翻译方式，利用 LLM 对自己的翻译结果进行改进来获得较好的翻译效果

项目中展示了可以利用对长文本进行分片，然后分别进行反思翻译处理，以突破 LLM 对 tokens 数量的限制，真正实现长文本一键高效率高质量翻译。

项目还通过给大模型限定国家地区，已实现更精确的翻译，如美式英语、英式英语之分；同时提出一些可能能带来更好效果的优化，如对于一些 LLM 未曾训练到的术语（或有多种翻译方式的术语）建立术语表，进一步提升翻译的精确度等等

而这一切都能通过 Fastgpt 工作流轻松实现，本文将手把手教你如何复刻吴恩达老师的 translation-agent

# 单文本块反思翻译

先从简单的开始，即不超出 LLM tokens 数量限制的单文本块翻译

## 初始翻译

第一步先让 LLM 对源文本块进行初始翻译（翻译的提示词在源项目中都有）

![](/imgs/translate1.png)

通过`文本拼接`模块引用 源语言、目标语言、源文本这三个参数，生成提示词，传给 LLM，让它给出第一版的翻译

## 反思

然后让 LLM 对第一步生成的初始翻译给出修改建议，称之为 反思

![](/imgs/translate2.png)

这时的提示词接收 5 个参数，源文本、初始翻译、源语言、目标语言 以及限定词地区国家，这样 LLM 会对前面生成的翻译提出相当多的修改建议，为后续的提升翻译作准备

## 提升翻译

![](/imgs/translate3.png)

在前文生成了初始翻译以及相应的反思后，将这二者输入给第三次 LLM 翻译，这样我们就能获得一个比较高质量的翻译结果

完整的工作流如下

![](/imgs/translate4.png)

## 运行效果

由于考虑之后对这个反思翻译的复用，所以创建了一个插件，那么在下面我直接调用这个插件就能使用反思翻译，效果如下

随机挑选了一段哈利波特的文段

![](/imgs/translate5.png)

![](/imgs/translate6.png)

可以看到反思翻译后的效果还是好上不少的，其中反思的输出如下

![](/imgs/translate7.png)

# 长文反思翻译

在掌握了对短文本块的反思翻译后，我们能轻松的通过分片和循环，实现对长文本也即多文本块的反思翻译

整体的逻辑是，首先对传入文本的 tokens数量做判断，如果不超过设置的 tokens 限制，那么直接调用单文本块反思翻译，如果超过设置的 tokens限制，那么切割为合理的大小，再分别进行对应的反思翻译处理

## 计算 tokens

![](/imgs/translate8.png)

首先，我使用了 Laf函数 模块来实现对输入文本的 tokens 的计算

laf函数的使用相当简单，即开即用，只需要在 laf 创建个应用，然后安装 tiktoken 依赖，导入如下代码即可

```TypeScript
const { Tiktoken } = require("tiktoken/lite");
const cl100k_base = require("tiktoken/encoders/cl100k_base.json");

interface IRequestBody {
  str: string
}

interface RequestProps extends IRequestBody {
  systemParams: {
    appId: string,
    variables: string,
    histories: string,
    cTime: string,
    chatId: string,
    responseChatItemId: string
  }
}

interface IResponse {
  message: string;
  tokens: number;
}

export default async function (ctx: FunctionContext): Promise<IResponse> {
  const { str = "" }: RequestProps = ctx.body
  
  const encoding = new Tiktoken(
    cl100k_base.bpe_ranks,
    cl100k_base.special_tokens,
    cl100k_base.pat_str
  );
  const tokens = encoding.encode(str);
  encoding.free();
  
  return {
    message: 'ok',
    tokens: tokens.length
  };
}
```

再回到 Fastgpt，点击“同步参数”，再连线将源文本传入，即可计算 tokens 数量

## 计算单文本块大小

![](/imgs/translate9.png)

由于不涉及第三方包，只是一些数据处理，所以直接使用 代码运行 模块处理即可

```TypeScript
function main({tokenCount, tokenLimit}){
  const numChunks = Math.ceil(tokenCount / tokenLimit);
  let chunkSize = Math.floor(tokenCount / numChunks);

  const remainingTokens = tokenCount % tokenLimit;
  if (remainingTokens > 0) {
    chunkSize += Math.floor(remainingTokens / numChunks);
  }

  return {chunkSize};
}
```

通过上面的代码，我们就能算出不超过 token限制的合理单文本块大小是多少了

## 获得切分后源文本块

![](/imgs/translate10.png)

通过单文本块大小和源文本，我们再编写一个函数调用 langchain 的 textsplitters 包来实现文本分片，具体代码如下

```TypeScript
import cloud from '@lafjs/cloud'
import { TokenTextSplitter } from "@langchain/textsplitters";

interface IRequestBody { 
  text: string 
  chunkSize: number
}

interface RequestProps extends IRequestBody {
  systemParams: {
    appId: string,
    variables: string,
    histories: string,
    cTime: string,
    chatId: string,
    responseChatItemId: string
  }
}

interface IResponse {
  output: string[];
}

export default async function (ctx: FunctionContext): Promise<IResponse>{
  const { text = '', chunkSize=1000 }: RequestProps = ctx.body;

  const splitter = new TokenTextSplitter({
    encodingName:"gpt2",
    chunkSize: Number(chunkSize),
    chunkOverlap: 0,
  });

  const output = await splitter.splitText(text);

  return { 
    output
   }
}
```

这样我们就获得了切分好的文本，接下去的操作就类似单文本块反思翻译

## 多文本块翻译

这里应该还是不能直接调用前面的单文本块反思翻译，因为提示词中会涉及一些上下文的处理（或者可以修改下前面写好的插件，多传点参数进去）

详细的和前面类似，就是提示词进行一些替换，以及需要做一些很简单的数据处理，整体效果如下

### 多文本块初始翻译

![](/imgs/translate11.png)

### 多文本块反思

![](/imgs/translate12.png)

### 多文本块提升翻译

![](/imgs/translate13.png)

## 循环执行

长文反思翻译比较关键的一个部分，就是对多个文本块进行循环反思翻译

Fastgpt 提供了工作流线路可以返回去执行的功能，所以我们可以写一个很简单的判断函数，来判断结束或是接着执行

![](/imgs/translate14.png)

也就是通过判断当前处理的这个文本块，是否是最后一个文本块，从而判断是否需要继续执行，就这样，我们实现了长文反思翻译的效果

完整工作流如下

![](/imgs/translate15.png)

## 运行效果

首先输入全局设置

![](/imgs/translate16.png)

然后输入需要翻译的文本，这里我选择了一章哈利波特的英文原文来做翻译，其文本长度通过 openai 对 tokens 数量的判断如下

![](/imgs/translate17.png)

实际运行效果如下

![](/imgs/translate18.png)

可以看到还是能满足阅读需求的

# 进一步调优

## 提示词调优

在源项目中，给 AI 的系统提示词还是比较的简略的，我们可以通过比较完善的提示词，来督促 LLM 返回更合适的翻译，进一步提升翻译的质量

比如初始翻译中，

```TypeScript
# Role: 资深翻译专家

## Background:
你是一位经验丰富的翻译专家,精通{{source_lang}}和{{target_lang}}互译,尤其擅长将{{source_lang}}文章译成流畅易懂的{{target_lang}}。你曾多次带领团队完成大型翻译项目,译文广受好评。

## Attention:
- 翻译过程中要始终坚持"信、达、雅"的原则,但"达"尤为重要
- 译文要符合{{target_lang}}的表达习惯,通俗易懂,连贯流畅 
- 避免使用过于文绉绉的表达和晦涩难懂的典故引用

## Constraints:
- 必须严格遵循四轮翻译流程:直译、意译、校审、定稿  
- 译文要忠实原文,准确无误,不能遗漏或曲解原意

## Goals:
- 通过四轮翻译流程,将{{source_lang}}原文译成高质量的{{target_lang}}译文  
- 译文要准确传达原文意思,语言表达力求浅显易懂,朗朗上口
- 适度使用一些熟语俗语、流行网络用语等,增强译文的亲和力
- 在直译的基础上,提供至少2个不同风格的意译版本供选择

## Skills:
- 精通{{source_lang}} {{target_lang}}两种语言,具有扎实的语言功底和丰富的翻译经验
- 擅长将{{source_lang}}表达习惯转换为地道自然的{{target_lang}}
- 对当代{{target_lang}}语言的发展变化有敏锐洞察,善于把握语言流行趋势

## Workflow:
1. 第一轮直译:逐字逐句忠实原文,不遗漏任何信息
2. 第二轮意译:在直译的基础上用通俗流畅的{{target_lang}}意译原文,至少提供2个不同风格的版本
3. 第三轮校审:仔细审视译文,消除偏差和欠缺,使译文更加地道易懂 
4. 第四轮定稿:择优选取,反复修改润色,最终定稿出一个简洁畅达、符合大众阅读习惯的译文

## OutputFormat: 
- 只需要输出第四轮定稿的回答

## Suggestions:
- 直译时力求忠实原文,但不要过于拘泥逐字逐句
- 意译时在准确表达原意的基础上,用最朴实无华的{{target_lang}}来表达 
- 校审环节重点关注译文是否符合{{target_lang}}表达习惯,是否通俗易懂
- 定稿时适度采用一些熟语谚语、网络流行语等,使译文更接地气- 善于利用{{target_lang}}的灵活性,用不同的表述方式展现同一内容,提高译文的可读性
```

从而返回更准确更高质量的初始翻译，后续的反思和提升翻译也可以修改更准确的提示词，如下

![](/imgs/translate19.png)

然后再让我们来看看运行效果

![](/imgs/translate20.png)

给了和之前相同的一段文本进行测试，测试效果还是比较显著的，就比如红框部分，之前的翻译如下

![](/imgs/translate21.png)

从“让你的猫头鹰给我写信”这样有失偏颇的翻译，变成“给我写信，你的猫头鹰会知道怎么找到我”这样较为准确的翻译

## 其他调优

比如限定词调优，源项目中已经做了示范，就是加上国家地区这个限定词，实测确实会有不少提升

出于 LLM 的卓越能力，我们能够通过设置不同的prompt来获取不同的翻译结果，也就是可以很轻松地通过设置特殊的限定词，来实现特定的，更精确的翻译

而对于一些超出 LLM 理解的术语等，也可以利用 Fastgpt 的知识库功能进行相应扩展，进一步完善翻译机器人的功能