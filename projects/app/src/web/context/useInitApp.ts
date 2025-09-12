import { useEffect, useState } from 'react';
import { clientInitData } from '@/web/common/system/staticData';
import { useRouter } from 'next/router';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import type { FastGPTFeConfigsType } from '@fastgpt/global/common/system/types/index.d';
import { useMemoizedFn, useMount } from 'ahooks';
import { TrackEventName } from '../common/system/constants';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useUserStore } from '../support/user/useUserStore';
import {
  setBdVId,
  setFastGPTSem,
  setInviterId,
  setMsclkid,
  setSourceDomain,
  setUtmParams,
  setUtmWorkflow
} from '../support/marketing/utils';
import { type ShortUrlParams } from '@fastgpt/global/support/marketing/type';
import { setCouponCode } from '@/web/support/marketing/utils';

type MarketingQueryParams = {
  hiId?: string;
  bd_vid?: string;
  msclkid?: string;
  k?: string;
  search?: string;
  sourceDomain?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_content?: string;
  utm_workflow?: string;
  couponCode?: string;
};

const MARKETING_PARAMS: (keyof MarketingQueryParams)[] = [
  'hiId',
  'bd_vid',
  'msclkid',
  'k',
  'sourceDomain',
  'utm_source',
  'utm_medium',
  'utm_content',
  'utm_workflow',
  'couponCode'
];

export const useInitApp = () => {
  const router = useRouter();
  const {
    hiId,
    bd_vid,
    msclkid,
    k,
    search,
    sourceDomain,
    utm_source,
    utm_medium,
    utm_content,
    utm_workflow,
    couponCode
  } = router.query as MarketingQueryParams;

  const { loadGitStar, setInitd, feConfigs } = useSystemStore();
  const { userInfo } = useUserStore();
  const [scripts, setScripts] = useState<FastGPTFeConfigsType['scripts']>([]);
  const [title, setTitle] = useState(process.env.SYSTEM_NAME || 'AI');

  const getPathWithoutMarketingParams = () => {
    const filteredQuery = { ...router.query };
    MARKETING_PARAMS.forEach((param) => {
      delete filteredQuery[param];
    });

    const newQuery = new URLSearchParams();
    Object.entries(filteredQuery).forEach(([key, value]) => {
      if (value) {
        if (Array.isArray(value)) {
          value.forEach((v) => newQuery.append(key, v));
        } else {
          newQuery.append(key, value);
        }
      }
    });

    return `${router.pathname}${newQuery.toString() ? `?${newQuery.toString()}` : ''}`;
  };

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

  // Marketing data track
  useMount(() => {
    setInviterId(hiId);
    setBdVId(bd_vid);
    setMsclkid(msclkid);
    setUtmWorkflow(utm_workflow);
    setSourceDomain(sourceDomain);

    const utmParams: ShortUrlParams = {
      ...(utm_source && { shortUrlSource: utm_source }),
      ...(utm_medium && { shortUrlMedium: utm_medium }),
      ...(utm_content && { shortUrlContent: utm_content })
    };
    if (utm_workflow) {
      setUtmParams(utmParams);
    }
    setFastGPTSem({ keyword: k, search, ...utmParams });

    if (couponCode) {
      setCouponCode(couponCode);
    }

    const newPath = getPathWithoutMarketingParams();
    router.replace(newPath);
  });

  return {
    feConfigs,
    scripts,
    title
  };
};
