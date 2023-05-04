export const ClaudeSliceTextByToken = ({ text, length }: { text: string; length: number }) => {
  return text.slice(0, length);
};
