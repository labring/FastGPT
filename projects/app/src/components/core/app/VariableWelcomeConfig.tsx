import { Box, Button, Flex, Input, Select, Textarea } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import type { AppWelcomeConfigType } from '@fastgpt/global/core/app/type';
import type { VariableItemType } from '@fastgpt/global/core/app/variable/type';
import { canMatchWelcomeVariable } from '@fastgpt/global/common/app/chat';

type Rule = NonNullable<AppWelcomeConfigType['byVariable']>;

/** 为一个已声明的会话变量配置按值匹配的开场白。 */
export default function VariableWelcomeConfig({
  variables = [],
  rule,
  onChange
}: {
  variables?: VariableItemType[];
  rule?: Rule;
  onChange: (rule?: Rule) => void;
}) {
  const { t } = useTranslation();
  const choices = variables.filter(canMatchWelcomeVariable);
  if (!choices.length && !rule) return null;

  const updateCase = (index: number, patch: Partial<Rule['cases'][number]>) => {
    if (rule)
      onChange({
        ...rule,
        cases: rule.cases.map((item, i) => (i === index ? { ...item, ...patch } : item))
      });
  };
  return (
    <Box mb={3}>
      <Select
        size="sm"
        aria-label={t('workflow:welcome_variable')}
        placeholder={t('workflow:welcome_variable')}
        value={rule?.key ?? ''}
        onChange={(e) =>
          onChange(
            e.target.value
              ? { key: e.target.value, cases: rule?.cases ?? [{ value: '', text: '' }] }
              : undefined
          )
        }
      >
        {rule && !choices.some((item) => item.key === rule.key) && (
          <option value={rule.key} disabled>
            {rule.key}
          </option>
        )}
        {choices.map((item) => (
          <option key={item.key} value={item.key}>
            {item.label}
          </option>
        ))}
      </Select>
      {rule && (
        <>
          {rule.cases.map((item, index) => (
            <Box key={index} mt={2}>
              <Flex gap={2} mb={1}>
                <Input
                  size="sm"
                  aria-label={t('workflow:welcome_match_value')}
                  placeholder={t('workflow:welcome_match_value')}
                  value={item.value}
                  onChange={(e) => updateCase(index, { value: e.target.value })}
                />
                <Button
                  size="sm"
                  onClick={() =>
                    onChange({ ...rule, cases: rule.cases.filter((_, i) => i !== index) })
                  }
                >
                  {t('common:Delete')}
                </Button>
              </Flex>
              <Textarea
                size="sm"
                aria-label={t('workflow:welcome_match_text')}
                placeholder={t('workflow:welcome_match_text')}
                value={item.text}
                onChange={(e) => updateCase(index, { text: e.target.value })}
              />
            </Box>
          ))}
          <Button
            mt={2}
            size="sm"
            onClick={() => onChange({ ...rule, cases: [...rule.cases, { value: '', text: '' }] })}
          >
            {t('workflow:add_welcome_case')}
          </Button>
        </>
      )}
    </Box>
  );
}
