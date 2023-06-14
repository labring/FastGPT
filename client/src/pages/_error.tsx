function Error({ errStr }: { errStr: string }) {
  return <p>{errStr}</p>;
}

Error.getInitialProps = ({ res, err }: { res: any; err: any }) => {
  console.log(err);
  return {
    errStr: `部分系统不兼容，导致页面崩溃。如果可以，请联系作者，反馈下具体操作和页面。大部分是 苹果 的 safari 浏览器导致，可以尝试更换 chrome 浏览器。`
  };
};

export default Error;
