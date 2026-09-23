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
  const LONG_TEST_TIMEOUT = 120000;
  const MIB = 1024 * 1024;

  // 大体积页面用注释填充：解析快，不产出正文
  const padPageXml = (bytes: number) => {
    const head = `<ofd:Page xmlns:ofd="${OFD_NS}"><!--`;
    const tail = '--></ofd:Page>';
    return head + 'x'.repeat(bytes - head.length - tail.length) + tail;
  };

  const createPaddedPagesOfd = async (pageBytes: number, pageCount: number) => {
    const zip = new JSZip();
    zip.file(
      'OFD.xml',
      `<?xml version="1.0" encoding="UTF-8"?>
<ofd:OFD xmlns:ofd="${OFD_NS}"><ofd:DocBody><ofd:DocRoot>Doc_0/Document.xml</ofd:DocRoot></ofd:DocBody></ofd:OFD>`
    );
    zip.file(
      'Doc_0/Document.xml',
      `<?xml version="1.0" encoding="UTF-8"?>
<ofd:Document xmlns:ofd="${OFD_NS}"><ofd:Pages>${Array.from(
        { length: pageCount },
        (_, i) => `<ofd:Page BaseLoc="Pages/Page_${i}/Content.xml"/>`
      ).join('')}</ofd:Pages></ofd:Document>`
    );
    for (let i = 0; i < pageCount; i++) {
      zip.file(`Doc_0/Pages/Page_${i}/Content.xml`, padPageXml(pageBytes));
    }
    // 低压缩级别即可把填充注释压到很小，且远快于 level 9
    return zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 1 }
    });
  };

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

  it('声明页面超过 2000 页时直接拒绝，不返回部分内容', async () => {
    const zip = new JSZip();
    zip.file(
      'OFD.xml',
      `<?xml version="1.0" encoding="UTF-8"?>
<ofd:OFD xmlns:ofd="${OFD_NS}"><ofd:DocBody><ofd:DocRoot>Doc_0/Document.xml</ofd:DocRoot></ofd:DocBody></ofd:OFD>`
    );
    zip.file(
      'Doc_0/Document.xml',
      `<?xml version="1.0" encoding="UTF-8"?>
<ofd:Document xmlns:ofd="${OFD_NS}"><ofd:Pages>${'<ofd:Page BaseLoc="Pages/Page_0/Content.xml"/>'.repeat(
        2001
      )}</ofd:Pages></ofd:Document>`
    );
    zip.file('Doc_0/Pages/Page_0/Content.xml', padPageXml(1024));
    const buffer = await generateZip(zip);

    await expect(readOfdFile({ buffer, encoding: '', extension: 'ofd' })).rejects.toThrow(
      CommonErrEnum.officeConversionFailed
    );
  });

  it('声明页面缺失 Content.xml 时拒绝，不静默跳过', async () => {
    const zip = new JSZip();
    zip.file(
      'OFD.xml',
      `<?xml version="1.0" encoding="UTF-8"?>
<ofd:OFD xmlns:ofd="${OFD_NS}"><ofd:DocBody><ofd:DocRoot>Doc_0/Document.xml</ofd:DocRoot></ofd:DocBody></ofd:OFD>`
    );
    zip.file(
      'Doc_0/Document.xml',
      `<?xml version="1.0" encoding="UTF-8"?>
<ofd:Document xmlns:ofd="${OFD_NS}"><ofd:Pages>
  <ofd:Page BaseLoc="Pages/Page_0/Content.xml"/>
  <ofd:Page BaseLoc="Pages/Page_1/Content.xml"/>
</ofd:Pages></ofd:Document>`
    );
    // 只提供 Page_0，Page_1 缺失
    zip.file('Doc_0/Pages/Page_0/Content.xml', padPageXml(1024));
    const buffer = await generateZip(zip);

    await expect(readOfdFile({ buffer, encoding: '', extension: 'ofd' })).rejects.toThrow(
      CommonErrEnum.invalidParseFile
    );
  });

  it('Document.xml 缺失 Pages 或 Page 声明时拒绝', async () => {
    const buffer = await (async () => {
      const zip = new JSZip();
      zip.file(
        'OFD.xml',
        `<?xml version="1.0" encoding="UTF-8"?>
<ofd:OFD xmlns:ofd="${OFD_NS}"><ofd:DocBody><ofd:DocRoot>Doc_0/Document.xml</ofd:DocRoot></ofd:DocBody></ofd:OFD>`
      );
      zip.file(
        'Doc_0/Document.xml',
        `<?xml version="1.0" encoding="UTF-8"?>
<ofd:Document xmlns:ofd="${OFD_NS}"><ofd:CommonData/></ofd:Document>`
      );
      return generateZip(zip);
    })();

    await expect(readOfdFile({ buffer, encoding: '', extension: 'ofd' })).rejects.toThrow(
      CommonErrEnum.invalidParseFile
    );
  });

  it('页面 XML 未闭合等致命解析错误时拒绝', async () => {
    const zip = new JSZip();
    zip.file(
      'OFD.xml',
      `<?xml version="1.0" encoding="UTF-8"?>
<ofd:OFD xmlns:ofd="${OFD_NS}"><ofd:DocBody><ofd:DocRoot>Doc_0/Document.xml</ofd:DocRoot></ofd:DocBody></ofd:OFD>`
    );
    zip.file(
      'Doc_0/Document.xml',
      `<?xml version="1.0" encoding="UTF-8"?>
<ofd:Document xmlns:ofd="${OFD_NS}"><ofd:Pages><ofd:Page/></ofd:Pages></ofd:Document>`
    );
    zip.file('Doc_0/Pages/Page_0/Content.xml', `<ofd:Page xmlns:ofd="${OFD_NS}"><ofd:Content>`);
    const buffer = await generateZip(zip);

    await expect(readOfdFile({ buffer, encoding: '', extension: 'ofd' })).rejects.toThrow(
      CommonErrEnum.invalidParseFile
    );
  });

  it(
    '无页码文档中，最小且最频繁的正文字号不会被误判为页码字体，标题正常识别',
    async () => {
      const zip = new JSZip();
      zip.file(
        'OFD.xml',
        `<?xml version="1.0" encoding="UTF-8"?>
<ofd:OFD xmlns:ofd="${OFD_NS}"><ofd:DocBody><ofd:DocRoot>Doc_0/Document.xml</ofd:DocRoot></ofd:DocBody></ofd:OFD>`
      );
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
    <ofd:TextObject Boundary="56 80 483 20" Size="16">
      <ofd:TextCode X="0" Y="0">章节标题</ofd:TextCode>
    </ofd:TextObject>
    <ofd:TextObject Boundary="56 120 483 16" Size="10.5">
      <ofd:TextCode X="0" Y="0">正文第一行</ofd:TextCode>
    </ofd:TextObject>
    <ofd:TextObject Boundary="56 140 483 16" Size="10.5">
      <ofd:TextCode X="0" Y="0">正文第二行</ofd:TextCode>
    </ofd:TextObject>
    <ofd:TextObject Boundary="56 160 483 16" Size="10.5">
      <ofd:TextCode X="0" Y="0">正文第三行</ofd:TextCode>
    </ofd:TextObject>
  </ofd:Layer></ofd:Content>
</ofd:Page>`
      );
      const buffer = await generateZip(zip);

      const result = await readOfdFile({ buffer, encoding: '', extension: 'ofd' });
      expect(result.rawText).toContain('# 章节标题');
      expect(result.rawText).toContain('正文第一行');
    },
    LONG_TEST_TIMEOUT
  );

  it(
    'ZIP entry 数量超过上限时拒绝',
    async () => {
      const zip = new JSZip();
      zip.file(
        'OFD.xml',
        `<?xml version="1.0" encoding="UTF-8"?>
<ofd:OFD xmlns:ofd="${OFD_NS}"><ofd:DocBody><ofd:DocRoot>Doc_0/Document.xml</ofd:DocRoot></ofd:DocBody></ofd:OFD>`
      );
      zip.file(
        'Doc_0/Document.xml',
        `<?xml version="1.0" encoding="UTF-8"?>
<ofd:Document xmlns:ofd="${OFD_NS}"><ofd:Pages><ofd:Page/></ofd:Pages></ofd:Document>`
      );
      zip.file(
        'Doc_0/Pages/Page_0/Content.xml',
        `<ofd:Page xmlns:ofd="${OFD_NS}"><!--pad--></ofd:Page>`
      );
      for (let i = 0; i < 10000; i++) {
        zip.file(`filler/file_${i}.txt`, 'x');
      }
      const buffer = await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'STORE'
      });

      await expect(readOfdFile({ buffer, encoding: '', extension: 'ofd' })).rejects.toThrow(
        CommonErrEnum.officeConversionFailed
      );
    },
    LONG_TEST_TIMEOUT
  );

  it(
    '单个 XML 解压后超过 10MiB 时拒绝',
    async () => {
      const zip = new JSZip();
      zip.file(
        'OFD.xml',
        `<?xml version="1.0" encoding="UTF-8"?>
<ofd:OFD xmlns:ofd="${OFD_NS}"><ofd:DocBody><ofd:DocRoot>Doc_0/Document.xml</ofd:DocRoot></ofd:DocBody></ofd:OFD>`
      );
      zip.file(
        'Doc_0/Document.xml',
        `<?xml version="1.0" encoding="UTF-8"?>
<ofd:Document xmlns:ofd="${OFD_NS}"><ofd:Pages><ofd:Page/></ofd:Pages></ofd:Document>`
      );
      zip.file('Doc_0/Pages/Page_0/Content.xml', 'x'.repeat(10 * MIB + 1));
      const buffer = await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'STORE'
      });

      await expect(readOfdFile({ buffer, encoding: '', extension: 'ofd' })).rejects.toThrow(
        CommonErrEnum.officeConversionFailed
      );
    },
    LONG_TEST_TIMEOUT
  );

  it(
    '所有待解析 XML 累计解压超过 100MiB 时拒绝',
    async () => {
      // 每页 9.8MB：前 10 页累计 98MB < 100MiB 逐页通过，第 11 页触发累计上限
      const buffer = await createPaddedPagesOfd(9_800_000, 11);

      await expect(readOfdFile({ buffer, encoding: '', extension: 'ofd' })).rejects.toThrow(
        CommonErrEnum.officeConversionFailed
      );
    },
    LONG_TEST_TIMEOUT
  );
});
