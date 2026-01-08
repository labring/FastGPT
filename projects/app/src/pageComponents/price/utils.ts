import { useTranslation } from 'next-i18next';

export const formatActivityExpirationTime = (date?: Date) => {
  const { t } = useTranslation();
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
    text: t('common:support.wallet.subscription.Activity expiration time', {
      year,
      month,
      day,
      hour,
      minute
    })
  };
};
