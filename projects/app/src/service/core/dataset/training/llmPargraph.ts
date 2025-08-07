import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type';
import { countGptMessagesTokens, countPromptTokens } from '@fastgpt/service/common/string/tiktoken';
import { createChatCompletion } from '@fastgpt/service/core/ai/config';
import { getLLMModel } from '@fastgpt/service/core/ai/model';
import { formatLLMResponse, llmCompletionsBodyFormat } from '@fastgpt/service/core/ai/utils';
import { loadRequestMessages } from '@fastgpt/service/core/chat/utils';
import json5 from 'json5';

// 定义目录项类型
interface DirectoryItem {
  line_number: string;
  content: string;
}

interface ProcessedDirectoryItem {
  line_number: number;
  content: string;
}

const PROMPT = `你是一个专业的文档结构分析助手。你的任务是根据提供的文档内容，识别并提取出目录结构（最高支持四级目录）。

## 文档格式说明

- 文档的每一行都以 "[行号]" 开头，例如 "[3] 标题一"
- 方括号中的数字表示该行在原始文档中的准确行号
- 你提取的每个标题的行号必须严格对应该 "[数字]" 中的值（不要偏移）

## 任务要求

1. 分析文档的整体结构和语义信息来提取出文本的目录结构（最多四层）
2. 对于每一个层级的目录项：
    - 如果原文中有明确的标题（如以 "#" 开头、或整行为标题风格的短句），请直接使用原文标题文本（**不要对标题文字做任何修改**，因为后续需要做精确匹配）
    - 如果标题被拆分在多行中（例如：公司名在一行，规则名在下一行），请智能合并为一个完整标题，仅保留第一行的行号，并将多个标题行的内容使用空格连接
    - 如果某个段落没有明显标题，但语义上属于独立部分，请你为它生成一个合理的标题，并加上合适的 Markdown 层级（如："## 概要信息"）
3. 每个目录项应包含以下字段：
    - "line_number"：该标题在原始文档中对应的行号（从该标题第一行的 "[数字]" 中提取）
    - "content"：该标题文本，并用 Markdown 标题语法标注其层级（如："# 一级标题"、"## 二级标题" 等）
4. 层级识别参考标准如下（模型可以灵活判断）：
    - 一级标题（"#"）：通常为整篇文档的主标题、大章节名称
    - 二级标题（"##"）：章节内部的子模块、小节、规则名称等
    - 三级标题（"###"）：更细粒度的分类，例如：背景、目的、适用范围等
    - 四级标题（"####"）：表格说明、子条件、执行细则等
5. 如果有额外的目录信息输入，可以考虑之前目录内容的层级关系和标号进而来提取新内容的目录
   
## 输出格式

请严格输出以下 "数组" 格式的结构化数据，不允许包含多余解释或注释：

[
    {
        "line_number": "3",
        "content": "# 标题一"
    },
    {
        "line_number": "8",
        "content": "### 事件描述"
    }
]
`;

// 辅助函数：清理JSON响应
const cleanJsonResponse = (answer: string): string => {
  let cleanedAnswer = answer.trim();

  // 移除开头的 ```json 或 ``` 标记
  if (cleanedAnswer.startsWith('```json')) {
    cleanedAnswer = cleanedAnswer.substring(6).trim();
  } else if (cleanedAnswer.startsWith('```')) {
    cleanedAnswer = cleanedAnswer.substring(3).trim();
  }

  // 移除结尾的 ``` 标记
  if (cleanedAnswer.endsWith('```')) {
    cleanedAnswer = cleanedAnswer.substring(0, cleanedAnswer.length - 3).trim();
  }

  return cleanedAnswer;
};

// 辅助函数：解析目录列表
const parseDirectoryList = (answer: string): DirectoryItem[] => {
  try {
    const cleanedAnswer = cleanJsonResponse(answer);
    const result = json5.parse(cleanedAnswer) as DirectoryItem[];
    return result || [];
  } catch (error) {
    return [];
  }
};

