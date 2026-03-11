<div align="center">

<a href="https://fastgpt.io/"><img src="/.github/imgs/logo.svg" width="120" height="120" alt="fastgpt logo"></a>

# FastGPT

<p align="center">
  <a href="./README_en.md">English</a> |
  <a href="./README.md">简体中文</a> |
  <a href="./README_id.md">Bahasa Indonesia</a> |
  <a href="./README_th.md">ไทย</a> |
  <a href="./README_vi.md">Tiếng Việt</a> |
  <a href="./README_ja.md">日本語</a>
</p>

FastGPT เป็นแพลตฟอร์มสำหรับสร้าง AI Agent ที่มีความสามารถพร้อมใช้งานสำหรับการประมวลผลข้อมูลและการเรียกใช้โมเดล นอกจากนี้ยังสามารถจัดระเบียบ workflow ผ่านการแสดงภาพ Flow เพื่อให้บรรลุสถานการณ์การใช้งานที่ซับซ้อนได้!

</div>

<p align="center">
  <a href="https://fastgpt.io/">
    <img height="21" src="https://img.shields.io/badge/ใช้งานออนไลน์-d4eaf7?style=flat-square&logo=spoj&logoColor=7d09f1" alt="cloud">
  </a>
  <a href="https://doc.fastgpt.io/docs/introduction">
    <img height="21" src="https://img.shields.io/badge/เอกสาร-7d09f1?style=flat-square" alt="document">
  </a>
  <a href="https://doc.fastgpt.io/docs/self-host/dev">
    <img height="21" src="https://img.shields.io/badge/พัฒนาในเครื่อง-%23d4eaf7?style=flat-square&logo=xcode&logoColor=7d09f1" alt="development">
  </a>
  <a href="#-โปรเจกต์และลิงก์ของเรา">
    <img height="21" src="https://img.shields.io/badge/โปรเจกต์ที่เกี่ยวข้อง-7d09f1?style=flat-square" alt="project">
  </a>
</p>

https://github.com/labring/FastGPT/assets/15308462/7d3a38df-eb0e-4388-9250-2409bd33f6d4

## เริ่มต้นอย่างรวดเร็ว

คุณสามารถเริ่มต้น FastGPT ได้อย่างรวดเร็วโดยใช้ Docker รันคำสั่งต่อไปนี้ในเทอร์มินัลและทำตามคำแนะนำเพื่อดึงการกำหนดค่า

```bash
# รันคำสั่งเพื่อดึงไฟล์การกำหนดค่า
bash <(curl -fsSL https://doc.fastgpt.cn/deploy/install.sh)
# เริ่มบริการ
docker compose up -d
```

เมื่อเริ่มต้นสมบูรณ์แล้ว คุณสามารถเข้าถึง FastGPT ที่ `http://localhost:3000` บัญชีเริ่มต้นคือ `root` และรหัสผ่านคือ `1234`

