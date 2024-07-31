function getHashtagRegexVariableLabels(): Readonly<{
  leftChars: string;
  rightChars: string;
  middleChars: string;
}> {
  const leftChars = '{';
  const rightChars = '}';
  const middleChars = '$';

  return {
    leftChars,
    rightChars,
    middleChars
  };
}

export function getHashtagRegexString(): string {
  const { leftChars, rightChars, middleChars } = getHashtagRegexVariableLabels();

  const hashLeftCharList = `[${leftChars}]`;
  const hashRightCharList = `[${rightChars}]`;
  const hashMiddleCharList = `[${middleChars}]`;

  // A hashtag contains characters, numbers and underscores,
  // but not all numbers.
  const hashtag =
    `(${hashLeftCharList})` +
    `(${hashLeftCharList})` +
    `(${hashMiddleCharList})(.*?)(${hashMiddleCharList})` +
    `(${hashRightCharList})(${hashRightCharList})`;

  return hashtag;
}
