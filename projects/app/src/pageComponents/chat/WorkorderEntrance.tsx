import { Button } from '@chakra-ui/react';
import { getWorkorderURL } from '@/web/common/workorder/api';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';

function WorkorderEntrance() {
  const { t } = useTranslation();

  const { runAsync: onFeedback } = useRequest2(getWorkorderURL, {
    manual: true,
    onSuccess(data) {
      if (data) {
        window.open(data.redirectUrl);
      }
    }
  });

  return (
    <Button variant={'primaryOutline'} w={'100%'} mb={2} onClick={onFeedback}>
      {t('common:question_feedback')}
    </Button>
  );
}

export default WorkorderEntrance;
