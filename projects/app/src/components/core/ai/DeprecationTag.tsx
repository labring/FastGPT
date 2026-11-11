import MyTag from '@fastgpt/web/components/common/Tag';
import { useTranslation } from 'next-i18next';
import React from 'react';

const DeprecationTag = ({ size = 'md' }: { size?: 'sm' | 'md' }) => {
  const { t } = useTranslation();
  const sizeProps = size === 'sm' ? { fontSize: '10px', px: '8px', py: '4px' } : {};

  return (
    <MyTag type={'fill'} colorSchema={'lightRed'} {...sizeProps}>
      {t('common:model.upcoming_deprecation')}
    </MyTag>
  );
};

export default React.memo(DeprecationTag);
