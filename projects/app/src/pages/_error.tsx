import { useRouter } from 'next/router';
import { serviceSideProps } from '@/web/common/i18n/utils';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { Box } from '@chakra-ui/react';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { webPushTrack } from '@/web/common/middle/tracks/utils';
import { useTranslation } from 'next-i18next';
import { errorLogger } from '@/web/common/utils/errorLogger';
import { useMount } from 'ahooks';
import type { I18nStringType } from '@fastgpt/global/common/i18n/type';

const errorText: I18nStringType = {
  'zh-CN':
    '出现未捕获的异常。\n1. 私有部署用户，90%是由于模型配置不正确/模型未启用导致。\n2. 部分系统不兼容相关API。大部分是苹果的safari 浏览器导致，可以尝试更换 chrome。\n3. 请关闭浏览器翻译功能，部分翻译导致页面崩溃。\n\n排除3后，打开控制台的 console 查看具体报错信息。\n如果提示 xxx undefined 的话，就是模型配置不正确，检查：\n1. 请确保系统内每个系列模型至少有一个可用，可以在【账号-模型提供商】中检查。\n2. 请确保至少有一个知识库文件处理模型（语言模型中有一个开关），否则知识库创建会报错。\n2. 检查模型中一些“对象”参数是否异常（数组和对象），如果为空，可以尝试给个空数组或空对象。',
  en: `An uncaught exception occurred.\n\n1. For private deployment users, 90% of cases are caused by incorrect model configuration/model not enabled. \n.\n\n2. Some systems are not compatible with related APIs. \nMost of the time it's caused by Apple's Safari browser, you can try changing it to Chrome.\n\n3. Please turn off the browser translation function. Some translations may cause the page to crash.\n\n\nAfter eliminating 3, open the console to view the specific error information.\n\nIf it prompts xxx undefined, the model configuration is incorrect. Check:\n\n1. Please ensure that at least one model of each series is available in the system, which can be checked in [Account - Model Provider].\n\n2. Please ensure that there is at least one knowledge base file processing model (there is a switch in the language model), otherwise an error will be reported when creating the knowledge base.\n\n2. Check whether some \"object\" parameters in the model are abnormal (arrays and objects). If they are empty, you can try to give an empty array or empty object.`,
  'zh-Hant':
    '出現未捕獲的異常。\n\n1. 私有部署用戶，90%是由於模型配置不正確/模型未啟用導致。 \n。\n\n2. 部分系統不兼容相關API。\n大部分是蘋果的safari 瀏覽器導致，可以嘗試更換 chrome。\n\n3. 請關閉瀏覽器翻譯功能，部分翻譯導致頁面崩潰。\n\n\n排除3後，打開控制台的 console 查看具體報錯信息。\n\n如果提示 xxx undefined 的話，就是模型配置不正確，檢查：\n1. 請確保系統內每個系列模型至少有一個可用，可以在【賬號-模型提供商】中檢查。\n\n2. 請確保至少有一個知識庫文件處理模型（語言模型中有一個開關），否則知識庫創建會報錯。\n\n2. 檢查模型中一些“對象”參數是否異常（數組和對象），如果為空，可以嘗試給個空數組或空對象。'
};

function Error() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const router = useRouter();
  const { toast } = useToast();
  const { lastRoute, llmModelList, embeddingModelList } = useSystemStore();

  useMount(() => {
    // Send track
    webPushTrack.clientError({
      route: lastRoute,
      log: errorLogger.getLogs()
    });

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
        router.push('/dashboard/agent');
      }
    }, 2000);
  });

  return <Box whiteSpace={'pre-wrap'}>{errorText[lang as keyof typeof errorText]}</Box>;
}

export async function getServerSideProps(context: any) {
  return {
    props: { ...(await serviceSideProps(context)) }
  };
}

export default Error;
