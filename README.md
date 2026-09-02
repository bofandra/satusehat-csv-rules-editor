# SATUSEHAT CSV Rules Editor

Static web editor untuk CSV validation rules SATUSEHAT. Semua parsing, editing, validasi struktur, dan export CSV berjalan di browser. Tidak ada database, backend, atau Netlify Functions.

## Features

- Upload CSV rules sendiri.
- Load sample `validation_rules.csv` dari folder `public/samples`.
- Filter by resource, mandatory flag, issue status, dan keyword.
- Edit field dasar, `systems`, `additional_validation`, `conditional_systems`, dan nested path `path1` sampai `path5`.
- Tambah, duplicate, dan hapus row.
- Download CSV hasil edit dengan UTF-8 BOM agar lebih ramah dibuka di Excel.
- Preserve unknown extra columns dan original column order saat export.

## Local Development

```bash
npm install
npm run dev
```

## Checks

```bash
npm run test
npm run build
```

## Netlify

Project ini siap deploy sebagai static Vite app. `netlify.toml` sudah mengatur:

- build command: `npm run build`
- publish directory: `dist`
- SPA redirect: `/* -> /index.html`

Deploy bisa lewat Netlify UI dengan menghubungkan repo, atau lewat Netlify CLI jika tersedia.
