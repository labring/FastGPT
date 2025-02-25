import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { serviceSideProps } from '@fastgpt/web/common/system/nextjs';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { Box } from '@chakra-ui/react';
import { TrackEventName } from '@/web/common/system/constants';
import { useToast } from '@fastgpt/web/hooks/useToast';

function Error() {
  const router = useRouter();
  const { toast } = useToast();
  const { lastRoute, llmModelList, embeddingModelList } = useSystemStore();

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

    let modelError = false;
    if (llmModelList.length === 0) {
      modelError = true;
      toast({
        title: '未配置语言模型',
        status: 'error'
      });
    } else if (!llmModelList.some((item) => item.datasetProcess)) {
      modelError = true;
      toast({
        title: '未配置知识库文件处理模型',
        status: 'error'
      });
    }
    if (embeddingModelList.length === 0) {
      modelError = true;
      toast({
        title: '未配置索引模型',
        status: 'error'
      });
    }

    setTimeout(() => {
      if (modelError) {
        router.push('/account/model');
      } else {
        router.push('/app/list');
      }
    }, 2000);
  }, []);

  return (
    <Box whiteSpace={'pre-wrap'}>
      {`出现未捕获的异常。
1. 私有部署用户，90%是由于模型配置不正确/模型未启用导致。。
2. 部分系统不兼容相关API。大部分是苹果的safari 浏览器导致，可以尝试更换 chrome。 
3. 请关闭浏览器翻译功能，部分翻译导致页面崩溃。

排除3后，打开控制台的 console 查看具体报错信息。
如果提示 xxx undefined 的话，就是模型配置不正确，检查：
1. 请确保系统内每个系列模型至少有一个可用，可以在【账号-模型提供商】中检查。
2. 请确保至少有一个知识库文件处理模型（语言模型中有一个开关），否则知识库创建会报错。
2. 检查模型中一些“对象”参数是否异常（数组和对象），如果为空，可以尝试给个空数组或空对象。
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