// 辅助函数：过滤重复和无效的目录项
const filterDirectoryList = (
  dirList: DirectoryItem[],
  previousLatestNumber: number | null,
  previousDirList: DirectoryItem[]
): DirectoryItem[] => {
  if (previousLatestNumber === null) {
    return dirList;
  }

  const filteredDirList: DirectoryItem[] = [];
  let previousLineNumber = previousLatestNumber;

  for (const item of dirList) {
    const currentLineNumber = parseInt(item.line_number);
    if (currentLineNumber > previousLineNumber) {
      filteredDirList.push(item);
      previousLineNumber = currentLineNumber;
    }
  }

  // 如果最新的内容和上一个目录的内容相同，则不需要添加
  if (filteredDirList.length > 0) {
    const latestItem = previousDirList[previousDirList.length - 1];
    if (
      latestItem &&
      (latestItem.content === filteredDirList[0].content ||
        latestItem.line_number === filteredDirList[filteredDirList.length - 1].line_number)
    ) {
      filteredDirList.shift();
    }
  }

  return filteredDirList;
};

// 辅助函数：获取块的最后行号
const getChunkLastLineNumber = (chunk: string): number => {
  const lineNumbers = chunk.match(/\[(\d+)\]/g);
  if (lineNumbers && lineNumbers.length > 0) {
    const lastLineNumber = lineNumbers[lineNumbers.length - 1].replace(/[\[\]]/g, '');
    return parseInt(lastLineNumber);
  }
  return 0;
};

// 辅助函数：将文本分割成块
const splitTextIntoChunks = (lineRawText: string[], maxContext: number): string[] => {
  const chunks: string[] = [];
  let text = '';

  lineRawText.forEach((item) => {
    text += `${item}\n`;
    if (text.length > maxContext) {
      chunks.push(text.trim());
      text = '';
    }
  });

  if (text) {
    chunks.push(text);
  }

  return chunks;
};

// 辅助函数：处理单个块
const processChunk = async (
  chunk: string,
  chunkIndex: number,
  previousDirList: DirectoryItem[],
  previousLatestNumber: number | null,
  modelData: any
): Promise<{
  dirList: DirectoryItem[];
  inputTokens: number;
  outputTokens: number;
}> => {
  const messages: ChatCompletionMessageParam[] = [
    {
      role: ChatCompletionRequestMessageRoleEnum.System,
      content: PROMPT
    }
  ];

  // 如果不是第一个块，添加上下文信息
  if (chunkIndex > 0 && previousDirList.length > 0 && previousLatestNumber !== null) {
    const contextPrompt = `这是上一个内容的目录结构：\n${previousDirList
      .map((item) => `${item.line_number}: ${item.content}`)
      .join('\n')}\n特别重要：为了保障连贯性，请确保之后提取的行号大于${previousLatestNumber}`;

    messages.push({
      role: ChatCompletionRequestMessageRoleEnum.System,
      content: contextPrompt
    });
  }

  messages.push({
    role: ChatCompletionRequestMessageRoleEnum.User,
    content: chunk
  });

  const { response: chatResponse } = await createChatCompletion({
    body: llmCompletionsBodyFormat(
      {
        model: modelData.model,
        temperature: 0.1,
        messages: await loadRequestMessages({ messages, useVision: false }),
        stream: true
      },
      modelData
    )
  });

  const { text: answer, usage } = await formatLLMResponse(chatResponse);
  const inputTokens = usage?.prompt_tokens || (await countGptMessagesTokens(messages));
  const outputTokens = usage?.completion_tokens || (await countPromptTokens(answer));

  const dirList = parseDirectoryList(answer);

  return { dirList, inputTokens, outputTokens };
};

