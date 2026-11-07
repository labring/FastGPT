import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { detectFileEncoding } from '@fastgpt/global/common/file/tools';
import { parseOffice } from '@fastgpt/service/worker/readFile/parseOffice';

type PptxEntry = {
  path: string;
  content: string | Buffer;
  unixPermissions?: number;
};

const relationshipsNamespace = 'http://schemas.openxmlformats.org/package/2006/relationships';
const notesRelationshipType =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide';
const strictNotesRelationshipType =
  'http://purl.oclc.org/ooxml/officeDocument/relationships/notesSlide';
const drawingNamespace = 'http://schemas.openxmlformats.org/drawingml/2006/main';

const createPptxWithEntries = async (
  entries: PptxEntry[],
  { compression = 'STORE' }: { compression?: 'STORE' | 'DEFLATE' } = {}
) => {
  const zip = new JSZip();
  entries.forEach(({ path, content, unixPermissions }) => {
    // 简化的 DrawingML 片段补齐命名空间；完整 XML 和编码测试的原始字节保持原样。
    const xml =
      typeof content === 'string' && content.startsWith('<a:') && !content.includes('xmlns:a=')
        ? `<fixture xmlns:a="${drawingNamespace}">${content}</fixture>`
        : content;
    zip.file(path, xml, { unixPermissions });
  });

  return zip.generateAsync({
    type: 'nodebuffer',
    platform: 'UNIX',
    compression
  });
};

const createPptx = async ({ path, content, unixPermissions }: PptxEntry) =>
  createPptxWithEntries([{ path, content, unixPermissions }]);

/** 构造备注编号与所属页不一致的归档，验证关系解析能覆盖按编号排序的回退。 */
const createPptxWithSlide2Notes = (relationshipsXml: string | Buffer) =>
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

