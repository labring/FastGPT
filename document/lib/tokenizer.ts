import { createTokenizer } from '@orama/tokenizers/mandarin';

export const enhancedTokenizer = () => {
  // 整词配置 - 需要保持完整的词汇
  const wholeWords = [
    // 产品相关
    'fastgpt',
    'FastGPT',
    'Saas',
    '云服务',
    '社区版',
    '商业版',

    // 功能模块
    '知识库',
    '工作流',
    '应用构建',
    '对话管理',

    // 技术术语
    'AI',
    'Agent',
    'API',
    'SSO',
    'MCP',
    '向量数据库',
    '语义搜索',
    'embedding',

    // 业务概念
    '沙盒',
    '插件',
    '模板',
    '权限管理',
    '团队协作'
  ];

  // 同义词配置 - 为整词添加相关的同义词
  const synonymsMap: Record<string, string[]> = {
    开源版: ['开源', '开源版', '社区版']
  };

  const baseTokenizer = createTokenizer();

  return {
    ...baseTokenizer,
    tokenize: (text: string) => {
      // 先处理整词，用特殊标记保护它们
      let processedText = text;
      const protectedTokens = new Map();
      let tokenIndex = 0;

      wholeWords.forEach((word) => {
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        processedText = processedText.replace(regex, (match) => {
          const placeholder = `__PROTECTED_TOKEN_${tokenIndex}__`;
          protectedTokens.set(placeholder, match.toLowerCase());
          tokenIndex++;
          return placeholder;
        });
      });

      // 用基础分词器处理
      let tokens = baseTokenizer.tokenize(processedText);

      // 恢复被保护的整词，并添加同义词
      tokens = tokens
        .map((token) => {
          if (protectedTokens.has(token)) {
            const originalWord = protectedTokens.get(token);
            return synonymsMap[originalWord] || [originalWord];
          }
          return token;
        })
        .flat();

      return [...new Set(tokens)]; // 去重
    }
  };
};