หากคุณพบปัญหา คุณสามารถ [ดูบทแนะนำการติดตั้ง Docker ฉบับสมบูรณ์](https://doc.fastgpt.io/docs/self-host/deploy/docker)

## 🛸 วิธีการใช้งาน

- **เวอร์ชันคลาวด์**  
  หากคุณไม่ต้องการติดตั้งแบบส่วนตัว คุณสามารถใช้บริการคลาวด์ของเราได้โดยตรงที่: [fastgpt.io](https://fastgpt.io/)

- **เวอร์ชันโฮสต์ตัวเองของชุมชน**  
  คุณสามารถติดตั้งได้อย่างรวดเร็วโดยใช้ [Docker](https://doc.fastgpt.io/docs/self-host/deploy/docker) หรือใช้ [Sealos Cloud](https://doc.fastgpt.io/docs/self-host/deploy/sealos) เพื่อติดตั้ง FastGPT ด้วยคลิกเดียว

- **เวอร์ชันพาณิชย์**  
  หากคุณต้องการคุณสมบัติที่สมบูรณ์มากขึ้นหรือการสนับสนุนบริการเชิงลึก คุณสามารถเลือก [เวอร์ชันพาณิชย์](https://doc.fastgpt.io/docs/introduction/commercial) นอกจากการให้ซอฟต์แวร์ที่สมบูรณ์ เรายังให้คำแนะนำการนำไปใช้สำหรับสถานการณ์เฉพาะ คุณสามารถส่ง[ปรึกษาธุรกิจ](https://fael3z0zfze.feishu.cn/share/base/form/shrcnjJWtKqjOI9NbQTzhNyzljc)

## 💡 คุณสมบัติหลัก

|                                    |                                    |
| ---------------------------------- | ---------------------------------- |
| ![Demo](./.github/imgs/intro1.png) | ![Demo](./.github/imgs/intro2.jpg) |
| ![Demo](./.github/imgs/intro3.png) | ![Demo](./.github/imgs/intro4.png) |

`1` ความสามารถในการจัดระเบียบแอปพลิเคชัน
   - [x] โหมด Agent วางแผน
   - [x] Workflow สนทนา, workflow ปลั๊กอิน, รวมถึงโหนด RPA พื้นฐาน
   - [x] การโต้ตอบกับผู้ใช้
   - [x] MCP สองทิศทาง
   - [ ] สร้าง workflow อัตโนมัติ

`2` ความสามารถในการดีบักแอปพลิเคชัน
   - [x] การทดสอบการค้นหาฐานความรู้แบบจุดเดียว
   - [x] ข้อมูลอ้างอิงระหว่างการสนทนาพร้อมความสามารถในการแก้ไขและลบ
   - [x] บันทึกห่วงโซ่การเรียกใช้แบบสมบูรณ์
   - [x] การประเมินแอปพลิเคชัน
   - [ ] โหมดดีบัก DeBug การจัดระเบียบขั้นสูง
   - [ ] บันทึกโหนดแอปพลิเคชัน

`3` ความสามารถของฐานความรู้
   - [x] การใช้ฐานข้อมูลหลายฐานซ้ำและผสม
   - [x] การแก้ไขและลบบันทึก chunk
   - [x] รองรับการป้อนข้อมูลด้วยตนเอง การแบ่งส่วนโดยตรง การนำเข้า QA แบบแยก
   - [x] รองรับ txt, md, html, pdf, docx, pptx, csv, xlsx (เพิ่มเติมได้โดย PR), รองรับการอ่าน URL และการนำเข้า CSV จำนวนมาก
   - [x] การค้นหาแบบผสมและการจัดอันดับใหม่
   - [x] ฐานความรู้ API
   - [ ] การสลับโมดูล RAG แบบร้อน

`4` อินเทอร์เฟซ OpenAPI
   - [x] อินเทอร์เฟซ completions (สอดคล้องกับโหมดแชท GPT)
   - [x] CRUD ฐานความรู้
   - [x] CRUD การสนทนา
   - [x] อินเทอร์เฟซ OpenAPI อัตโนมัติ

`5` ความสามารถในการดำเนินงาน
   - [x] หน้าต่างแชร์โดยไม่ต้องเข้าสู่ระบบ
   - [x] การฝัง Iframe คลิกเดียว
   - [x] การตรวจสอบบันทึกการสนทนาแบบรวมพร้อมการใส่คำอธิบายข้อมูล
   - [x] บันทึกการดำเนินงานแอปพลิเคชัน

`6` อื่นๆ
   - [x] การกำหนดค่าโมเดลแบบภาพ
   - [x] รองรับการป้อนเสียงและเอาต์พุต (กำหนดค่าได้)
   - [x] คำแนะนำการป้อนข้อมูลแบบคลุมเครือ
   - [x] ตลาดเทมเพลต

<a href="#readme">
    <img src="https://img.shields.io/badge/-กลับด้านบน-7d09f1.svg" alt="#" align="right">
</a>

## 💪 โปรเจกต์และลิงก์ของเรา

- [เริ่มต้นพัฒนาในเครื่อง](https://doc.fastgpt.io/docs/self-host/dev/)
- [เอกสาร OpenAPI](https://doc.fastgpt.io/docs/openapi/intro)
- [FastGPT-plugin](https://github.com/labring/fastgpt-plugin)
- [AI Proxy: บริการ Load Balancing การรวมโมเดล](https://github.com/labring/aiproxy)
- [Laf: เข้าถึงแอปพลิเคชันของบุคคลที่สามใน 3 นาที](https://github.com/labring/laf)
- [Sealos: การติดตั้งแอปพลิเคชันคลัสเตอร์อย่างรวดเร็ว](https://github.com/labring/sealos)

<a href="#readme">
    <img src="https://img.shields.io/badge/-กลับด้านบน-7d09f1.svg" alt="#" align="right">
</a>

## 🌿 ระบบนิเวศของบุคคลที่สาม

- [AI Proxy: บริการรวมโมเดลขนาดใหญ่](https://sealos.run/aiproxy/?k=fastgpt-github/)
- [SiliconCloud - แพลตฟอร์มประสบการณ์โมเดล Open Source ออนไลน์](https://cloud.siliconflow.cn/i/TR9Ym0c4)
- [PPIO: เรียกใช้ API โมเดล Open Source ราคาประหยัดและ GPU Container](https://ppinfra.com/user/register?invited_by=VITYVU&utm_source=github_fastgpt)

<a href="#readme">
    <img src="https://img.shields.io/badge/-กลับด้านบน-7d09f1.svg" alt="#" align="right">
</a>

## 🏘️ ชุมชน

เข้าร่วมกลุ่ม Feishu ของเรา:

![](https://oss.laf.run/otnvvf-imgs/fastgpt-feishu2.png)

<a href="#readme">
    <img src="https://img.shields.io/badge/-กลับด้านบน-7d09f1.svg" alt="#" align="right">
</a>

## 🤝 ผู้มีส่วนร่วม

เรายินดีต้อนรับการมีส่วนร่วมในรูปแบบต่างๆ หากคุณสนใจการมีส่วนร่วมในโค้ด ดู [Issues บน GitHub](https://github.com/labring/FastGPT/issues?q=is%3Aissue+is%3Aopen+sort%3Aupdated-desc) ของเราและแสดงความคิดที่ยอดเยี่ยมของคุณ!

<a href="https://github.com/labring/FastGPT/graphs/contributors" target="_blank">
  <table>
    <tr>
      <th colspan="2">
        <br><img src="https://contrib.rocks/image?repo=labring/FastGPT"><br><br>
      </th>
    </tr>
    <tr>
      <td>
        <picture>
          <source media="(prefers-color-scheme: dark)" srcset="https://next.ossinsight.io/widgets/official/compose-org-active-contributors/thumbnail.png?activity=active&period=past_28_days&owner_id=102226726&repo_ids=605673387&image_size=2x3&color_scheme=dark">
          <img alt="Active participants of labring - past 28 days" src="https://next.ossinsight.io/widgets/official/compose-org-active-contributors/thumbnail.png?activity=active&period=past_28_days&owner_id=102226726&repo_ids=605673387&image_size=2x3&color_scheme=light">
        </picture>
      </td>
      <td rowspan="2">
        <picture>
          <source media="(prefers-color-scheme: dark)" srcset="https://next.ossinsight.io/widgets/official/compose-org-participants-growth/thumbnail.png?activity=new&period=past_28_days&owner_id=102226726&repo_ids=605673387&image_size=4x7&color_scheme=dark">
            <img alt="New trends of labring" src="https://next.ossinsight.io/widgets/official/compose-org-participants-growth/thumbnail.png?activity=new&period=past_28_days&owner_id=102226726&repo_ids=605673387&image_size=4x7&color_scheme=light">
        </picture>
      </td>
    </tr>
    <tr>
      <td>
        <picture>
          <source media="(prefers-color-scheme: dark)" srcset="https://next.ossinsight.io/widgets/official/compose-org-active-contributors/thumbnail.png?activity=new&period=past_28_days&owner_id=102226726&repo_ids=605673387&image_size=2x3&color_scheme=dark">
            <img alt="New participants of labring - past 28 days" src="https://next.ossinsight.io/widgets/official/compose-org-active-contributors/thumbnail.png?activity=new&period=past_28_days&owner_id=102226726&repo_ids=605673387&image_size=2x3&color_scheme=light">
        </picture>
      </td>
    </tr>
  </table>
</a>

## 🌟 Star History

<a href="https://github.com/labring/FastGPT/stargazers" target="_blank" style="display: block" align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=labring/FastGPT&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=labring/FastGPT&type=Date" />
    <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=labring/FastGPT&type=Date" />
  </picture>
</a>

<a href="#readme">
    <img src="https://img.shields.io/badge/-กลับด้านบน-7d09f1.svg" alt="#" align="right">
</a>

## ใบอนุญาต

ที่เก็บนี้ปฏิบัติตาม [FastGPT Open Source License](./LICENSE)

1. อนุญาตให้ใช้เชิงพาณิชย์เป็นบริการแบ็กเอนด์ แต่ไม่อนุญาตให้ให้บริการ SaaS
2. บริการเชิงพาณิชย์ใดๆ ที่ไม่มีการอนุญาตเชิงพาณิชย์ต้องเก็บข้อมูลลิขสิทธิ์ที่เกี่ยวข้องไว้
3. โปรดดู [FastGPT Open Source License](./LICENSE) สำหรับรายละเอียดฉบับเต็ม
4. ติดต่อ: Dennis@sealos.io, [ดูราคาพาณิชย์](https://doc.fastgpt.io/docs/introduction/commercial/)
