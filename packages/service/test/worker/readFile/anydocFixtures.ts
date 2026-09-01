import { anydocDocumentFileExtensions } from '@fastgpt/global/common/file/constants';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';

export const anydocTestExtensions = anydocDocumentFileExtensions.map((extension) =>
  extension.slice(1)
);

const fixtureDir = path.join(__dirname, 'fixtures');

const readBase64Fixture = (filename: string) =>
  Buffer.from(readFileSync(path.join(fixtureDir, filename), 'utf8').trim(), 'base64');

const generateZip = (zip: JSZip) =>
  zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 }
  });

const createRootRelationship = (target: string) => `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="${target}"/>
</Relationships>`;

/** 创建带真实 OOXML 主部件类型的 DOCM 测试文档。 */
const createDocmFixture = async () => {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.ms-word.document.macroEnabled.main+xml"/>
</Types>`
  );
  zip.file('_rels/.rels', createRootRelationship('word/document.xml'));
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body><w:p><w:r><w:t>AnyDoc DOCM fixture</w:t></w:r></w:p></w:body>
</w:document>`
  );
  return generateZip(zip);
};

/** 创建带真实 XLSM 主部件类型和工作表关系的测试文档。 */
const createXlsmFixture = async () => {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.ms-excel.sheet.macroEnabled.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`
  );
  zip.file('_rels/.rels', createRootRelationship('xl/workbook.xml'));
  zip.file(
    'xl/workbook.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="AnyDoc XLSM" sheetId="1" r:id="rId1"/></sheets>
</workbook>`
  );
  zip.file(
    'xl/_rels/workbook.xml.rels',
    `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`
  );
  zip.file(
    'xl/worksheets/sheet1.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>AnyDoc XLSM fixture</t></is></c></row></sheetData>
</worksheet>`
  );
  return generateZip(zip);
};

const presentationMainContentTypes = {
  pptm: 'application/vnd.ms-powerpoint.presentation.macroEnabled.main+xml',
  ppsx: 'application/vnd.openxmlformats-officedocument.presentationml.slideshow.main+xml',
  ppsm: 'application/vnd.ms-powerpoint.slideshow.macroEnabled.main+xml'
} as const;

/** 创建 PPTM/PPSX/PPSM 各自的真实 OPC 主部件类型。 */
const createPresentationFixture = async (extension: keyof typeof presentationMainContentTypes) => {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="${presentationMainContentTypes[extension]}"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>`
  );
  zip.file('_rels/.rels', createRootRelationship('ppt/presentation.xml'));
  zip.file(
    'ppt/presentation.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst>
</p:presentation>`
  );
  zip.file(
    'ppt/_rels/presentation.xml.rels',
    `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
</Relationships>`
  );
  zip.file(
    'ppt/slides/slide1.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
 xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree><p:sp><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>AnyDoc ${extension.toUpperCase()} fixture</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld>
</p:sld>`
  );
  return generateZip(zip);
};

const odfMimeTypes = {
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  odp: 'application/vnd.oasis.opendocument.presentation'
} as const;

/** 创建包含标准 mimetype 与 content.xml 的 ODS/ODP 测试文档。 */
const createOdfFixture = async (extension: keyof typeof odfMimeTypes) => {
  const zip = new JSZip();
  zip.file('mimetype', odfMimeTypes[extension], { compression: 'STORE' });
  zip.file(
    'content.xml',
    extension === 'ods'
      ? `<?xml version="1.0"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
 xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"
 xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0">
  <office:body><office:spreadsheet><table:table table:name="AnyDoc ODS">
    <table:table-row><table:table-cell office:value-type="string"><text:p>AnyDoc ODS fixture</text:p></table:table-cell></table:table-row>
  </table:table></office:spreadsheet></office:body>
</office:document-content>`
      : `<?xml version="1.0"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
 xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"
 xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0">
  <office:body><office:presentation><draw:page draw:name="AnyDoc ODP">
    <draw:frame><draw:text-box><text:p>AnyDoc ODP fixture</text:p></draw:text-box></draw:frame>
  </draw:page></office:presentation></office:body>
</office:document-content>`
  );
  return generateZip(zip);
};

/** 创建具备 OCF container、OPF spine 和 XHTML 内容的 EPUB。 */
const createEpubFixture = async () => {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`
  );
  zip.file(
    'OEBPS/content.opf',
    `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">anydoc-fixture</dc:identifier><dc:title>AnyDoc EPUB</dc:title><dc:language>en</dc:language></metadata>
  <manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest>
  <spine><itemref idref="chapter"/></spine>
</package>`
  );
  zip.file(
    'OEBPS/chapter.xhtml',
    `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>AnyDoc EPUB</title></head><body><h1>AnyDoc EPUB fixture</h1></body></html>`
  );
  return generateZip(zip);
};

export type AnydocFixture = {
  buffer: Buffer;
  expected: string;
};

/**
 * 为 FastGPT 声明的每种 AnyDoc 扩展名创建可真实解析的文件内容。
 *
 * `.pps/.pot` 与 `.ppt` 按二进制 PowerPoint 规范共享 CFB 内容；扩展名只决定打开模式。
 * 其余容器变体均写入各自的 MIME 或 OOXML main content type，防止测试退化为单纯改后缀。
 */
export const createAnydocFixture = async (extension: string): Promise<AnydocFixture> => {
  switch (extension) {
    case 'doc':
      return {
        buffer: readBase64Fixture('legacy-doc.base64'),
        expected: 'こんにちは世界'
      };
    case 'wps':
      return {
        buffer: readBase64Fixture('wps-writer-doc.base64'),
        expected: 'FastGPT WPS Writer parser fixture'
      };
    case 'docm':
      return { buffer: await createDocmFixture(), expected: 'AnyDoc DOCM fixture' };
    case 'ppt':
    case 'pps':
    case 'pot':
      return {
        buffer: readBase64Fixture('legacy-presentation.base64'),
        expected: 'Alpha master body text'
      };
    case 'pptm':
    case 'ppsx':
    case 'ppsm':
      return {
        buffer: await createPresentationFixture(extension),
        expected: `AnyDoc ${extension.toUpperCase()} fixture`
      };
    case 'xls':
      return {
        buffer: readBase64Fixture('legacy-xls.base64'),
        expected: 'fifteen and a half'
      };
    case 'xlsm':
      return { buffer: await createXlsmFixture(), expected: 'AnyDoc XLSM fixture' };
    case 'xlsb':
      return {
        buffer: readBase64Fixture('excel-binary.base64'),
        expected: 'north north north'
      };
    case 'odt':
      return {
        buffer: readBase64Fixture('open-document-text.base64'),
        expected: 'Bold via the family default style'
      };
    case 'ods':
    case 'odp':
      return {
        buffer: await createOdfFixture(extension),
        expected: `AnyDoc ${extension.toUpperCase()} fixture`
      };
    case 'rtf':
      return {
        buffer: Buffer.from('{\\rtf1\\ansi AnyDoc RTF fixture}', 'ascii'),
        expected: 'AnyDoc RTF fixture'
      };
    case 'epub':
      return { buffer: await createEpubFixture(), expected: 'AnyDoc EPUB fixture' };
    default:
      throw new Error(`Missing AnyDoc integration fixture for .${extension}`);
  }
};
