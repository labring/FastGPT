import { serviceSideProps } from '@/web/common/utils/i18n';

function Error() {
  return (
    <p>
      部分系统不兼容，导致页面崩溃。如果可以，请联系作者，反馈下具体操作和页面。 大部分是 苹果 的
      safari 浏览器导致，可以尝试更换 chrome
      浏览器。或者是因为开了中文翻译导致，请检查并关闭中文翻译。
    </p>
  );
}

export async function getServerSideProps(context: any) {
  return {
    props: { ...(await serviceSideProps(context)) }
  };
}

export default Error;
