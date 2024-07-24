function getHashtagRegexStringChars(): Readonly<{
  leftChars: string;
  rightChars: string;
}> {
  const leftChars = '{';
  const rightChars = '}';

  return {
    leftChars,
    rightChars
  };
}

export function getHashtagRegexString(): string {
  const { leftChars, rightChars } = getHashtagRegexStringChars();

  const hashLeftCharList = `[${leftChars}]`;
  const hashRightCharList = `[${rightChars}]`;

  const hashtag =
    `(${hashLeftCharList})` +
    `(${hashLeftCharList})([a-zA-Z0-9_]{0,29}` +
    `)(${hashRightCharList})(${hashRightCharList})`;

  return hashtag;
}
