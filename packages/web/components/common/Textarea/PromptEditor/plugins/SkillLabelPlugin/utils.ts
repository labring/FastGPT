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

export function getSkillRegexString(): string {
  const { leftChars, rightChars, middleChars } = getSkillRegexConfig();

  const hashLeftCharList = `[${leftChars}]`;
  const hashRightCharList = `[${rightChars}]`;
  const hashMiddleCharList = `[${middleChars}]`;

  const skillTag =
    `(${hashLeftCharList})` +
    `(${hashLeftCharList})` +
    `(${hashMiddleCharList})(.*?)(${hashMiddleCharList})` +
    `(${hashRightCharList})(${hashRightCharList})`;

  return skillTag;
}
