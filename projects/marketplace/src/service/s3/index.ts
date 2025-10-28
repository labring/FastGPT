const S3Prefix = process.env.S3_PREFIX;

export const getPkgdownloadURL = (toolId: string) => {
  return S3Prefix + '/' + toolId + '.pkg';
};