/** 用 ASCII 注释补齐解压字节数，验证限额时不制造大段正文或复杂 DOM。 */
const padXmlToBytes = (content: string, bytes: number) =>
  `<!--${' '.repeat(bytes - Buffer.byteLength(content) - 7)}-->${content}`;

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
      name: '目标备注不存在',
      attributes: `Type="${notesRelationshipType}" Target="../notesSlides/notesSlide99.xml"`
    },
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

  it.each(['utf-8', 'utf-16le', 'utf-16be'] as const)(
    '按各 XML 部件的 BOM 读取正文、备注和关系（%s）',
    async (encoding) => {
      const encodeXml = (content: string) => {
        if (encoding === 'utf-8') {
          return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(content)]);
        }
        const bytes = Buffer.from(content.replace('UTF-8', 'UTF-16'), 'utf16le');
        return encoding === 'utf-16be'
          ? Buffer.concat([Buffer.from([0xfe, 0xff]), bytes.swap16()])
          : Buffer.concat([Buffer.from([0xff, 0xfe]), bytes]);
      };
      const buffer = await createPptxWithEntries([
        { path: 'ppt/slides/slide1.xml', content: '<a:p><a:t>第一页</a:t></a:p>' },
        {
          path: 'ppt/slides/slide2.xml',
          content: encodeXml(
            `<?xml version="1.0" encoding="UTF-8"?><a:p xmlns:a="${drawingNamespace}"><a:t>第二页</a:t></a:p>`
          )
        },
        {
          path: 'ppt/notesSlides/notesSlide1.xml',
          content: encodeXml(
            `<?xml version="1.0" encoding="UTF-8"?><a:p xmlns:a="${drawingNamespace}"><a:t>第二页备注</a:t></a:p>`
          )
        },
        {
          path: 'ppt/slides/_rels/slide2.xml.rels',
          content: encodeXml(
            `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${relationshipsNamespace}"><Relationship Id="rId1" Type="${notesRelationshipType}" Target="../notesSlides/notesSlide1.xml"/></Relationships>`
          )
        }
      ]);

      await expect(parsePptx(buffer)).resolves.toBe('第一页\n第二页\n第二页备注');
    }
  );

  it('不使用压缩包探测到的编码解码 UTF-8 XML', async () => {
    const buffer = await createPptx({
      path: 'ppt/slides/slide1.xml',
      content: '<a:p><a:t>中文正文</a:t></a:p>'
    });

    await expect(parseOffice({ buffer, encoding: 'latin1', extension: 'pptx' })).resolves.toBe(
      '中文正文'
    );
  });

  it.each([
    {
      name: '残留关系不能覆盖正确归属',
      content: `<Relationships xmlns="${relationshipsNamespace}"><Relationship Id="rId1" Type="${notesRelationshipType}" Target="../notesSlides/notesSlide1.xml"/></Relationships>`
    },
    { name: '损坏的孤立关系无需解析', content: '' }
  ])('忽略来源幻灯片不存在的关系（$name）', async ({ content }) => {
    const zip = await JSZip.loadAsync(
      await createPptxWithSlide2Notes(
        `<Relationships xmlns="${relationshipsNamespace}"><Relationship Id="rId1" Type="${notesRelationshipType}" Target="../notesSlides/notesSlide1.xml"/></Relationships>`
      )
    );
    zip.file('ppt/slides/_rels/slide99.xml.rels', content);

    await expect(parsePptx(await zip.generateAsync({ type: 'nodebuffer' }))).resolves.toBe(
      'Slide 1\nSlide 2\nNote for slide 2\nSlide 3'
    );
  });

  it.each([
    { name: '空 XML', content: '' },
    { name: '缺少根元素', content: '<!--empty-->' },
    { name: '未闭合标签', content: `<Relationships xmlns="${relationshipsNamespace}">` },
    {
      name: '不匹配的闭合标签',
      content: `<Relationships xmlns="${relationshipsNamespace}"></Other>`
    },
    { name: '非法 UTF-8 字节', content: Buffer.from([0xff, 0x3c, 0x2f, 0x3e]) },
    { name: '不完整的 UTF-16 字节', content: Buffer.from([0xff, 0xfe, 0x3c]) }
  ])('损坏关系 XML 返回统一解析错误（$name）', async ({ content }) => {
    const buffer = await createPptxWithSlide2Notes(content);

    await expect(parsePptx(buffer)).rejects.toThrow('解析 PPT 失败');
  });

  it.each([
    { prefix: 'draw:', namespace: drawingNamespace },
    { prefix: 'draw:', namespace: 'http://purl.oclc.org/ooxml/drawingml/main' },
    { prefix: '', namespace: drawingNamespace }
  ])(
    '按 DrawingML 命名空间提取文本和软换行（$namespace / $prefix）',
    async ({ prefix, namespace }) => {
      const namespaceAttribute = prefix ? `xmlns:${prefix.slice(0, -1)}` : 'xmlns';
      const buffer = await createPptx({
        path: 'ppt/slides/slide1.xml',
        content: `<fixture ${namespaceAttribute}="${namespace}" xmlns:other="urn:other">
  <${prefix}p>
    <${prefix}r><${prefix}t>第一行</${prefix}t></${prefix}r>
    <other:t>不应提取</other:t>
    <${prefix}br/>
    <${prefix}r><${prefix}t>第二行</${prefix}t></${prefix}r>
  </${prefix}p>
  <other:p><other:t>不应提取其他命名空间的段落</other:t></other:p>
</fixture>`
      });

      await expect(parsePptx(buffer)).resolves.toBe('第一行\n第二行');
    }
  );

  it.each([
    {
      name: 'Transitional',
      presentationNamespace: 'http://schemas.openxmlformats.org/presentationml/2006/main',
      officeRelationshipsNamespace:
        'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
    },
    {
      name: 'Strict',
      presentationNamespace: 'http://purl.oclc.org/ooxml/presentationml/main',
      officeRelationshipsNamespace: 'http://purl.oclc.org/ooxml/officeDocument/relationships'
    }
  ])(
    '按 presentation 声明的页序排列正文与所属备注（$name）',
    async ({ presentationNamespace, officeRelationshipsNamespace }) => {
      const buffer = await createPptxWithEntries([
        {
          path: 'ppt/presentation.xml',
          content: `<p:presentation xmlns:p="${presentationNamespace}" xmlns:r="${officeRelationshipsNamespace}"><p:sldIdLst><p:sldId id="257" r:id="rId2"/><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>`
        },
        {
          path: 'ppt/_rels/presentation.xml.rels',
          content: `<pkg:Relationships xmlns:pkg="${relationshipsNamespace}"><pkg:Relationship Id="rId1" Type="${officeRelationshipsNamespace}/slide" Target="slides/slide1.xml"/><pkg:Relationship Id="rId2" Type="${officeRelationshipsNamespace}/slide" Target="/ppt/slides/slide2.xml"/></pkg:Relationships>`
        },
        { path: 'ppt/slides/slide1.xml', content: '<a:p><a:t>Slide 1</a:t></a:p>' },
        { path: 'ppt/slides/slide2.xml', content: '<a:p><a:t>Slide 2</a:t></a:p>' },
        { path: 'ppt/slides/slide3.xml', content: '<a:p><a:t>Unlisted slide 3</a:t></a:p>' },
        {
          path: 'ppt/notesSlides/notesSlide99.xml',
          content: '<a:p><a:t>Unreferenced note 99</a:t></a:p>'
        },
        {
          path: 'ppt/notesSlides/notesSlide1.xml',
          content: '<a:p><a:t>Note for slide 2</a:t></a:p>'
        },
        {
          path: 'ppt/slides/_rels/slide2.xml.rels',
          content: `<Relationships xmlns="${relationshipsNamespace}"><Relationship Id="rId1" Type="${officeRelationshipsNamespace}/notesSlide" Target="../notesSlides/notesSlide1.xml"/></Relationships>`
        }
      ]);

      await expect(parsePptx(buffer)).resolves.toBe(
        'Slide 2\nNote for slide 2\nSlide 1\nUnlisted slide 3\nUnreferenced note 99'
      );
    }
  );

  it('页序关系缺少目标时保留现存幻灯片的编号回退', async () => {
    const zip = await JSZip.loadAsync(
      await createPptxWithSlide2Notes(`<Relationships xmlns="${relationshipsNamespace}"/>`)
    );
    zip.file(
      'ppt/presentation.xml',
      '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="missing"/><p:sldId id="257"/><p:sldId id="258" r:id="missingPart"/><p:sldId id="259" r:id="external"/><p:sldId id="260" r:id="outside"/></p:sldIdLst></p:presentation>'
    );
    zip.file(
      'ppt/_rels/presentation.xml.rels',
      `<Relationships xmlns="${relationshipsNamespace}"><Relationship Id="missingPart" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide99.xml"/><Relationship Id="external" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml" TargetMode="External"/><Relationship Id="outside" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="../outside/slide1.xml"/></Relationships>`
    );

    await expect(parsePptx(await zip.generateAsync({ type: 'nodebuffer' }))).resolves.toBe(
      'Slide 1\nNote for slide 2\nSlide 2\nSlide 3'
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

  it.each([0, 1])('单个 XML 的 10 MiB 限额边界（超出 %i 字节）', async (overflow) => {
    const content = padXmlToBytes(
      `<a:p xmlns:a="${drawingNamespace}"><a:t>Hello</a:t></a:p>`,
      10 * 1024 * 1024 + overflow
    );
    const buffer = await createPptxWithEntries([{ path: 'ppt/slides/slide1.xml', content }], {
      compression: 'DEFLATE'
    });

    if (overflow) {
      await expect(parsePptx(buffer)).rejects.toBe('解析 PPT 失败');
    } else {
      await expect(parsePptx(buffer)).resolves.toBe('Hello');
    }
  });

  it.each([0, 1])(
    '正文、备注与关系文件共享 100 MiB 累计限额（超出 %i 字节）',
    async (overflow) => {
      const noteXml = `<a:p xmlns:a="${drawingNamespace}"><a:t>Hello</a:t></a:p>`;
      const slideXml = padXmlToBytes(noteXml, 10 * 1024 * 1024);
      // 九个正文部件共 90 MiB，余量由关系文件和备注共同占用。
      const entries: PptxEntry[] = Array.from({ length: 9 }, (_, index) => ({
        path: `ppt/slides/slide${index + 1}.xml`,
        content: slideXml
      }));
      entries.push(
        {
          path: 'ppt/slides/_rels/slide1.xml.rels',
          content: padXmlToBytes(
            `<Relationships xmlns="${relationshipsNamespace}"/>`,
            10 * 1024 * 1024 - Buffer.byteLength(noteXml) + overflow
          )
        },
        { path: 'ppt/notesSlides/notesSlide1.xml', content: noteXml }
      );
      const buffer = await createPptxWithEntries(entries, { compression: 'DEFLATE' });

      if (overflow) {
        await expect(parsePptx(buffer)).rejects.toBe('解析 PPT 失败');
      } else {
        await expect(parsePptx(buffer)).resolves.toBe(Array(10).fill('Hello').join('\n'));
      }
    },
    30000
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
