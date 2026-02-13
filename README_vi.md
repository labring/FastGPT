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

FastGPT là nền tảng xây dựng AI Agent cung cấp khả năng sẵn sàng sử dụng cho xử lý dữ liệu và gọi mô hình. Ngoài ra, bạn có thể điều phối workflow thông qua trực quan hóa Flow để đạt được các kịch bản ứng dụng phức tạp!

</div>

<p align="center">
  <a href="https://fastgpt.io/">
    <img height="21" src="https://img.shields.io/badge/在线使用-d4eaf7?style=flat-square&logo=spoj&logoColor=7d09f1" alt="cloud">
  </a>
  <a href="https://doc.fastgpt.io/docs/introduction">
    <img height="21" src="https://img.shields.io/badge/相关文档-7d09f1?style=flat-square" alt="document">
  </a>
  <a href="https://doc.fastgpt.io/docs/introduction/development/intro">
    <img height="21" src="https://img.shields.io/badge/本地开发-%23d4eaf7?style=flat-square&logo=xcode&logoColor=7d09f1" alt="development">
  </a>
  <a href="/#-相关项目">
    <img height="21" src="https://img.shields.io/badge/相关项目-7d09f1?style=flat-square" alt="project">
  </a>
</p>

https://github.com/labring/FastGPT/assets/15308462/7d3a38df-eb0e-4388-9250-2409bd33f6d4

## Bắt Đầu Nhanh

Bạn có thể khởi động FastGPT nhanh chóng bằng Docker. Chạy lệnh sau trong terminal và làm theo hướng dẫn để tải cấu hình.

```bash
# Chạy lệnh để tải file cấu hình
bash <(curl -fsSL https://doc.fastgpt.cn/deploy/install.sh)
# Khởi động dịch vụ
docker compose up -d
```

Sau khi khởi động hoàn tất, bạn có thể truy cập FastGPT tại `http://localhost:3000`. Tài khoản mặc định là `root` và mật khẩu là `1234`.

