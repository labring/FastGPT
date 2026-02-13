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

FastGPT adalah platform pembangunan AI Agent yang menyediakan kemampuan siap pakai untuk pemrosesan data dan pemanggilan model. Selain itu, Anda dapat mengorkestrasi alur kerja melalui visualisasi Flow untuk mencapai skenario aplikasi yang kompleks!

</div>

<p align="center">
  <a href="https://fastgpt.io/">
    <img height="21" src="https://img.shields.io/badge/Gunakan_Online-d4eaf7?style=flat-square&logo=spoj&logoColor=7d09f1" alt="cloud">
  </a>
  <a href="https://doc.fastgpt.io/docs/introduction">
    <img height="21" src="https://img.shields.io/badge/Dokumentasi-7d09f1?style=flat-square" alt="document">
  </a>
  <a href="https://doc.fastgpt.io/docs/introduction/development/intro">
    <img height="21" src="https://img.shields.io/badge/Pengembangan_Lokal-%23d4eaf7?style=flat-square&logo=xcode&logoColor=7d09f1" alt="development">
  </a>
  <a href="/#-%E7%9B%B8%E5%85%B3%E9%A1%B9%E7%9B%AE">
    <img height="21" src="https://img.shields.io/badge/Proyek_Terkait-7d09f1?style=flat-square" alt="project">
  </a>
</p>

https://github.com/labring/FastGPT/assets/15308462/7d3a38df-eb0e-4388-9250-2409bd33f6d4

## Mulai Cepat

Anda dapat memulai FastGPT dengan cepat menggunakan Docker. Jalankan perintah berikut di terminal dan ikuti panduan untuk menarik konfigurasi:

```bash
# Jalankan perintah untuk menarik file konfigurasi
bash <(curl -fsSL https://doc.fastgpt.cn/deploy/install.sh)
# Jalankan layanan
docker compose up -d
```

Setelah sepenuhnya aktif, Anda dapat mengakses FastGPT di `http://localhost:3000`. Akun default adalah `root` dan kata sandinya adalah `1234`.

