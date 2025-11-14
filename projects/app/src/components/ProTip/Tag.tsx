import React from 'react';
import { useTranslation } from 'next-i18next';
import MyImage from '@fastgpt/web/components/common/Image/MyImage';
import { useSystemStore } from '@/web/common/system/useSystemStore';

const LangMap: Record<string, string> = {
  'zh-CN': '/imgs/proTag.svg',
  en: '/imgs/proTagEng.svg'
};

const ProTag = () => {
  const { i18n } = useTranslation();
  const { feConfigs } = useSystemStore();

  return feConfigs?.isPlus ? null : <MyImage src={LangMap[i18n.language]} />;
};

export default ProTag;
