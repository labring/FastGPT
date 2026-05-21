export const shouldKeepEditingStringValue = (value: string) =>
  value.endsWith('.') || /^[+-]?\d+\.0+$/.test(value);

export function getNumberInputValue(value: string, keepEditingStringValue: false): number | '';
export function getNumberInputValue(value: string, keepEditingStringValue?: true): number | string;
export function getNumberInputValue(value: string, keepEditingStringValue: boolean): number | string;
export function getNumberInputValue(value: string, keepEditingStringValue = true) {
  if (value === '') return '';

  if (keepEditingStringValue && shouldKeepEditingStringValue(value)) {
    return value;
  }

  return Number(value);
}