Nếu bạn gặp vấn đề, bạn có thể [xem hướng dẫn triển khai Docker đầy đủ](https://doc.fastgpt.io/docs/introduction/development/docker)

## 🛸 Cách Sử Dụng

- **Phiên Bản Đám Mây**  
  Nếu bạn không cần triển khai riêng, bạn có thể sử dụng phiên bản dịch vụ đám mây của chúng tôi tại: [fastgpt.io](https://fastgpt.io/)

- **Phiên Bản Tự Host Cộng Đồng**  
  Bạn có thể triển khai nhanh chóng bằng [Docker](https://doc.fastgpt.io/docs/introduction/development/docker) hoặc sử dụng [Sealos Cloud](https://doc.fastgpt.io/docs/introduction/development/sealos) để triển khai FastGPT bằng một cú nhấp chuột.

- **Phiên Bản Thương Mại**  
  Nếu bạn cần các tính năng đầy đủ hơn hoặc hỗ trợ dịch vụ chuyên sâu, bạn có thể chọn [Phiên Bản Thương Mại](https://doc.fastgpt.io/docs/introduction/commercial). Ngoài việc cung cấp phần mềm đầy đủ, chúng tôi còn cung cấp hướng dẫn triển khai cho các kịch bản cụ thể. Bạn có thể gửi [tư vấn thương mại](https://fael3z0zfze.feishu.cn/share/base/form/shrcnjJWtKqjOI9NbQTzhNyzljc).

## 💡 Tính Năng Cốt Lõi

|                                    |                                    |
| ---------------------------------- | ---------------------------------- |
| ![Demo](./.github/imgs/intro1.png) | ![Demo](./.github/imgs/intro2.jpg) |
| ![Demo](./.github/imgs/intro3.png) | ![Demo](./.github/imgs/intro4.png) |

`1` Khả Năng Điều Phối Ứng Dụng
   - [x] Chế độ Agent lập kế hoạch.
   - [x] Workflow hội thoại, workflow plugin, bao gồm các node RPA cơ bản.
   - [x] Tương tác người dùng
   - [x] MCP hai chiều
   - [ ] Assisted workflow generation

`2` Khả Năng Gỡ Lỗi Ứng Dụng
   - [x] Kiểm tra tìm kiếm điểm đơn trong cơ sở kiến thức
   - [x] Phản hồi tham chiếu trong hội thoại với khả năng chỉnh sửa và xóa
   - [x] Nhật ký chuỗi gọi đầy đủ
   - [x] Đánh giá ứng dụng
   - [ ] Chế độ debug DeBug điều phối nâng cao
   - [ ] Nhật ký node ứng dụng

`3` Khả Năng Cơ Sở Kiến Thức
   - [x] Tái sử dụng và kết hợp nhiều cơ sở dữ liệu
   - [x] Sửa đổi và xóa bản ghi chunk
   - [x] Hỗ trợ nhập liệu thủ công, phân đoạn trực tiếp, nhập QA tách
   - [x] Hỗ trợ txt, md, html, pdf, docx, pptx, csv, xlsx (thêm qua PR), hỗ trợ đọc URL và nhập hàng loạt CSV
   - [x] Hybrid retrieval & reranking
   - [x] Cơ sở kiến thức API
   - [ ] Hot-swapping module RAG

`4` Giao Diện OpenAPI
   - [x] Giao diện completions (tương thích với chế độ chat GPT)
   - [x] CRUD cơ sở kiến thức
   - [x] CRUD hội thoại
   - [x] Giao diện OpenAPI tự động

`5` Khả Năng Vận Hành
   - [x] Chia sẻ không cần đăng nhập
   - [x] Nhúng Iframe một cú nhấp chuột
   - [x] Xem lại nhật ký hội thoại tập trung với chú thích dữ liệu
   - [x] Nhật ký vận hành ứng dụng

`6` Khác
   - [x] Cấu hình mô hình trực quan.
   - [x] Hỗ trợ nhập liệu và xuất giọng nói (có thể cấu hình)
   - [x] Gợi ý nhập liệu mờ
   - [x] Chợ template

<a href="#readme">
    <img src="https://img.shields.io/badge/-返回顶部-7d09f1.svg" alt="#" align="right">
</a>

## 💪 Dự Án & Liên Kết Của Chúng Tôi

- [Bắt Đầu - Phát Triển Địa Phương](https://doc.fastgpt.io/docs/introduction/development/intro/)
- [Tài Liệu OpenAPI](https://doc.fastgpt.io/docs/openapi/intro)
- [FastGPT-plugin](https://github.com/labring/fastgpt-plugin)
- [AI Proxy: Dịch Vụ Cân Bằng Tải Tổng Hợp Mô Hình](https://github.com/labring/aiproxy)
- [Laf: Truy Cập Nhanh 3 Phút vào Ứng Dụng Bên Thứ Ba](https://github.com/labring/laf)
- [Sealos: Triển Khai Nhanh Ứng Dụng Cụm](https://github.com/labring/sealos)

<a href="#readme">
    <img src="https://img.shields.io/badge/-返回顶部-7d09f1.svg" alt="#" align="right">
</a>

## 🌿 Hệ Sinh Thái Bên Thứ Ba

- [AI Proxy: Dịch Vụ Tổng Hợp Mô Hình Lớn](https://sealos.run/aiproxy/?k=fastgpt-github/)
- [SiliconCloud - Nền Tảng Trải Nghiệm Mô Hình Nguồn Mở Trực Tuyến](https://cloud.siliconflow.cn/i/TR9Ym0c4)
- [PPIO: Gọi API Mô Hình Nguồn Mở Tiết Kiệm và GPU Container](https://ppinfra.com/user/register?invited_by=VITYVU&utm_source=github_fastgpt)

<a href="#readme">
    <img src="https://img.shields.io/badge/-返回顶部-7d09f1.svg" alt="#" align="right">
</a>

## 🏘️ Cộng Đồng

Tham gia nhóm Feishu của chúng tôi:

![](https://oss.laf.run/otnvvf-imgs/fastgpt-feishu2.png)

<a href="#readme">
    <img src="https://img.shields.io/badge/-返回顶部-7d09f1.svg" alt="#" align="right">
</a>

## 🤝 Đóng Góp

Chúng tôi rất hoan nghênh đóng góp dưới mọi hình thức. Nếu bạn quan tâm đến việc đóng góp mã, hãy xem [Issues GitHub](https://github.com/labring/FastGPT/issues?q=is%3Aissue+is%3Aopen+sort%3Aupdated-desc) của chúng tôi và cho chúng tôi thấy ý tưởng tuyệt vời của bạn!

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
    <img src="https://img.shields.io/badge/-返回顶部-7d09f1.svg" alt="#" align="right">
</a>

## Giấy Phép

Kho này tuân thủ [FastGPT Open Source License](./LICENSE) giấy phép mã nguồn mở.

1. Cho phép sử dụng thương mại như dịch vụ backend, nhưng không cho phép cung cấp dịch vụ SaaS.
2. Bất kỳ dịch vụ thương mại nào không có giấy phép thương mại phải giữ lại thông tin bản quyền liên quan.
3. Xem [FastGPT Open Source License](./LICENSE) đầy đủ.
4. Liên hệ: Dennis@sealos.io, [Xem Giá Thương Mại](https://doc.fastgpt.io/docs/introduction/commercial/)
