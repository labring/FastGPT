import {
  type ShortUrlParams,
  type TrackRegisterParams
} from '@fastgpt/global/support/marketing/type';

export const getInviterId = () => {
  return localStorage.getItem('inviterId') || undefined;
};
export const setInviterId = (inviterId?: string) => {
  if (!inviterId) return;
  localStorage.setItem('inviterId', inviterId);
};
export const removeInviterId = () => {
  localStorage.removeItem('inviterId');
};

export const getBdVId = () => {
  return sessionStorage.getItem('bd_vid') || undefined;
};
export const setBdVId = (bdVid?: string) => {
  if (!bdVid) return;
  sessionStorage.setItem('bd_vid', bdVid);
};

export const getMsclkid = () => {
  return sessionStorage.getItem('msclkid') || undefined;
};
export const setMsclkid = (msclkid?: string) => {
  if (!msclkid) return;
  sessionStorage.setItem('msclkid', msclkid);
};

export const getUtmWorkflow = () => {
  return localStorage.getItem('utm_workflow') || undefined;
};
export const setUtmWorkflow = (utmWorkflow?: string) => {
  if (!utmWorkflow) return;
  localStorage.setItem('utm_workflow', utmWorkflow);
};
export const removeUtmWorkflow = () => {
  localStorage.removeItem('utm_workflow');
};

export const getUtmParams = () => {
  try {
    const params = JSON.parse(localStorage.getItem('utm_params') || '{}');
    return params as ShortUrlParams;
  } catch (error) {
    return {} as ShortUrlParams;
  }
};
export const setUtmParams = (utmParams?: ShortUrlParams) => {
  if (!utmParams || Object.keys(utmParams).length === 0) return;
  localStorage.setItem('utm_params', JSON.stringify(utmParams));
};
export const removeUtmParams = () => {
  localStorage.removeItem('utm_params');
};

export const getFastGPTSem = () => {
  try {
    return localStorage.getItem('fastgpt_sem')
      ? JSON.parse(localStorage.getItem('fastgpt_sem')!)
      : undefined;
  } catch {
    return undefined;
  }
};
export const setFastGPTSem = (fastgptSem?: TrackRegisterParams['fastgpt_sem']) => {
  if (!fastgptSem) return;

  const validEntries = Object.entries(fastgptSem).filter(([_, value]) => !!value);
  if (validEntries.length === 0) return;

  localStorage.setItem('fastgpt_sem', JSON.stringify(fastgptSem));
};
export const removeFastGPTSem = () => {
  localStorage.removeItem('fastgpt_sem');
};

export const getSourceDomain = () => {
  return sessionStorage.getItem('sourceDomain') || undefined;
};
export const setSourceDomain = (sourceDomain?: string) => {
  const formatSourceDomain = (() => {
    if (sourceDomain) return sourceDomain;
    return document.referrer;
  })();

  if (!formatSourceDomain || getSourceDomain()) return;
  sessionStorage.setItem('sourceDomain', formatSourceDomain);
};

export const setCouponCode = (couponCode?: string) => {
  if (!couponCode) return;
  localStorage.setItem('couponCode', couponCode);
};

export const getCouponCode = () => {
  return localStorage.getItem('couponCode') || undefined;
};

export const removeCouponCode = () => {
  localStorage.removeItem('couponCode');
};
