import {
  Box,
  Button,
  Flex,
  ModalBody,
  useDisclosure,
  Switch,
  Textarea,
  HStack
} from '@chakra-ui/react';
import React, { useCallback, useEffect, useMemo } from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { AppScheduledTriggerConfigType } from '@fastgpt/global/core/app/type';
import MyModal from '@fastgpt/web/components/common/MyModal';
import TimezoneSelect from '@fastgpt/web/components/common/MySelect/TimezoneSelect';
import ScheduleTimeSelect, {
  cronString2Label,
  defaultCronString
} from '@fastgpt/web/components/common/MySelect/CronSelector';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';

const ScheduledTriggerConfig = ({
  value,
  onChange
}: {
  value?: AppScheduledTriggerConfigType;
  onChange: (e?: AppScheduledTriggerConfigType) => void;
}) => {
  const { t } = useTranslation();
  const { isOpen, onOpen, onClose } = useDisclosure();

  const timezone = value?.timezone;
  const defaultPrompt = value?.defaultPrompt;
  const isOpenSchedule = value?.cronString !== '';

  const onUpdate = useCallback(
    ({
      cronString,
      timezone,
      defaultPrompt
    }: {
      cronString?: string;
      timezone?: string;
      defaultPrompt?: string;
    }) => {
      onChange({
        cronString: cronString ?? value?.cronString ?? '',
        timezone: timezone ?? value?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
        defaultPrompt: defaultPrompt ?? value?.defaultPrompt ?? ''
      });
    },
    [onChange, value]
  );

  useEffect(() => {
    if (!value?.timezone) {
      onUpdate({ timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
    }
  }, []);

  const Render = useMemo(() => {
    return (
      <>
        <Flex alignItems={'center'}>
          <MyIcon name={'core/app/schedulePlan'} w={'20px'} />
          <HStack ml={2} flex={1} spacing={1}>
            <FormLabel color={'myGray.600'}>{t('common:core.app.Interval timer run')}</FormLabel>
            <QuestionTip label={t('common:core.app.Interval timer tip')} />
          </HStack>
          <MyTooltip label={t('common:core.app.Config schedule plan')}>
            <Button
              variant={'transparentBase'}
              iconSpacing={1}
              size={'sm'}
              mr={'-5px'}
              color={'myGray.600'}
              onClick={onOpen}
            >
              {cronString2Label(value?.cronString ?? '', t)}
            </Button>
          </MyTooltip>
        </Flex>

        <MyModal
          isOpen={isOpen}
          onClose={onClose}
          iconSrc={'core/app/schedulePlan'}
          title={t('common:core.app.Interval timer config')}
          overflow={'unset'}
        >
          <ModalBody>
            <Flex justifyContent={'space-between'} alignItems={'center'}>
              <FormLabel flex={'0 0 80px'}>{t('common:core.app.schedule.Open schedule')}</FormLabel>
              <Switch
                isChecked={isOpenSchedule}
                onChange={(e) => {
                  if (e.target.checked) {
                    onUpdate({ cronString: defaultCronString });
                  } else {
                    onUpdate({ cronString: '' });
                  }
                }}
              />
            </Flex>
            {isOpenSchedule && (
              <>
                <Flex alignItems={'center'} mt={5}>
                  <FormLabel flex={'0 0 80px'}>{t('app:execute_time')}</FormLabel>
                  <Box flex={'1 0 0'}>
                    <ScheduleTimeSelect
                      cronString={value?.cronString}
                      onChange={(e) => {
                        onUpdate({ cronString: e });
                      }}
                    />
                  </Box>
                </Flex>
                <Flex alignItems={'center'} mt={5}>
                  <FormLabel flex={'0 0 80px'}>{t('app:time_zone')}</FormLabel>
                  <Box flex={'1 0 0'}>
                    <TimezoneSelect
                      value={timezone}
                      onChange={(e) => {
                        onUpdate({ timezone: e });
                      }}
                    />
                  </Box>
                </Flex>
                <Box mt={5}>
                  <FormLabel mb={1}>{t('common:core.app.schedule.Default prompt')}</FormLabel>
                  <Textarea
                    value={defaultPrompt}
                    rows={8}
                    bg={'myGray.50'}
                    placeholder={t('common:core.app.schedule.Default prompt placeholder')}
                    onChange={(e) => {
                      onUpdate({ defaultPrompt: e.target.value });
                    }}
                  />
                </Box>
              </>
            )}
          </ModalBody>
        </MyModal>
      </>
    );
  }, [
    defaultPrompt,
    isOpen,
    isOpenSchedule,
    onClose,
    onOpen,
    onUpdate,
    t,
    timezone,
    value?.cronString
  ]);

  return Render;
};

export default React.memo(ScheduledTriggerConfig);