Jika Anda menghadapi masalah, Anda dapat [melihat tutorial penyebaran Docker lengkap](https://doc.fastgpt.io/docs/introduction/development/docker)

## 🛸 Cara Penggunaan

- **Versi Cloud**  
  Jika Anda tidak memerlukan penyebaran privat, Anda dapat menggunakan versi layanan cloud kami di: [fastgpt.io](https://fastgpt.io/)

- **Versi Self-Hosted Komunitas**  
  Anda dapat penyebaran dengan cepat menggunakan [Docker](https://doc.fastgpt.io/docs/introduction/development/docker) atau menggunakan [Sealos Cloud](https://doc.fastgpt.io/docs/introduction/development/sealos) untuk penerapan satu klik FastGPT.

- **Versi Komersial**  
  Jika Anda membutuhkan fitur yang lebih lengkap atau dukungan layanan mendalam, Anda dapat memilih [Versi Komersial](https://doc.fastgpt.io/docs/introduction/commercial). Selain menyediakan perangkat lunak lengkap, kami juga menyediakan panduan implementasi untuk skenario tertentu. Anda dapat mengirimkan [konsultasi komersial](https://fael3z0zfze.feishu.cn/share/base/form/shrcnjJWtKqjOI9NbQTzhNyzljc).

## 💡 Fitur Inti

|                                    |                                    |
| ---------------------------------- | ---------------------------------- |
| ![Demo](./.github/imgs/intro1.png) | ![Demo](./.github/imgs/intro2.jpg) |
| ![Demo](./.github/imgs/intro3.png) | ![Demo](./.github/imgs/intro4.png) |

`1` Kemampuan Orkestrasi Aplikasi
   - [x] Mode Agent Perencanaan.
   - [x] Alur kerja percakapan, alur kerja plugin, termasuk node RPA dasar.
   - [x] Interaksi pengguna
   - [x] MCP dua arah
   - [ ] Assisted workflow generation

`2` Kemampuan Debugging Aplikasi
   - [x] Pengujian pencarian satu titik basis pengetahuan
   - [x] Umpan balik referensi selama percakapan dengan kemampuan edit dan hapus
   - [x] Log rantai panggilan lengkap
   - [x] Evaluasi aplikasi
   - [ ] Mode debug DeBug orkestrasi lanjutan
   - [ ] Log node aplikasi

`3` Kemampuan Basis Pengetahuan
   - [x] Penggunaan ulang dan pencampuran multi-database
   - [x] Modifikasi dan penghapusan rekaman chunk
   - [x] Dukungan input manual, segmentasi langsung, impor QA split
   - [x] Dukungan txt, md, html, pdf, docx, pptx, csv, xlsx (lebih banyak dapat di-PR), dukungan pembacaan URL dan impor batch CSV
   - [x] Hybrid retrieval & reranking
   - [x] Basis pengetahuan API
   - [ ] Hot-swapping modul RAG

`4` Antarmuka OpenAPI
   - [x] Antarmuka completions (sesuai dengan mode chat GPT)
   - [x] CRUD basis pengetahuan
   - [x] CRUD percakapan
   - [x] Antarmuka OpenAPI otomatis

`5` Kemampuan Operasi
   - [x] Jendela berbagi tanpa login
   - [x] Embedding Iframe satu klik
   - [x] Tinjauan catatan percakapan terpadu dengan anotasi data
   - [x] Log operasi aplikasi

`6` Lainnya
   - [x] Konfigurasi model visual.
   - [x] Dukungan input dan output suara (dapat dikonfigurasi)
   - [x] Hint input fuzzy
   - [x] Pasar template

<a href="#readme">
    <img src="https://img.shields.io/badge/-Kembali_ke_Atas-7d09f1.svg" alt="#" align="right">
</a>

## 💪 Proyek & Tautan Kami

- [Mulai Cepat Pengembangan Lokal](https://doc.fastgpt.io/docs/introduction/development/intro/)
- [Dokumentasi OpenAPI](https://doc.fastgpt.io/docs/openapi/intro)
- [FastGPT-plugin](https://github.com/labring/fastgpt-plugin)
- [AI Proxy: Layanan Load Balancing Agregasi Model](https://github.com/labring/aiproxy)
- [Laf: Akses Cepat 3 Menit ke Aplikasi Pihak Ketiga](https://github.com/labring/laf)
- [Sealos: Penerapan Cepat Aplikasi Klaster](https://github.com/labring/sealos)

<a href="#readme">
    <img src="https://img.shields.io/badge/-Kembali_ke_Atas-7d09f1.svg" alt="#" align="right">
</a>

## 🌿 Ekosistem Pihak Ketiga

- [AI Proxy: Layanan Agregasi Model Besar](https://sealos.run/aiproxy/?k=fastgpt-github/)
- [SiliconCloud - Platform Pengalaman Online Model Open Source](https://cloud.siliconflow.cn/i/TR9Ym0c4)
- [PPIO: Panggilan Satu Klik ke API Model Open Source Hemat GPU](https://ppinfra.com/user/register?invited_by=VITYVU&utm_source=github_fastgpt)

<a href="#readme">
    <img src="https://img.shields.io/badge/-Kembali_ke_Atas-7d09f1.svg" alt="#" align="right">
</a>

## 🏘️ Komunitas

Bergabung dengan grup Feishu kami:

![](https://oss.laf.run/otnvvf-imgs/fastgpt-feishu2.png)

<a href="#readme">
    <img src="img src="https://img.shields.io/badge/-Kembali_ke_Atas-7d09f1.svg" alt="#" align="right">
</a>

## 🤝 Kontributor

Kami sangat menyambut kontribusi dalam berbagai bentuk. Jika Anda tertarik berkontribusi kode, lihat [Issues GitHub](https://github.com/labring/FastGPT/issues?q=is%3Aissue+is%3Aopen+sort%3Aupdated-desc) kami dan tunjukkan ide brilian Anda!

<a href="https://github.com/labring/FastGPT/graphs/contributors" target="_blank">
  <table>
    <tr>
      <th colspan="2">
        <br><img src="https://contrib.rocks/image?repo=labring/FastGPT"><br><br>
      </th>
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
    <img src="https://img.shields.io/badge/-Kembali_ke_Atas-7d09f1.svg" alt="#" align="right">
</a>

## Lisensi

Repositori ini mengikuti [FastGPT Open Source License](./LICENSE).

1. Penggunaan komersial sebagai layanan backend diperbolehkan, tetapi layanan SaaS tidak diperbolehkan.
2. Setiap layanan komersial tanpa otorisasi komersial harus mempertahankan informasi hak cipta yang relevan.
3. Silakan lihat [FastGPT Open Source License](./LICENSE) untuk lengkapnya.
4. Kontak: Dennis@sealos.io, [Lihat Harga Komersial](https://doc.fastgpt.io/docs/introduction/commercial/)
