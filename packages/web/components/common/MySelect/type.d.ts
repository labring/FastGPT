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
  styles?: ButtonProps;
  popDirection?: 'top' | 'bottom';
  changeOnEverySelect?: boolean;
};
export type MultipleArraySelectProps = Omit<MultipleSelectProps, 'value'> & {
  value?: any[][];
  onSelect: (val: any[][]) => void;
};
