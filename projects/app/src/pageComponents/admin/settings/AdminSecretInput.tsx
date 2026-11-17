import React from 'react';
import SecretValueInput from '@/components/common/secret/SecretValueInput';

type AdminSecretInputProps = Omit<
  React.ComponentProps<typeof SecretValueInput>,
  'value' | 'isConfigured'
> & {
  value?: string;
  isConfigured: boolean;
};

/** 未修改时按服务端状态展示已配置，空字符串则表示用户明确清空。 */
const AdminSecretInput = ({ value, isConfigured, ...props }: AdminSecretInputProps) => (
  <SecretValueInput
    {...props}
    value={value ?? ''}
    isConfigured={isConfigured && value === undefined}
  />
);

export default AdminSecretInput;
