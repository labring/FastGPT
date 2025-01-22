import { downloadFetch } from '@/web/common/system/utils';
import { Button, Flex, ModalBody, ModalFooter } from '@chakra-ui/react';
import { formatTime2YMD } from '@fastgpt/global/common/string/time';
import { UsageSourceEnum, UsageSourceMap } from '@fastgpt/global/support/wallet/usage/constants';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';

export type ExportModalParams = {
  dateStart: Date;
  dateEnd: Date;
  sources: UsageSourceEnum[];
  teamMemberIds: string[];
  teamMemberNames: string[];
  isSelectAllTmb: boolean;
  projectName: string;
};

const ExportModal = ({
  onClose,
  params,
  memberTotal,
  total
}: {
  onClose: () => void;
  params: ExportModalParams;
  memberTotal: number;
  total: number;
}) => {
  const { t } = useTranslation();

  const {
    teamMemberIds,
    teamMemberNames,
    isSelectAllTmb,
    sources,
    dateStart,
    dateEnd,
    projectName
  } = params;

  const { runAsync: exportUsage, loading } = useRequest2(
    async () => {
      const searchParams = new URLSearchParams();
      searchParams.set('dateStart', dateStart.toISOString());
      searchParams.set('dateEnd', dateEnd.toISOString());
      sources.forEach((source) => searchParams.append('sources', source.toString()));
      teamMemberIds.forEach((tmbId) => searchParams.append('teamMemberIds', tmbId));
      searchParams.set('isSelectAllTmb', isSelectAllTmb.toString());
      searchParams.set('projectName', projectName);

      await downloadFetch({
        url: `/api/proApi/support/wallet/usage/exportUsage?${searchParams}`,
        filename: `usage.csv`
      });
    },
    {
      successToast: t('account_usage:start_export')
    }
  );

  return (
    <MyModal title={t('account_usage:export_confirm')} iconSrc="export" iconColor={'primary.600'}>
      <ModalBody>
        <Flex mb={4}>{t('account_usage:current_filter_conditions')}</Flex>
        <Flex>
          {`${t('common:user.Time')}: ${formatTime2YMD(dateStart)} ~ ${formatTime2YMD(dateEnd)}`}
        </Flex>
        <Flex>{`${t('common:user.team.Member')}(${memberTotal}): ${teamMemberNames.join(', ')}`}</Flex>
        <Flex>
          {`${t('common:user.type')}: ${sources.map((item) => t(UsageSourceMap[item].label as any)).join(', ')}`}
        </Flex>
        <Flex>{`${t('common:user.Application Name')}: ${projectName}`}</Flex>
        <Flex mt={4}>{t('account_usage:confirm_export', { total })}</Flex>
      </ModalBody>
      <ModalFooter gap={2}>
        <Button variant={'whiteBase'} onClick={onClose}>
          {t('common:common.Cancel')}
        </Button>
        <Button onClick={exportUsage} isLoading={loading}>
          {t('common:Export')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default ExportModal;
