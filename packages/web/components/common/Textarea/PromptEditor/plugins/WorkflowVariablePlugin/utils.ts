function getHashtagRegexVariableLabels(): Readonly<{
  leftBrace: string;
  prefix: string;
  rightBrace: string;
}> {
  const leftBrace = '[\\{]';
  const prefix = 'system\\.';
  const rightBrace = '[\\}]';

  return {
    leftBrace,
    prefix,
    rightBrace
  };
}

export function getHashtagRegexString(): string {
  const { leftBrace, prefix, rightBrace } = getHashtagRegexVariableLabels();

  // 构建递归匹配的正则表达式
  const hashtag =
    `(${leftBrace})` + // 第一个左花括号
    `(${leftBrace})` + // 第二个左花括号
    `${prefix}` + // system.
    `([a-zA-Z0-9_]{6})` + // 变量名
    `(${rightBrace})` + // 第一个右花括号
    `(${rightBrace})`; // 第二个右花括号

  return hashtag;
}
