"""Idempotently upload website_assets/ to Amazon S3 using SHA-256 metadata."""

import argparse
import hashlib
import json
import mimetypes
import os
from pathlib import Path

import boto3


ROOT = Path(__file__).resolve().parent


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=str(ROOT / "s3-config.json"))
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    config = json.loads(Path(args.config).read_text(encoding="utf-8"))
    bucket = config["bucket"]
    prefix = config.get("prefix", "").strip("/")
    region = config.get("region")
    assets = ROOT / "website_assets"
    if not assets.exists():
        raise FileNotFoundError(
            f"{assets} does not exist; run prepare_web_assets.py first"
        )
    client = boto3.client("s3", region_name=region)
    uploaded = skipped = 0

    for path in sorted(p for p in assets.rglob("*") if p.is_file()):
        relative = path.relative_to(assets).as_posix()
        key = f"{prefix}/{relative}" if prefix else relative
        digest = sha256(path)
        content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        try:
            remote = client.head_object(Bucket=bucket, Key=key)
            unchanged = remote.get("Metadata", {}).get("sha256") == digest
        except client.exceptions.NoSuchKey:
            unchanged = False
        except Exception as error:
            if getattr(error, "response", {}).get("Error", {}).get("Code") in ("404", "NoSuchKey"):
                unchanged = False
            else:
                raise
        if unchanged:
            skipped += 1
            print(f"[s3] unchanged s3://{bucket}/{key}")
            continue
        print(f"[s3] {'would upload' if args.dry_run else 'uploading'} s3://{bucket}/{key}")
        if not args.dry_run:
            cache_control = (
                "no-cache" if relative == "index.json"
                else "public,max-age=31536000,immutable"
            )
            client.upload_file(
                str(path), bucket, key,
                ExtraArgs={
                    "ContentType": content_type,
                    "CacheControl": cache_control,
                    "Metadata": {"sha256": digest},
                },
            )
        uploaded += 1
    print(f"[s3] complete: uploaded={uploaded}, unchanged={skipped}")


if __name__ == "__main__":
    main()
