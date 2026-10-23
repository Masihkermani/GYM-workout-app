# Design preview

`daftar-preview.html` is a self-contained, clickable design preview of Daftar with sample data
(no server, no database). It is not the app; the app lives in `src/`.

- `docs/index.html` is the same file wrapped in a full HTML document so GitHub Pages can serve it.
  Rebuild it from the preview with `scripts/build-pages.sh` after changing the preview.
- Screens: `#landing`, `#book`, `#workout`, `#progress`, `#coach`, `#builder`.
