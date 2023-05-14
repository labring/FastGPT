function Error({ errStr }: { errStr: string }) {
  return <p>{errStr}</p>;
}

Error.getInitialProps = ({ res, err }: { res: any; err: any }) => {
  console.log(err);
  return { errStr: JSON.stringify(err) };
};

export default Error;
