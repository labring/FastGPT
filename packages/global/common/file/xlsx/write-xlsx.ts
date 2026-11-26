import archiver from 'archiver';
import { once } from 'node:events';
import { addAbortSignal, Readable, type Writable } from 'node:stream';
import { finished, pipeline } from 'node:stream/promises';
import { encodeWorksheetRow, planWorkbook, worksheetEnd, worksheetStart } from './workbook';

export type Worksheet = {
  name: string;
  rows: (signal: AbortSignal) => Iterable<readonly string[]> | AsyncIterable<readonly string[]>;
};

/** 按声明顺序逐表写入，ZIP 和目标流均完成后返回。行源应响应传入的取消信号。 */
export async function writeXlsx({
  sheets,
  destination,
  signal
}: {
  sheets: readonly Worksheet[];
  destination: Writable;
  signal?: AbortSignal;
}): Promise<void> {
  signal?.throwIfAborted();
  const { worksheets, metadata } = planWorkbook(sheets.map(({ name }) => name));
  const abort = new AbortController();
  const runSignal = signal ? AbortSignal.any([signal, abort.signal]) : abort.signal;
  const archive = archiver('zip', { highWaterMark: 64 * 1024, zlib: { level: 1 } });
  const stop = (error: unknown) => abort.abort(error);
  const abortZip = () => archive.abort();
  runSignal.addEventListener('abort', abortZip, { once: true });
  archive.on('warning', stop);

  const output = pipeline(archive, destination, { signal: runSignal });
  void output.catch(stop);
  let activeWorksheet: Promise<void> | undefined;

  const append = async (path: string, value: string | Readable) => {
    // 先监听，再 append。entry 表示当前部分已交给 ZIP 实现。
    const entry = once(archive, 'entry', { signal: runSignal });
    await Promise.all([
      entry,
      Promise.resolve().then(() => {
        runSignal.throwIfAborted();
        archive.append(value, { name: path });
      })
    ]);
  };

  try {
    for (const part of metadata) {
      await append(part.path, part.xml);
    }
    for (const [index, sheet] of sheets.entries()) {
      const xml = Readable.from(worksheetXml(sheet, runSignal), {
        objectMode: false,
        highWaterMark: 64 * 1024
      });
      addAbortSignal(runSignal, xml);
      activeWorksheet = finished(xml, { cleanup: true });
      // Archiver 不负责销毁提供给 append 的行源，行源失败也需要结束整个工作簿。
      void activeWorksheet.catch(stop);
      await append(worksheets[index].path, xml);
      await activeWorksheet;
      activeWorksheet = undefined;
    }
    await Promise.all([archive.finalize(), output]);
  } catch (error) {
    stop(error);
    await activeWorksheet?.catch(() => undefined);
    await output.catch(() => undefined);
    throw runSignal.reason;
  } finally {
    runSignal.removeEventListener('abort', abortZip);
    archive.off('warning', stop);
  }
}

async function* worksheetXml(sheet: Worksheet, signal: AbortSignal) {
  yield worksheetStart;
  signal.throwIfAborted();

  let rowNumber = 0;
  for await (const values of sheet.rows(signal)) {
    signal.throwIfAborted();
    rowNumber += 1;
    yield encodeWorksheetRow({ sheet: sheet.name, rowNumber }, values);
  }
  yield worksheetEnd;
}
