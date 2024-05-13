import { useEffect, useState } from 'react';
import { clientInitData } from '@/web/common/system/staticData';
import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import type { FastGPTFeConfigsType } from '@fastgpt/global/common/system/types/index.d';
import { change2DefaultLng, setLngStore } from '@/web/common/utils/i18n';
import { useMemoizedFn, useMount } from 'ahooks';
import { TrackEventName } from '../common/system/constants';

export const useInitApp = () => {
  const router = useRouter();
  const { hiId } = router.query as { hiId?: string };
  const { i18n } = useTranslation();
  const { loadGitStar, setInitd, feConfigs } = useSystemStore();
  const [scripts, setScripts] = useState<FastGPTFeConfigsType['scripts']>([]);
  const [title, setTitle] = useState(process.env.SYSTEM_NAME || 'AI');

  const initFetch = useMemoizedFn(async () => {
    const {
      feConfigs: { scripts, isPlus, show_git, systemTitle }
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
    if (show_git) {
      loadGitStar();
    }

    setScripts(scripts || []);
    setInitd();
  });

  const initUserLanguage = useMemoizedFn(() => {
    // get default language
    const targetLng = change2DefaultLng(i18n.language);
    if (targetLng) {
      setLngStore(targetLng);
      router.replace(router.asPath, undefined, { locale: targetLng });
    }
  });

  useMount(() => {
    initFetch();
    initUserLanguage();

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

  useEffect(() => {
    hiId && localStorage.setItem('inviterId', hiId);
  }, [hiId]);

  return {
    feConfigs,
    scripts,
    title
  };
};
