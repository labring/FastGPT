import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { serviceSideProps } from '@/web/common/utils/i18n';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { Box } from '@chakra-ui/react';
import { TrackEventName } from '@/web/common/system/constants';

function Error() {
  const router = useRouter();
  const { lastRoute } = useSystemStore();

  useEffect(() => {
    setTimeout(() => {
      window.umami?.track(TrackEventName.pageError, {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        appName: navigator.appName,
        lastRoute,
        route: router.asPath
      });
    }, 1000);

    setTimeout(() => {
      router.back();
    }, 2000);
  }, []);

  return (
    <Box whiteSpace={'pre-wrap'}>
      {`出现未捕获的异常。
1. 私有部署用户，90%由于配置文件不正确导致。
2. 部分系统不兼容相关API。大部分是苹果的safari 浏览器导致，可以尝试更换 chrome。 
3. 请关闭浏览器翻译功能，部分翻译导致页面崩溃。

排除3后，打开控制台的 console 查看具体报错信息。
如果提示 xxx undefined 的话，就是配置文件有错误。
`}
    </Box>
  );
}

export async function getServerSideProps(context: any) {
  return {
    props: { ...(await serviceSideProps(context)) }
  };
}

export default Error;
