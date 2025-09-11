/**
 * 获取技能标签的正则表达式配置
 */
function getSkillRegexConfig(): Readonly<{
  leftChars: string;
  rightChars: string;
  middleChars: string;
}> {
  const leftChars = '{';
  const rightChars = '}';
  const middleChars = '@';

  return {
    leftChars,
    rightChars,
    middleChars
  };
}

/**
 * 生成匹配技能标签的正则表达式字符串
 * 匹配格式：{{@skillKey@}}
 */
export function getSkillRegexString(): string {
  const { leftChars, rightChars, middleChars } = getSkillRegexConfig();

  const hashLeftCharList = `[${leftChars}]`;
  const hashRightCharList = `[${rightChars}]`;
  const hashMiddleCharList = `[${middleChars}]`;

  // 匹配 {{@skillKey@}} 格式
  const skillTag =
    `(${hashLeftCharList})` +
    `(${hashLeftCharList})` +
    `(${hashMiddleCharList})(.*?)(${hashMiddleCharList})` +
    `(${hashRightCharList})(${hashRightCharList})`;

  return skillTag;
}
