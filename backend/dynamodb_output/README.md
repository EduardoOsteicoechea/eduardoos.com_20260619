# Publicar el pack Latino limpio (Barth/Niesel) en S3

## Contenido

- `website_assets/index.json` — índice (`sectionCount=81`, readiness sha).
- `website_assets/sections/0001.json` … `0081.json` — Capita + Praefatio.
- Fuente: Barth/Niesel Latin 1559 (calvin.reformation.nl), **no** ABBYY OCR.

Readiness:

- `sectionCount === 81`
- `sourceSha256 === 162390b53e8173f25b7b94caa2dd5002d874c1071497a944a4232b793a0921f2`

## Subir a S3 (reemplaza el OCR viejo)

Desde esta carpeta (requiere credenciales AWS en el environment / perfil):

```powershell
python upload_clean_to_s3.py --delete --dry-run
python upload_clean_to_s3.py --delete
```

Por defecto usa el `s3-config.json` del pack en Downloads (`bucket=eduardoos20260607`, `prefix=calvin-institutes`).

API pública (`Cache-Control: no-store` en index):

- `GET /api/latin/calvins-institutes`
- `GET /api/latin/calvins-institutes/sections/{id}`

Página: `/latin/calvins-institutes`

Tras el sync: hard-refresh del navegador.
