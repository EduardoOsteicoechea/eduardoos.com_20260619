# Publicar las secciones en S3

Esta carpeta es autocontenida. Produce archivos pequeños para el sitio web:

- `website_assets/index.json`: índice liviano para el sidebar.
- `website_assets/sections/0001.json`, etc.: una sección por archivo.
- `institutes_latin_sections.dynamodb.jsonl`: exportación nativa para DynamoDB.

## 1. Preparar los archivos web

Desde esta carpeta ejecuta:

```powershell
python prepare_web_assets.py
```

La operación es idempotente: si un archivo no cambió, no lo vuelve a escribir.

## 2. Configurar AWS sin guardar credenciales aquí

Instala AWS CLI y autentícate con un perfil o con IAM Identity Center:

```powershell
aws configure
aws sts get-caller-identity
```

También puedes usar `aws sso login --profile NOMBRE` y añadir
`--profile NOMBRE` a tus comandos AWS.

No guardes claves secretas en esta carpeta ni en `s3-config.json`.

## 3. Subir a S3

Opción recomendada, sin dependencia de Python:

```powershell
.\sync_to_s3.ps1 -Bucket "NOMBRE-REAL-DEL-BUCKET" -Prefix "calvin-institutes" -Region "us-east-1" -DryRun
.\sync_to_s3.ps1 -Bucket "NOMBRE-REAL-DEL-BUCKET" -Prefix "calvin-institutes" -Region "us-east-1"
```

`aws s3 sync` solo sube cambios y `--delete` elimina del prefijo los archivos
que ya no existen localmente. Revisa el primer comando con `-DryRun`.

Alternativa Python, que compara SHA-256 guardado en metadata S3:

```powershell
python -m pip install boto3
Copy-Item s3-config.example.json s3-config.json
# Edita s3-config.json con bucket, prefix y region.
python upload_to_s3.py --config s3-config.json --dry-run
python upload_to_s3.py --config s3-config.json
```

## 4. Configurar el sitio web (Eduardo OS)

Contenido en producción:

```text
s3://eduardoos20260607/calvin-institutes/index.json
s3://eduardoos20260607/calvin-institutes/sections/0001.json
```

Corpus: Latin-only 1559 (`institutiochrist1559calv_abbyy.xml`), 81 sections
(1 PRELIMINARY + 80 Capita). Readiness gate:

- `sectionCount === 81`
- `sourceSha256 === ecc221dfb9428e34de11e392df0711d96cf0333e5fbb5baa1a4a5e774309ccc8`

El frontend **no** lee S3 directamente. Usa la API pública (`Cache-Control: no-store`):

- `GET https://eduardoos.com/api/latin/calvins-institutes`
- `GET https://eduardoos.com/api/latin/calvins-institutes/sections/{id}`

Página: https://eduardoos.com/latin/calvins-institutes  
Menú: **Services Apps & Subscriptions** → **Calvin’s Institutes**

## 5. Actualizar después de cambiar el contenido

Siempre ejecuta, en este orden:

```powershell
python prepare_web_assets.py
python ..\verify_complete_content.py
.\sync_to_s3.ps1 -Bucket "NOMBRE-REAL-DEL-BUCKET"
```

El informe de integridad queda en `complete_content_report.json`. No publiques
si el verificador devuelve `FAIL`.

## Seguridad

El bucket debe permitir `s3:PutObject`, `s3:HeadObject` y, si se usa `--delete`,
`s3:DeleteObject` únicamente sobre el prefijo elegido. El navegador solo
necesita `s3:GetObject`; nunca pongas credenciales AWS en el frontend.
