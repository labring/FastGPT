import { useEffect, useState } from 'react';
import { clientInitData } from '@/web/common/system/staticData';
import { useRouter } from 'next/router';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import type { FastGPTFeConfigsType } from '@fastgpt/global/common/system/types/index.d';
import { useMemoizedFn, useMount } from 'ahooks';
import { TrackEventName } from '../common/system/constants';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useUserStore } from '../support/user/useUserStore';

export const useInitApp = () => {
  const router = useRouter();
  const { hiId, bd_vid, k, sourceDomain, utm_source, utm_medium, utm_content, utm_workflow } =
    router.query as {
      hiId?: string;
      bd_vid?: string;
      k?: string;
      sourceDomain?: string;
      utm_source?: string;
      utm_medium?: string;
      utm_content?: string;
      utm_workflow?: string;
    };
  const { loadGitStar, setInitd, feConfigs } = useSystemStore();
  const { userInfo } = useUserStore();
  const [scripts, setScripts] = useState<FastGPTFeConfigsType['scripts']>([]);
  const [title, setTitle] = useState(process.env.SYSTEM_NAME || 'AI');

  const initFetch = useMemoizedFn(async () => {
    const {
      feConfigs: { scripts, isPlus, systemTitle }
    } = await clientInitData();

    setTitle(systemTitle || 'FastGPT');

    // log fastgpt
    if (!isPlus) {
      console.log(
        '%cWelcome to FastGPT',
        'font-family:Arial; color:#3370ff ; font-size:18px; font-weight:bold;',
        `GitHub：https://github.com/labring/FastGPT`
      );
    }

    loadGitStar();

    setScripts(scripts || []);
    setInitd();
  });

  useMount(() => {
    const errorTrack = (event: ErrorEvent) => {
      window.umami?.track(TrackEventName.windowError, {
        device: {
          userAgent: navigator.userAgent,
          platform: navigator.platform,
          appName: navigator.appName
        },
        error: event,
        url: location.href
      });
    };
    // add window error track
    window.addEventListener('error', errorTrack);

    return () => {
      window.removeEventListener('error', errorTrack);
    };
  });

  useRequest2(initFetch, {
    refreshDeps: [userInfo?.username],
    manual: false,
    pollingInterval: 300000 // 5 minutes refresh
  });

  useEffect(() => {
    const isBrowser = typeof window !== 'undefined';
    if (!isBrowser) return;

    hiId && localStorage.setItem('inviterId', hiId);
    bd_vid && sessionStorage.setItem('bd_vid', bd_vid);
    k && sessionStorage.setItem('fastgpt_sem', JSON.stringify({ keyword: k }));
    utm_workflow && sessionStorage.setItem('utm_workflow', utm_workflow);

    try {
      const utmParams: Record<string, any> = {};
      if (utm_source) utmParams.source = utm_source;
      if (utm_medium) utmParams.medium = utm_medium;
      if (utm_content) utmParams.content = utm_content;

      if (Object.keys(utmParams).length > 0) {
        sessionStorage.setItem('utm_params', JSON.stringify(utmParams));
      }

      const existingSem = sessionStorage.getItem('fastgpt_sem')
        ? JSON.parse(sessionStorage.getItem('fastgpt_sem')!)
        : {};

      const newSem = {
        ...existingSem,
        ...utmParams
      };

      if (Object.keys(newSem).length > 0) {
        sessionStorage.setItem('fastgpt_sem', JSON.stringify(newSem));
      }
    } catch (error) {
      console.error('处理UTM参数出错:', error);
    }

    const formatSourceDomain = (() => {
      if (sourceDomain) return sourceDomain;
      return document.referrer;
    })();

    if (formatSourceDomain && !sessionStorage.getItem('sourceDomain')) {
      sessionStorage.setItem('sourceDomain', formatSourceDomain);
    }
  }, [bd_vid, hiId, k, utm_content, utm_medium, utm_source, utm_workflow, sourceDomain]);

  return {
    feConfigs,
    scripts,
    title
  };
};
