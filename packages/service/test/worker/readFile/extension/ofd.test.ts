import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { readOfdFile } from '@fastgpt/service/worker/readFile/extension/ofd';

const OFD_NS = 'http://www.ofdservices.org/VisDoc';

const generateZip = (zip: JSZip) =>
  zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 }
  });

const createOfdFixture = async () => {
  const zip = new JSZip();
  zip.file(
    'OFD.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<ofd:OFD xmlns:ofd="${OFD_NS}" DocType="OFD" Version="2.0">
  <ofd:DocBody>
    <ofd:DocInfo><ofd:DocID>fixture-doc-id</ofd:DocID></ofd:DocInfo>
    <ofd:DocRoot>Doc_0/Document.xml</ofd:DocRoot>
  </ofd:DocBody>
</ofd:OFD>`
  );
  zip.file(
    'Doc_0/Document.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<ofd:Document xmlns:ofd="${OFD_NS}">
  <ofd:CommonData>
    <ofd:PageBox Unit="MM" Width="210" Height="297"/>
  </ofd:CommonData>
  <ofd:Pages>
    <ofd:Page BaseLoc="Pages/Page_0/Content.xml"/>
    <ofd:Page BaseLoc="Pages/Page_1/Content.xml"/>
  </ofd:Pages>
</ofd:Document>`
  );
  zip.file(
    'Doc_0/Pages/Page_0/Content.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<ofd:Page xmlns:ofd="${OFD_NS}">
  <ofd:Content>
    <ofd:Layer>
      <ofd:TextObject ID="1" Boundary="56 80 483 20" Size="16">
        <ofd:TextCode X="0" Y="0">第一页标题</ofd:TextCode>
      </ofd:TextObject>
      <ofd:TextObject ID="2" Boundary="56 120 483 16" Size="10.5">
        <ofd:TextCode X="0" Y="0">第一行正文内容<ofd:DeltaX>10 10</ofd:DeltaX></ofd:TextCode>
      </ofd:TextObject>
      <ofd:TextObject ID="3" Boundary="56 140 483 16" Size="10.5">
        <ofd:TextCode X="0" Y="0">第二行续行内容</ofd:TextCode>
      </ofd:TextObject>
      <ofd:TextObject ID="4" Boundary="66 160 473 16" Size="10.5">
        <ofd:TextCode X="0" Y="0">第三段缩进内容</ofd:TextCode>
      </ofd:TextObject>
      <ofd:TextObject ID="5" Boundary="280 800 20 12" Size="8">
        <ofd:TextCode X="0" Y="0">1</ofd:TextCode>
      </ofd:TextObject>
    </ofd:Layer>
  </ofd:Content>
</ofd:Page>`
  );
  // 第二页使用非标准命名空间前缀与无前缀属性，验证按 localName 匹配
  zip.file(
    'Doc_0/Pages/Page_1/Content.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<a:Page xmlns:a="http://example.com/custom-ofd">
  <a:Content>
    <a:Layer>
      <a:TextObject ID="6" Boundary="56 100 483 16" Size="10.5">
        <a:TextCode X="0" Y="0">第二页正文</a:TextCode>
      </a:TextObject>
    </a:Layer>
  </a:Content>
</a:Page>`
  );
  return generateZip(zip);
};

