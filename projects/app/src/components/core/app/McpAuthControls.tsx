import { Flex, Switch } from '@chakra-ui/react';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import { useTranslation } from 'next-i18next';
import type {
  McpOAuthAuthMode,
  McpOAuthClientMode
} from '@fastgpt/global/core/app/tool/mcpTool/oauth';

export function McpAuthTabs({
  value,
  onChange
}: {
  value: McpOAuthAuthMode;
  onChange: (value: McpOAuthAuthMode) => void;
}) {
  const { t } = useTranslation();
  return (
    <FillRowTabs<McpOAuthAuthMode>
      w="full"
      size="sm"
      value={value}
      onChange={onChange}
      list={[
        { label: 'OAuth 2', value: 'oauth' },
        { label: t('mcpOAuth.auth_mode_headers'), value: 'headers' }
      ]}
    />
  );
}

export function McpRegistrationSwitch({
  value,
  onChange
}: {
  value: McpOAuthClientMode;
  onChange: (value: McpOAuthClientMode) => void;
}) {
  const { t } = useTranslation();
  return (
    <Flex as="label" align="center" gap={3} fontSize="sm" cursor="pointer">
      {t('mcpOAuth.auto_registration')}
      <Switch
        isChecked={value === 'auto'}
        onChange={(event) => onChange(event.target.checked ? 'auto' : 'manual')}
      />
    </Flex>
  );
}
