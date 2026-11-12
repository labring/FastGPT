import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppChatConfigTypeSchema } from '@fastgpt/global/core/app/type';
import CronSelector, {
  cronString2Fields,
  cronString2Label
} from '../../../../components/common/MySelect/CronSelector';
import type { MultipleSelectProps } from '../../../../components/common/MySelect/type';

const mocks = vi.hoisted(() => ({ select: vi.fn() }));
vi.mock('../../../../components/common/MySelect/MultipleRowSelect', () => ({
  default: (props: MultipleSelectProps) => {
    mocks.select(props);
    return null;
  }
}));
vi.mock('next-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: object) => `${key}:${JSON.stringify(values)}`
  })
}));

const render = (cronString: string, onChange = vi.fn()) => {
  renderToStaticMarkup(React.createElement(CronSelector, { cronString, onChange }));
  return mocks.select.mock.lastCall![0] as MultipleSelectProps;
};

describe('minute interval configuration', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([1, 5, 10, 15, 20, 30])('preserves an every-%i-minute schedule on reload', (minutes) => {
    const cronString = `*/${minutes} * * * *`;
    const saved = AppChatConfigTypeSchema.parse(
      JSON.parse(
        JSON.stringify({ scheduledTriggerConfig: { cronString, timezone: 'Asia/Shanghai' } })
      )
    );
    const props = render(saved.scheduledTriggerConfig!.cronString);
    expect(props.value?.slice(0, 2)).toEqual(['minuteInterval', minutes]);
    expect(cronString2Label(cronString, (key: string, args: unknown) => ({ key, args }))).toEqual({
      key: 'common:core.app.schedule.Minute interval',
      args: { interval: minutes }
    });
  });

  it('offers minute intervals and emits the selected expression', () => {
    const onChange = vi.fn();
    const props = render('0 */2 * * *', onChange);
    const option = props.list.find((item) => item.value === 'minuteInterval');
    expect(option?.children?.map((item) => item.value)).toEqual([1, 5, 10, 15, 20, 30]);
    props.onSelect(['minuteInterval', 15]);
    expect(onChange).toHaveBeenCalledWith('*/15 * * * *');
  });

  it.each([undefined, 9, 12, 31])('does not save an incomplete minute selection: %s', (value) => {
    const onChange = vi.fn();
    const props = render('0 9 * * *', onChange);
    props.onSelect(['minuteInterval', value]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it.each([
    [],
    ['day'],
    ['day', undefined],
    ['day', 30],
    ['week', 10, 0],
    ['week', 1],
    ['week', 1, undefined],
    ['month', 0, 0],
    ['month', 29, 0],
    ['month', 20],
    ['interval', 20],
    ['interval', undefined]
  ])('rejects an incomplete or unsupported target path %j', (...path) => {
    const onChange = vi.fn();
    const props = render('*/30 * * * *', onChange);
    props.onSelect(path);
    expect(onChange).not.toHaveBeenCalled();
  });

  it.each([
    ['0 */2 * * *', ['interval', 2, 0]],
    ['0 9 * * *', ['day', 9, 0]],
    ['0 9 * * 1', ['week', 1, 9]],
    ['0 9 15 * *', ['month', 15, 9]]
  ])('keeps legacy schedule %s unchanged', (cronString, fields) => {
    expect(cronString2Fields(cronString as string)).toEqual(fields);
    const onChange = vi.fn();
    const props = render(cronString as string, onChange);
    props.onSelect(fields as any[]);
    expect(onChange).toHaveBeenCalledWith(cronString);
  });

  it('keeps disabled and invalid configuration fallback behavior', () => {
    expect(cronString2Fields('')).toBeUndefined();
    expect(cronString2Fields('invalid')).toEqual(['day', 0, 0]);
  });
});
