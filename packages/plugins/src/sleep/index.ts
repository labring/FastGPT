type Props = {
  ms: number;
};
type Response = Promise<{
  result: any;
}>;

const main = async ({ ms }: Props): Response => {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
  return {
    result: ms
  };
};

export default main;
