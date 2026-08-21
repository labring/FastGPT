import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { detectFileEncoding } from '@fastgpt/global/common/file/tools';
import { parseOffice } from '@fastgpt/service/worker/readFile/parseOffice';

type PptxEntry = {
  path: string;
  content: string;
  unixPermissions?: number;
};

const createPptxWithEntries = async (entries: PptxEntry[]) => {
  const zip = new JSZip();
  entries.forEach(({ path, content, unixPermissions }) => {
    zip.file(path, content, { unixPermissions });
  });

  return zip.generateAsync({
    type: 'nodebuffer',
    platform: 'UNIX'
  });
};

const createPptx = async ({ path, content, unixPermissions }: PptxEntry) =>
  createPptxWithEntries([{ path, content, unixPermissions }]);

const parsePptx = (buffer: Buffer) =>
  parseOffice({
    buffer,
    encoding: 'utf-8',
    extension: 'pptx'
  });

const findZipRecord = (buffer: Buffer, signature: number, fromEnd = false) => {
  const signatureBuffer = Buffer.allocUnsafe(4);
  signatureBuffer.writeUInt32LE(signature);
  const offset = fromEnd ? buffer.lastIndexOf(signatureBuffer) : buffer.indexOf(signatureBuffer);

  expect(offset).toBeGreaterThanOrEqual(0);
  return offset;
};

describe('parseOffice', () => {
  it('解析合法 PPTX slide XML', async () => {
    const buffer = await createPptx({
      path: 'ppt/slides/slide1.xml',
      content: '<a:p><a:t>Hello</a:t><a:t> FastGPT</a:t></a:p>'
    });
    const encoding = detectFileEncoding(buffer) as BufferEncoding;

    await expect(
      parseOffice({
        buffer,
        encoding,
        extension: 'pptx'
      })
    ).resolves.toBe('Hello FastGPT');
  });

  it('按页码解析多个 slide 和 notes XML', async () => {
    const buffer = await createPptxWithEntries([
      {
        path: 'ppt/slides/slide2.xml',
        content: '<a:p><a:t>Slide 2</a:t></a:p>'
      },
      {
        path: 'ppt/slides/slide1.xml',
        content: '<a:p><a:t>Slide 1</a:t></a:p>'
      },
      {
        path: 'ppt/notesSlides/notesSlide1.xml',
        content: '<a:p><a:t>Note 1</a:t></a:p>'
      }
    ]);

    await expect(parsePptx(buffer)).resolves.toBe('Slide 1\nNote 1\nSlide 2');
  });

  it('合法 slide XML 没有文本节点时返回空字符串', async () => {
    const buffer = await createPptx({
      path: 'ppt/slides/slide1.xml',
      content: '<a:p></a:p>'
    });

    await expect(parsePptx(buffer)).resolves.toBe('');
  });

  it('拒绝伪装成 slide XML 的 symlink entry', async () => {
    const buffer = await createPptx({
      path: 'ppt/slides/slide1.xml',
      content: '/etc/passwd',
      unixPermissions: 0o120777
    });

    await expect(parsePptx(buffer)).rejects.toBe('解析 PPT 失败');
  });

  it('拒绝仅包含嵌套伪装路径的归档', async () => {
    const buffer = await createPptx({
      path: 'outside/ppt/slides/slide1.xml',
      content: '<a:p><a:t>hidden</a:t></a:p>'
    });

    await expect(parsePptx(buffer)).rejects.toBe('解析 PPT 失败');
  });

  it('拒绝经 JSZip 规范化后伪装成 slide XML 的 traversal entry', async () => {
    const buffer = await createPptx({
      path: '../ppt/slides/slide1.xml',
      content: '<a:p><a:t>hidden</a:t></a:p>'
    });

    await expect(parsePptx(buffer)).rejects.toThrow();
  });

  it('拒绝伪造 uncompressedSize 的高膨胀归档', async () => {
    const zip = new JSZip();
    zip.file('ppt/slides/slide1.xml', `<a:p><a:t>${'x'.repeat(10 * 1024 * 1024 + 1)}</a:t></a:p>`);
    const buffer = await zip.generateAsync({
      type: 'nodebuffer',
      platform: 'UNIX',
      compression: 'DEFLATE',
      compressionOptions: { level: 9 }
    });
    const forgedBuffer = Buffer.from(buffer);
    const centralDirectoryOffset = findZipRecord(forgedBuffer, 0x02014b50, true);
    forgedBuffer.writeUInt32LE(1, centralDirectoryOffset + 24);

    await expect(parsePptx(forgedBuffer)).rejects.toThrow();
  }, 15000);

  it('在读取 entry 前拒绝超过数量限制的归档', async () => {
    const buffer = await createPptx({
      path: 'ppt/slides/slide1.xml',
      content: '<a:p><a:t>Hello</a:t></a:p>'
    });
    const forgedBuffer = Buffer.from(buffer);
    const endRecordOffset = findZipRecord(forgedBuffer, 0x06054b50, true);
    forgedBuffer.writeUInt16LE(10001, endRecordOffset + 8);
    forgedBuffer.writeUInt16LE(10001, endRecordOffset + 10);

    await expect(parsePptx(forgedBuffer)).rejects.toBe('解析 PPT 失败');
  });

  it('拒绝损坏的 PPTX 归档', async () => {
    await expect(parsePptx(Buffer.from('not-a-zip'))).rejects.toThrow();
  });

  it('拒绝不支持的 Office 扩展名', async () => {
    await expect(
      parseOffice({
        buffer: Buffer.alloc(0),
        encoding: 'utf-8',
        extension: 'docx'
      })
    ).rejects.toBe('只能读取 .pptx 文件');
  });
});
