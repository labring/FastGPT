export const getWorkerPath = (name: string) => {
  console.log(__dirname);

  const isProd = process.env.NODE_ENV === 'production';
  return isProd
    ? `/app/worker/${name}.js`
    : `${__dirname}/../../../../../../../../worker/${name}.js`;
};
