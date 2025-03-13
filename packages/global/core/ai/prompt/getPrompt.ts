export const getPrompt = ({
  promptMap,
  customPrompt,
  promptAsVersion = false
}: {
  promptMap: Record<string, string>;
  customPrompt?: string;
  promptAsVersion?: boolean;
}) => {
  const defaultVersion = 'v491';

  if (!customPrompt) {
    return promptMap[defaultVersion];
  }

  if (customPrompt in promptMap) {
    return promptMap[customPrompt];
  } else if (promptAsVersion) {
    return promptMap[defaultVersion];
  } else {
    return customPrompt;
  }
};
