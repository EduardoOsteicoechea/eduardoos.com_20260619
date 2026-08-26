"""Upload website_assets to S3 with --delete semantics for the prefix."""

from __future__ import annotations

import argparse
import hashlib
import json
import mimetypes
from pathlib import Path

import boto3


ROOT = Path(__file__).resolve().parent
EXPECTED_SHA = "162390b53e8173f25b7b94caa2dd5002d874c1071497a944a4232b793a0921f2"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--config",
        default=str(
            Path(r"C:\Users\eduar\Downloads\Calvin's Institutes Latin\dynamodb_output\s3-config.json")
        ),
    )
    parser.add_argument("--assets", default=str(ROOT / "website_assets"))
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--delete", action="store_true", help="Delete remote keys not in local pack")
    args = parser.parse_args()

    config = json.loads(Path(args.config).read_text(encoding="utf-8"))
    bucket = config["bucket"]
    prefix = config.get("prefix", "calvin-institutes").strip("/")
    region = config.get("region", "us-east-1")
    assets = Path(args.assets)
    if not assets.exists():
        raise SystemExit(f"missing assets: {assets}")

    idx = json.loads((assets / "index.json").read_text(encoding="utf-8"))
    if idx.get("sourceSha256") != EXPECTED_SHA:
        raise SystemExit(f"refusing upload: local sha {idx.get('sourceSha256')} != {EXPECTED_SHA}")

    client = boto3.client("s3", region_name=region)
    local_keys: set[str] = set()
    uploaded = skipped = 0

    for path in sorted(p for p in assets.rglob("*") if p.is_file()):
        relative = path.relative_to(assets).as_posix()
        key = f"{prefix}/{relative}" if prefix else relative
        local_keys.add(key)
        digest = sha256(path)
        content_type = mimetypes.guess_type(path.name)[0] or "application/json"
        unchanged = False
        try:
            remote = client.head_object(Bucket=bucket, Key=key)
            unchanged = remote.get("Metadata", {}).get("sha256") == digest
        except Exception as error:
            code = getattr(error, "response", {}).get("Error", {}).get("Code")
            if code not in ("404", "NoSuchKey", "NotFound", 404):
                # head 404 often surfaces as ClientError 404
                if "404" not in str(error) and "Not Found" not in str(error):
                    raise
        if unchanged:
            skipped += 1
            print(f"[s3] unchanged s3://{bucket}/{key}")
            continue
        action = "would upload" if args.dry_run else "uploading"
        print(f"[s3] {action} s3://{bucket}/{key}")
        if not args.dry_run:
            cache_control = (
                "no-store" if relative == "index.json" else "public, max-age=300"
            )
            client.upload_file(
                str(path),
                bucket,
                key,
                ExtraArgs={
                    "ContentType": content_type,
                    "CacheControl": cache_control,
                    "Metadata": {"sha256": digest},
                },
            )
        uploaded += 1

    deleted = 0
    if args.delete:
        paginator = client.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=bucket, Prefix=prefix + "/"):
            for obj in page.get("Contents") or []:
                key = obj["Key"]
                if key in local_keys:
                    continue
                action = "would delete" if args.dry_run else "deleting"
                print(f"[s3] {action} s3://{bucket}/{key}")
                if not args.dry_run:
                    client.delete_object(Bucket=bucket, Key=key)
                deleted += 1

    print(
        f"[s3] complete: uploaded={uploaded}, unchanged={skipped}, deleted={deleted}, "
        f"dry_run={args.dry_run}"
    )


if __name__ == "__main__":
    main()
