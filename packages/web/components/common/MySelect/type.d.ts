import type { ButtonProps } from '@chakra-ui/react';

type ListItemType = {
  alias?: string;
  label: string | React.ReactNode;
  value: any;
  children?: ListItemType[];
};
export type MultipleSelectProps = {
  label?: string | React.ReactNode;
  value?: any[];
  placeholder?: string;
  list: ListItemType[];
  emptyTip?: string;
  maxH?: number;
  onSelect: (val: any[]) => void;
  popDirection?: 'top' | 'bottom';
  changeOnEverySelect?: boolean;
  ButtonProps?: ButtonProps;
};
export type MultipleArraySelectProps = Omit<MultipleSelectProps, 'value'> & {
  value?: any[][];
  onSelect: (val: any[][]) => void;
};