// 辅助函数：应用目录到文本
const applyDirectoriesToText = (
  lineRawText: string[],
  answerResults: ProcessedDirectoryItem[]
): string[] => {
  // 删除每行开头的 [num]
  const cleanedText = lineRawText.map((item) => item.replace(/^\[\d+\]\s*/, ''));

  // 将模型结果赋值给原文
  answerResults.forEach((item) => {
    const line = item.line_number - 1;
    const title = item.content;

    if (!cleanedText[line]) {
      return;
    }

    // 提取 title 正文（过滤掉 # 标题符号）
    const titleText = title.replace(/^#+\s*/, '').trim();

    // 删除 lineRawText[line] 开头和提取结果相同的部分
    if (cleanedText[line].startsWith(titleText)) {
      cleanedText[line] = cleanedText[line].substring(titleText.length).trim();
    }

    cleanedText[line] = `${item.content}\n${cleanedText[line]}`;
  });

  return cleanedText;
};

export const llmPargraph = async ({ rawText, model }: { rawText: string; model: string }) => {
  console.log(`[llmPargraph] start, model: ${model}, rawText length: ${rawText.length}`);
  const modelData = getLLMModel(model);
  if (!modelData) {
    return Promise.reject('Model not found');
  }
  // 添加调试日志：检查输入文本
  console.log(`[llmPargraph] Input rawText:`, {
    rawTextLength: rawText.length,
    rawTextPreview: rawText.substring(0, 500),
    hasMarkdownHeaders: /^#+\s/m.test(rawText),
    markdownHeadersCount: (rawText.match(/^#+\s/g) || []).length
  });

  // 1. 原文每一行前面增加一个行号, 并删除原来的标题
  const lineRawText = rawText
    .split('\n')
    .map((text, index) => `[${index + 1}] ${text.replace(/^#+\s*/, '').trim()}`);

  // 添加调试日志：检查处理后的行文本
  console.log(`[llmPargraph] Processed lineRawText:`, {
    lineCount: lineRawText.length,
    firstFewLines: lineRawText.slice(0, 5),
    hasLineNumbers: lineRawText.some((line) => /^\[\d+\]/.test(line))
  });

  // 2. 按最大上下文分割
  const maxContext = Math.max(modelData.maxContext - modelData.maxResponse, 16000);
  const chunks = splitTextIntoChunks(lineRawText, maxContext);

  // 3. 分段调用模型获取结果
  let previousDirList: DirectoryItem[] = [];
  let previousLatestNumber: number | null = null;
  let allDirectories: DirectoryItem[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (let i = 0; i < chunks.length; i++) {
    const { dirList, inputTokens, outputTokens } = await processChunk(
      chunks[i],
      i,
      previousDirList,
      previousLatestNumber,
      modelData
    );

    totalInputTokens += inputTokens;
    totalOutputTokens += outputTokens;

    // 处理重复的标题和行号小于之前的标题行
    const filteredDirList = filterDirectoryList(dirList, previousLatestNumber, previousDirList);

    // 更新上下文信息
    if (filteredDirList.length > 0) {
      previousDirList = filteredDirList;
      const lastItem = filteredDirList[filteredDirList.length - 1];
      previousLatestNumber = parseInt(lastItem.line_number);

      // 获取当前块的最后行号
      const chunkLastLineNumber = getChunkLastLineNumber(chunks[i]);
      previousLatestNumber = Math.max(previousLatestNumber, chunkLastLineNumber);
    }

    allDirectories.push(...filteredDirList);
  }

  // 4. 按行号排序并转换为旧格式
  const answerResults = allDirectories
    .sort((a, b) => parseInt(a.line_number) - parseInt(b.line_number))
    .map((item) => ({
      line_number: parseInt(item.line_number),
      content: item.content
    }));

  // 5. 应用目录到文本并获取最终结果
  const finalText = applyDirectoriesToText(lineRawText, answerResults);
  const resultText = finalText.join('\n');

  // 添加兜底机制：如果LLM没有识别出标题结构，保留原有标题
  let finalResultText = resultText;
  if (answerResults.length === 0) {
    console.log(`[llmPargraph] No titles detected by LLM, keeping original text with headers`);
    // 如果LLM没有识别出任何标题，保留原始文本（包含原有的#标题）
    finalResultText = rawText;
  } else {
    console.log(`[llmPargraph] LLM detected ${answerResults.length} titles`);
  }

  // 添加调试日志：检查最终输出结果
  console.log(`[llmPargraph] Final result:`, {
    resultTextLength: finalResultText.length,
    resultTextPreview: finalResultText.substring(0, 500),
    hasMarkdownHeaders: /^#+\s/m.test(finalResultText),
    markdownHeadersCount: (finalResultText.match(/^#+\s/g) || []).length,
    answerResultsCount: answerResults.length,
    answerResultsPreview: answerResults.slice(0, 3),
    usedFallback: answerResults.length === 0
  });

  return {
    resultText: finalResultText,
    totalInputTokens,
    totalOutputTokens
  };
};
