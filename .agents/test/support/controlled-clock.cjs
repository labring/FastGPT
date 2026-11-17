/**
 * 仅供专用测试进程通过 NODE_OPTIONS=--require=... 加载。
 * FASTGPT_TEST_CLOCK_FILE 为 { now: epochMilliseconds | null }，null 使用真实时钟。
 * 只替换 Date，不替换定时器；不影响宿主、Mongo、Redis 或未加载此文件的进程。
 * 控制文件应写到临时文件后原子 rename，避免读取半份 JSON。
 */
const fs = require('node:fs');
const NativeDate = global.Date;
const file = process.env.FASTGPT_TEST_CLOCK_FILE;
if (file) {
  const now = () => {
    const x = JSON.parse(fs.readFileSync(file, 'utf8')).now;
    if (x === null) return NativeDate.now();
    if (!Number.isFinite(x)) throw new Error('Invalid test clock value');
    return x;
  };
  function ControlledDate(...args) {
    if (!new.target) return new NativeDate(now()).toString();
    return Reflect.construct(NativeDate, args.length ? args : [now()], new.target);
  }
  Object.defineProperty(ControlledDate, 'name', { value: 'Date' });
  Object.setPrototypeOf(ControlledDate, NativeDate);
  ControlledDate.prototype = NativeDate.prototype;
  ControlledDate.now = now;
  ControlledDate.parse = NativeDate.parse;
  ControlledDate.UTC = NativeDate.UTC;
  global.Date = ControlledDate;
}
