export const getWorkerPath = (name: string) => {
  // @ts-ignore
  const isSubModule = !!global?.systemConfig;

  const isProd = process.env.NODE_ENV === 'production';
  return isProd
    ? `/app/worker/${name}.js`
    : `../../${isSubModule ? 'FastGPT/' : ''}/worker/${name}.js`;
};
