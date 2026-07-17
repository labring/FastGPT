const DEFAULT_FASTGPT_HOME_ORIGIN = 'https://fastgpt.io';

export const DOCS_UTM_CAMPAIGNS = {
  gettingStarted: 'docs_getting_started',
  cloudIntro: 'docs_cloud_intro',
  cloudFaq: 'docs_cloud_faq',
  selfHostDev: 'docs_self_host_dev'
} as const;

export type DocsUtmCampaign = (typeof DOCS_UTM_CAMPAIGNS)[keyof typeof DOCS_UTM_CAMPAIGNS];
export type FastGPTSite = 'configured' | 'cn' | 'io';

const normalizeOrigin = (value?: string): string => {
  try {
    return new URL(value || DEFAULT_FASTGPT_HOME_ORIGIN).origin;
  } catch {
    return DEFAULT_FASTGPT_HOME_ORIGIN;
  }
};

export const getFastGPTHomeOrigin = (): string =>
  normalizeOrigin(
    process.env.NEXT_PUBLIC_FASTGPT_HOME_DOMAIN || process.env.FASTGPT_HOME_DOMAIN
  );

export const getFastGPTDocsOrigin = (): string => {
  const homeUrl = new URL(getFastGPTHomeOrigin());
  homeUrl.hostname = `doc.${homeUrl.hostname}`;
  return homeUrl.origin;
};

export const buildFastGPTHomeUrl = ({
  campaign,
  content,
  site = 'configured'
}: {
  campaign: DocsUtmCampaign;
  content: string;
  site?: FastGPTSite;
}): string => {
  const origin =
    site === 'cn'
      ? 'https://fastgpt.cn'
      : site === 'io'
        ? 'https://fastgpt.io'
        : getFastGPTHomeOrigin();
  const url = new URL('/', origin);

  url.searchParams.set('utm_source', 'docs');
  url.searchParams.set('utm_medium', 'referral');
  url.searchParams.set('utm_campaign', campaign);
  url.searchParams.set('utm_content', content);

  return url.toString();
};
