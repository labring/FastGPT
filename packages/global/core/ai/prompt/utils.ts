export const getPromptByVersion = (version?: string, promptMap: Record<string, string> = {}) => {
  // 版本号大的在前面
  const versions = Object.keys(promptMap).sort((a, b) => {
    const [majorA, minorA, patchA] = a.split('.').map(Number);
    const [majorB, minorB, patchB] = b.split('.').map(Number);

    if (majorA !== majorB) return majorB - majorA;
    if (minorA !== minorB) return minorB - minorA;
    return patchB - patchA;
  });

  if (!version) {
    return promptMap[versions[0]];
  }

  if (version in promptMap) {
    return promptMap[version];
  }
  return promptMap[versions[0]];
};
