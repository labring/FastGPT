import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';

export const formatActivityExpirationTime = (date?: Date) => {
  const { t } = useSafeTranslation();
  if (!date) {
    return {
      text: ''
    };
  }

  const formatDate = new Date(date);
  const year = formatDate.getFullYear();
  const month = formatDate.getMonth() + 1;
  const day = formatDate.getDate();
  const hour = formatDate.getHours().toString().padStart(2, '0');
  const minute = formatDate.getMinutes().toString().padStart(2, '0');
  return {
    text: t('price:support.wallet.subscription.Activity expiration time', {
      year,
      month,
      day,
      hour,
      minute
    })
  };
};
