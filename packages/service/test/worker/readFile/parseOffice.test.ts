import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { detectFileEncoding } from '@fastgpt/global/common/file/tools';
import { parseOffice } from '@fastgpt/service/worker/readFile/parseOffice';

type PptxEntry = {
  path: string;
  content: string;
  unixPermissions?: number;
};

const relationshipsNamespace = 'http://schemas.openxmlformats.org/package/2006/relationships';
const notesRelationshipType =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide';
const strictNotesRelationshipType =
  'http://purl.oclc.org/ooxml/officeDocument/relationships/notesSlide';

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

/** 构造备注编号与所属页不一致的归档，验证关系解析能覆盖按编号排序的回退。 */
const createPptxWithSlide2Notes = (relationshipsXml: string) =>
  createPptxWithEntries([
    { path: 'ppt/slides/slide1.xml', content: '<a:p><a:t>Slide 1</a:t></a:p>' },
    { path: 'ppt/slides/slide2.xml', content: '<a:p><a:t>Slide 2</a:t></a:p>' },
    { path: 'ppt/slides/slide3.xml', content: '<a:p><a:t>Slide 3</a:t></a:p>' },
    { path: 'ppt/slides/_rels/slide2.xml.rels', content: relationshipsXml },
    {
      path: 'ppt/notesSlides/notesSlide1.xml',
      content: '<a:p><a:t>Note for slide 2</a:t></a:p>'
    }
  ]);

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

  it.each([
    { name: '相对路径' },
    { name: '绝对路径', target: '/ppt/notesSlides/notesSlide1.xml' },
    { name: '相对路径规范化', target: '../notesSlides/./notesSlide1.xml' },
    { name: '绝对路径规范化', target: '/ppt/notesSlides/../notesSlides/notesSlide1.xml' },
    { name: '关系节点带命名空间前缀', prefix: 'pkg:' },
    { name: 'Strict OOXML', relationshipType: strictNotesRelationshipType },
    {
      name: 'Strict OOXML 带前缀及绝对路径',
      prefix: 'pkg:',
      relationshipType: strictNotesRelationshipType,
      target: '/ppt/notesSlides/notesSlide1.xml'
    },
    { name: '显式内部关系', targetMode: 'Internal' }
  ])(
    '备注跟在引用它的幻灯片后面（$name）',
    async ({
      target = '../notesSlides/notesSlide1.xml',
      prefix = '',
      relationshipType = notesRelationshipType,
      targetMode = ''
    }) => {
      const namespaceAttribute = prefix ? `xmlns:${prefix.slice(0, -1)}` : 'xmlns';
      const buffer = await createPptxWithSlide2Notes(`<?xml version="1.0" encoding="UTF-8"?>
<${prefix}Relationships ${namespaceAttribute}="${relationshipsNamespace}">
  <${prefix}Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout2.xml"/>
  <${prefix}Relationship Id="rId2" Type="${relationshipType}" Target="${target}" ${targetMode ? `TargetMode="${targetMode}"` : ''}/>
</${prefix}Relationships>`);

      await expect(parsePptx(buffer)).resolves.toBe('Slide 1\nSlide 2\nNote for slide 2\nSlide 3');
    }
  );

  it.each([
    { name: '错误命名空间', namespace: 'urn:unrelated' },
    {
      name: '其他关系类型',
      attributes:
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../notesSlides/notesSlide1.xml"'
    },
    { name: '缺少关系类型', attributes: 'Target="../notesSlides/notesSlide1.xml"' },
    { name: '缺少目标', attributes: `Type="${notesRelationshipType}"` },
    {
      name: '外部关系',
      attributes: `Type="${notesRelationshipType}" Target="../notesSlides/notesSlide1.xml" TargetMode="External"`
    },
    {
      name: '目标不在备注目录',
      attributes: `Type="${notesRelationshipType}" Target="../slides/slide1.xml"`
    },
    {
      name: '目标越过包根目录',
      attributes: `Type="${notesRelationshipType}" Target="../../../ppt/notesSlides/notesSlide1.xml"`
    }
  ])(
    '忽略无效备注关系并保留编号回退（$name）',
    async ({
      namespace = relationshipsNamespace,
      attributes = `Type="${notesRelationshipType}" Target="../notesSlides/notesSlide1.xml"`
    }) => {
      const buffer = await createPptxWithSlide2Notes(
        `<Relationships xmlns="${namespace}"><Relationship Id="rId1" ${attributes}/></Relationships>`
      );

      await expect(parsePptx(buffer)).resolves.toBe('Slide 1\nNote for slide 2\nSlide 2\nSlide 3');
    }
  );

  it('多页备注按所属页数字排序，未引用备注保留编号回退', async () => {
    // 故意让备注先进入 ZIP，并混入两位数页码，避免排序依赖归档顺序或字典序。
    const buffer = await createPptxWithEntries([
      {
        path: 'ppt/notesSlides/notesSlide1.xml',
        content: '<a:p><a:t>Note for slide 10</a:t></a:p>'
      },
      { path: 'ppt/slides/slide10.xml', content: '<a:p><a:t>Slide 10</a:t></a:p>' },
      {
        path: 'ppt/notesSlides/notesSlide2.xml',
        content: '<a:p><a:t>Note for slide 2</a:t></a:p>'
      },
      { path: 'ppt/slides/slide2.xml', content: '<a:p><a:t>Slide 2</a:t></a:p>' },
      { path: 'ppt/slides/slide1.xml', content: '<a:p><a:t>Slide 1</a:t></a:p>' },
      {
        path: 'ppt/notesSlides/notesSlide3.xml',
        content: '<a:p><a:t>Unreferenced note 3</a:t></a:p>'
      },
      { path: 'ppt/slides/slide3.xml', content: '<a:p><a:t>Slide 3</a:t></a:p>' },
      {
        path: 'ppt/slides/_rels/slide10.xml.rels',
        content: `<Relationships xmlns="${relationshipsNamespace}"><Relationship Id="rId1" Type="${notesRelationshipType}" Target="/ppt/notesSlides/notesSlide1.xml"/></Relationships>`
      },
      {
        path: 'ppt/slides/_rels/slide2.xml.rels',
        content: `<Relationships xmlns="${relationshipsNamespace}"><Relationship Id="rId1" Type="${notesRelationshipType}" Target="../notesSlides/notesSlide2.xml"/></Relationships>`
      }
    ]);

    await expect(parsePptx(buffer)).resolves.toBe(
      'Slide 1\nSlide 2\nNote for slide 2\nSlide 3\nUnreferenced note 3\nSlide 10\nNote for slide 10'
    );
  });

  it('段落内的软换行还原成换行符', async () => {
    const buffer = await createPptx({
      path: 'ppt/slides/slide1.xml',
      content:
        '<a:p><a:r><a:t>ADDRESS LINE ONE</a:t></a:r><a:br/><a:r><a:t>ADDRESS LINE TWO</a:t></a:r></a:p>'
    });

    await expect(parsePptx(buffer)).resolves.toBe('ADDRESS LINE ONE\nADDRESS LINE TWO');
  });

  it('同一段落内的相邻 run 仍然直接相连', async () => {
    const buffer = await createPptx({
      path: 'ppt/slides/slide1.xml',
      content: '<a:p><a:r><a:t>Fast</a:t></a:r><a:r><a:t>GPT</a:t></a:r></a:p>'
    });

    await expect(parsePptx(buffer)).resolves.toBe('FastGPT');
  });

  it('表格单元格内的软换行同样保留', async () => {
    const buffer = await createPptx({
      path: 'ppt/slides/slide1.xml',
      content:
        '<a:tbl><a:tr><a:tc><a:txBody>' +
        '<a:p><a:r><a:t>CELL LINE ONE</a:t></a:r><a:br/><a:r><a:t>CELL LINE TWO</a:t></a:r></a:p>' +
        '</a:txBody></a:tc></a:tr></a:tbl>'
    });

    await expect(parsePptx(buffer)).resolves.toBe('CELL LINE ONE\nCELL LINE TWO');
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

  it.each(['ppt/slides/slide1.xml', 'ppt/slides/_rels/slide1.xml.rels'])(
    '拒绝伪造 uncompressedSize 的高膨胀归档（%s）',
    async (path) => {
      const zip = new JSZip();
      zip.file('ppt/slides/slide1.xml', '<a:p><a:t>Hello</a:t></a:p>');
      zip.file(path, `<a:p><a:t>${'x'.repeat(10 * 1024 * 1024 + 1)}</a:t></a:p>`);
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
    },
    15000
  );

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
