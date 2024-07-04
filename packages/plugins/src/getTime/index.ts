type Props = {
  time: string;
};
type Response = Promise<{
  time: string;
}>;

const main = async ({ time }: Props): Response => {
  return {
    time
  };
};

export default main;
