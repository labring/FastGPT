import { useEffect, useRef } from 'react';
import { clientInitData } from '@/web/common/system/staticData';
import { useRouter } from 'next/router';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useMemoizedFn, useMount } from 'ahooks';
import { TrackEventName } from '../common/system/constants';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useUserStore } from '../support/user/useUserStore';
import { getInitDataPage } from '@fastgpt/global/common/system/initData';
import {
  setBdVId,
  setFastGPTSem,
  initFastGPTSemSourceDomain,
  setMsclkid,
  setUtmParams,
  setUtmWorkflow
} from '../support/marketing/utils';
import { type ShortUrlParams } from '@fastgpt/global/support/marketing/type';
import { setCouponCode } from '@/web/support/marketing/utils';
import { appClientEnv } from '@/web/common/system/env';

type MarketingQueryParams = {
  bd_vid?: string;
  msclkid?: string;
  k?: string;
  search?: string;
  visitor_id?: string;
  sourceDomain?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_content?: string;
  utm_workflow?: string;
  couponCode?: string;
};

const MARKETING_PARAMS: (keyof MarketingQueryParams)[] = [
  'bd_vid',
  'msclkid',
  'k',
  'visitor_id',
  'sourceDomain',
  'utm_source',
  'utm_medium',
  'utm_content',
  'utm_workflow',
  'couponCode'
];

/** 首屏直接初始化；匿名跨页面类别补取白名单，身份变化由成功回调主动刷新。 */
export const useInitApp = () => {
  const router = useRouter();

  const {
    loadGitStar,
    setInitd,
    feConfigs,
    authenticatedConfigGeneration,
    initDataPage: loadedPage
  } = useSystemStore();
  const initDataPage = getInitDataPage(router.pathname);

  const getPathWithoutMarketingParams = useMemoizedFn(() => {
    const filteredQuery = { ...router.query };
    const hasMarketingParams = MARKETING_PARAMS.some((param) =>
      Object.prototype.hasOwnProperty.call(filteredQuery, param)
    );

    if (!hasMarketingParams) {
      return;
    }

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

    return `${router.pathname}${newQuery.toString() ? `?${newQuery.toString()}` : ''}${
      window.location.hash
    }`;
  });

  const initFetch = useMemoizedFn(async () => {
    const {
      feConfigs: { isPlus }
    } = await clientInitData(3, router.pathname);

    // log fastgpt
    if (!isPlus) {
      console.log(
        '%cWelcome to FastGPT',
        'font-family:Arial; color:#3370ff ; font-size:18px; font-weight:bold;',
        `GitHub：https://github.com/labring/FastGPT`
      );
    }

    setInitd();
  });

  // 主动登录刷新同样会更新配置；GitHub 展示开关改变时补取数量，不触发初始化请求。
  useEffect(() => {
    void loadGitStar();
  }, [feConfigs.show_git, loadGitStar]);

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

  const initRequest = useRequest(initFetch, {
    // 匿名页面切换配置类别时重新投影；相同类别内的导航不重复请求。
    refreshDeps: [initDataPage],
    refreshDepsAction: () => {
      // 登录配置覆盖所有页面；显式成功回调已经更新配置时也不重复请求。
      if (
        authenticatedConfigGeneration === useUserStore.getState().authGeneration ||
        loadedPage === initDataPage
      )
        return;
      initRequest.refresh();
    },
    manual: false
  });

  // Marketing data track
  const hasInitedMarketingRef = useRef(false);

  useEffect(() => {
    // CSR 挂载前由应用壳恢复 query；SSR 聊天页由 getServerSideProps 提供 query。
    if (hasInitedMarketingRef.current) return;
    hasInitedMarketingRef.current = true;

    const query = router.query as MarketingQueryParams;
    const {
      bd_vid,
      msclkid,
      k,
      search,
      visitor_id,
      sourceDomain,
      utm_source,
      utm_medium,
      utm_content,
      utm_workflow,
      couponCode
    } = query;

    if (bd_vid) setBdVId(bd_vid);
    if (msclkid) setMsclkid(msclkid);
    if (utm_workflow) setUtmWorkflow(utm_workflow);
    // 未显式携带来源时仍读取 document.referrer，并锁定本次首次归因。
    initFastGPTSemSourceDomain(sourceDomain);

    const utmParams: ShortUrlParams = {
      ...(utm_source && { shortUrlSource: utm_source }),
      ...(utm_medium && { shortUrlMedium: utm_medium }),
      ...(utm_content && { shortUrlContent: utm_content })
    };
    if (utm_workflow) {
      setUtmParams(utmParams);
    }

    setFastGPTSem({
      keyword: k,
      search,
      visitor_id,
      ...utmParams
    });

    if (couponCode) {
      setCouponCode(couponCode);
    }

    const newPath = getPathWithoutMarketingParams();
    if (newPath) {
      router.replace(newPath);
    }
  }, [router, getPathWithoutMarketingParams]);

  return {
    feConfigs,
    scripts: feConfigs.scripts ?? [],
    title: feConfigs.systemTitle || appClientEnv.systemName
  };
};
