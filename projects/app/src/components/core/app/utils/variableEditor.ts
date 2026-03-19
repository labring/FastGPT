import { buildDefaultVariableIdentifier } from '@fastgpt/global/core/app/variableIdentifier';

export const getInitialVariableIdentifier = ({ key, label }: { key?: string; label?: string }) => {
  return key || buildDefaultVariableIdentifier(label || '');
};

export const shouldLockVariableIdentifier = ({ key }: { key?: string }) => {
  return !!key;
};

export const syncVariableIdentifier = ({
  label,
  key,
  touched
}: {
  label: string;
  key: string;
  touched: boolean;
}) => {
  if (touched) {
    return key;
  }

  return buildDefaultVariableIdentifier(label);
};