const createSinglePageOfd = async () => {
  const zip = new JSZip();
  zip.file(
    'OFD.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<ofd:OFD xmlns:ofd="${OFD_NS}" DocType="OFD" Version="2.0">
  <ofd:DocBody><ofd:DocRoot>Doc_0/Document.xml</ofd:DocRoot></ofd:DocBody>
</ofd:OFD>`
  );
  // 缺少 BaseLoc 时回退到约定路径 Doc_0/Pages/Page_0/Content.xml
  zip.file(
    'Doc_0/Document.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<ofd:Document xmlns:ofd="${OFD_NS}"><ofd:Pages><ofd:Page/></ofd:Pages></ofd:Document>`
  );
  zip.file(
    'Doc_0/Pages/Page_0/Content.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<ofd:Page xmlns:ofd="${OFD_NS}">
  <ofd:Content><ofd:Layer>
    <ofd:TextObject ID="1" Boundary="56 100 483 16" Size="10.5">
      <ofd:TextCode X="0" Y="0">正文甲</ofd:TextCode>
    </ofd:TextObject>
    <ofd:TextObject ID="2" Boundary="56 120 483 16" Size="10.5">
      <ofd:TextCode X="0" Y="0">正文乙</ofd:TextCode>
    </ofd:TextObject>
    <ofd:TextObject ID="3" Boundary="56 140 483 16" Size="10.5">
      <ofd:TextCode X="0" Y="0">正文丙</ofd:TextCode>
    </ofd:TextObject>
    <ofd:TextObject ID="4" Boundary="290 780 20 12" Size="8">
      <ofd:TextCode X="0" Y="0">-1-</ofd:TextCode>
    </ofd:TextObject>
  </ofd:Layer></ofd:Content>
</ofd:Page>`
  );
  return generateZip(zip);
};

describe('readOfdFile', () => {
  it('解析多页 OFD：页序、行序、标题、缩进分段与页码过滤', async () => {
    const buffer = await createOfdFixture();
    const result = await readOfdFile({ buffer, encoding: '', extension: 'ofd' });

    expect(result.rawText).toBe(
      '# 第一页标题\n第一行正文内容\n第二行续行内容\n\n\n第三段缩进内容\n\n第二页正文'
    );
  });

  it('DeltaX 子元素不混入正文文本', async () => {
    const buffer = await createOfdFixture();
    const result = await readOfdFile({ buffer, encoding: '', extension: 'ofd' });

    expect(result.rawText).toContain('第一行正文内容');
    expect(result.rawText).not.toContain('10 10');
  });

  it('过滤页脚页码行（位置+字号+内容三因子）', async () => {
    const buffer = await createSinglePageOfd();
    const result = await readOfdFile({ buffer, encoding: '', extension: 'ofd' });

    expect(result.rawText).toBe(['正文甲', '正文乙', '正文丙'].join('\n'));
  });

  it('缺少 OFD.xml 时回退到约定文档路径', async () => {
    const zip = new JSZip();
    zip.file(
      'Doc_0/Document.xml',
      `<?xml version="1.0" encoding="UTF-8"?>
<ofd:Document xmlns:ofd="${OFD_NS}"><ofd:Pages><ofd:Page/></ofd:Pages></ofd:Document>`
    );
    zip.file(
      'Doc_0/Pages/Page_0/Content.xml',
      `<?xml version="1.0" encoding="UTF-8"?>
<ofd:Page xmlns:ofd="${OFD_NS}"><ofd:Content><ofd:Layer>
  <ofd:TextObject Boundary="56 100 483 16" Size="10.5">
    <ofd:TextCode X="0" Y="0">无 OFD.xml 回退正文</ofd:TextCode>
  </ofd:TextObject>
</ofd:Layer></ofd:Content></ofd:Page>`
    );
    const buffer = await generateZip(zip);

    const result = await readOfdFile({ buffer, encoding: '', extension: 'ofd' });
    expect(result.rawText).toBe('无 OFD.xml 回退正文');
  });

  it('加密 OFD 拒绝解析', async () => {
    const zip = new JSZip();
    zip.file(
      'OFD.xml',
      `<?xml version="1.0" encoding="UTF-8"?>
<ofd:OFD xmlns:ofd="${OFD_NS}"><ofd:DocBody><ofd:DocRoot>Doc_0/Document.xml</ofd:DocRoot></ofd:DocBody></ofd:OFD>`
    );
    zip.file(
      'Doc_0/Document.xml',
      `<?xml version="1.0" encoding="UTF-8"?>
<ofd:Document xmlns:ofd="${OFD_NS}">
  <ofd:EncryptedFile/><ofd:Pages><ofd:Page/></ofd:Pages>
</ofd:Document>`
    );
    const buffer = await generateZip(zip);

    await expect(readOfdFile({ buffer, encoding: '', extension: 'ofd' })).rejects.toThrow(
      CommonErrEnum.invalidParseFile
    );
  });

  it('损坏的 zip 内容落通用解析失败兜底', async () => {
    const buffer = Buffer.from('this is not a zip file');

    await expect(readOfdFile({ buffer, encoding: '', extension: 'ofd' })).rejects.toThrow(
      CommonErrEnum.pdfParseFailed
    );
  });

  it('没有文档条目时返回诊断码', async () => {
    const zip = new JSZip();
    zip.file('other.txt', 'hello');
    const buffer = await generateZip(zip);

    await expect(readOfdFile({ buffer, encoding: '', extension: 'ofd' })).rejects.toThrow(
      CommonErrEnum.invalidParseFile
    );
  });
});
