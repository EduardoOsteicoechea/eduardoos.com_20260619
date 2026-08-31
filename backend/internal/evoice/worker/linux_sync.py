#!/usr/bin/env python3
"""Linux eVoice sync: docs/ → audios/*.mp3 via Piper or espeak-ng + ffmpeg.

Usage:
  python3 linux_sync.py --project-dir /tmp/evoice-jobs/<id>/project

Emits progress lines and a final STATS docs=N generated=N skipped=N failed=N.
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

DOC_EXTENSIONS = {
    ".docx",
    ".txt",
    ".pdf",
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".tif",
    ".tiff",
    ".bmp",
    ".gif",
}
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff", ".bmp", ".gif"}


def log(msg: str) -> None:
    print(msg, flush=True)


def needs_regen(doc: Path, mp3: Path) -> bool:
    if not mp3.is_file():
        return True
    return doc.stat().st_mtime > mp3.stat().st_mtime


def extract_txt(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


def extract_docx(path: Path) -> str:
    from docx import Document

    doc = Document(str(path))
    parts: list[str] = []
    for para in doc.paragraphs:
        text = para.text.strip()
        if text:
            parts.append(text)
    for table in doc.tables:
        for row in table.rows:
            cells = [c.text.strip() for c in row.cells if c.text.strip()]
            if cells:
                parts.append(". ".join(cells))
    return "\n\n".join(parts)


def extract_pdf(path: Path) -> str:
    from pypdf import PdfReader

    reader = PdfReader(str(path))
    parts: list[str] = []
    for page in reader.pages:
        text = (page.extract_text() or "").strip()
        if text:
            parts.append(text)
    return "\n\n".join(parts)


def extract_image(path: Path) -> str:
    import pytesseract
    from PIL import Image, ImageEnhance, ImageOps

    image = Image.open(path).convert("RGB")
    w, h = image.size
    if max(w, h) < 2500:
        image = image.resize((w * 2, h * 2), Image.Resampling.LANCZOS)
    gray = ImageOps.autocontrast(ImageOps.grayscale(image))
    gray = ImageEnhance.Contrast(gray).enhance(1.4)
    return pytesseract.image_to_string(gray, lang="spa+eng").strip()


def load_doc_text(path: Path) -> str:
    ext = path.suffix.lower()
    if ext == ".txt":
        return extract_txt(path)
    if ext == ".docx":
        return extract_docx(path)
    if ext == ".pdf":
        return extract_pdf(path)
    if ext in IMAGE_EXTENSIONS:
        return extract_image(path)
    raise ValueError(f"unsupported extension: {ext}")


def find_ffmpeg() -> str:
    which = shutil.which("ffmpeg")
    if not which:
        raise FileNotFoundError("ffmpeg not found on PATH")
    return which


def text_to_wav_piper(text: str, wav_path: Path) -> None:
    piper = shutil.which("piper")
    if not piper:
        raise FileNotFoundError("piper not found")
    model = Path(__file__).resolve().parent / "models" / "es_ES-sharvard-medium.onnx"
    env_model = Path(__import__("os").environ.get("EVOICE_PIPER_MODEL", "")).expanduser()
    if env_model.is_file():
        model = env_model
    if not model.is_file():
        raise FileNotFoundError(f"piper model missing: {model}")
    proc = subprocess.run(
        [piper, "--model", str(model), "--output_file", str(wav_path)],
        input=text.encode("utf-8"),
        capture_output=True,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.decode("utf-8", errors="replace") or "piper failed")


def text_to_wav_espeak(text: str, wav_path: Path) -> None:
    espeak = shutil.which("espeak-ng") or shutil.which("espeak")
    if not espeak:
        raise FileNotFoundError("espeak-ng not found")
    proc = subprocess.run(
        [espeak, "-v", "es", "-w", str(wav_path), text],
        capture_output=True,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.decode("utf-8", errors="replace") or "espeak failed")


def wav_to_mp3(wav_path: Path, mp3_path: Path) -> None:
    ffmpeg = find_ffmpeg()
    proc = subprocess.run(
        [ffmpeg, "-y", "-i", str(wav_path), "-codec:a", "libmp3lame", "-qscale:a", "4", str(mp3_path)],
        capture_output=True,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.decode("utf-8", errors="replace")[-400:] or "ffmpeg failed")


def text_to_mp3(text: str, mp3_path: Path) -> None:
    text = text.strip()
    if not text:
        raise ValueError("empty text")
    with tempfile.TemporaryDirectory(prefix="evoice-tts-") as tmp:
        wav = Path(tmp) / "out.wav"
        try:
            text_to_wav_piper(text, wav)
            log("tts   piper")
        except Exception as piper_err:  # noqa: BLE001
            log(f"tts   piper unavailable ({piper_err}); trying espeak-ng")
            text_to_wav_espeak(text, wav)
            log("tts   espeak-ng")
        wav_to_mp3(wav, mp3_path)


def sync_project(project_dir: Path) -> dict[str, int]:
    docs_dir = project_dir / "docs"
    audios_dir = project_dir / "audios"
    audios_dir.mkdir(parents=True, exist_ok=True)
    docs = sorted(
        p
        for p in docs_dir.iterdir()
        if p.is_file() and p.name != ".keep" and p.suffix.lower() in DOC_EXTENSIONS
    )
    stats = {"docs": len(docs), "generated": 0, "skipped": 0, "failed": 0}
    if not docs:
        log("No convertible files in docs/")
        return stats
    for doc in docs:
        mp3 = audios_dir / f"{doc.stem}.mp3"
        if not needs_regen(doc, mp3):
            log(f"skip  {doc.name} (mp3 up to date)")
            stats["skipped"] += 1
            continue
        reason = "missing mp3" if not mp3.is_file() else "doc newer than mp3"
        log(f"gen   {doc.name} -> audios/{mp3.name} ({reason})")
        try:
            text = load_doc_text(doc)
            if not text.strip():
                raise ValueError("No readable text extracted")
            text_to_mp3(text, mp3)
            stats["generated"] += 1
        except Exception as exc:  # noqa: BLE001
            stats["failed"] += 1
            log(f"FAIL  {doc.name}: {exc}")
    return stats


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-dir", type=Path, required=True)
    args = parser.parse_args()
    project_dir = args.project_dir.resolve()
    if not (project_dir / "docs").is_dir():
        log(f"docs/ missing under {project_dir}")
        return 1
    stats = sync_project(project_dir)
    log(
        f"STATS docs={stats['docs']} generated={stats['generated']} "
        f"skipped={stats['skipped']} failed={stats['failed']}"
    )
    return 0 if stats["failed"] == 0 else 2


if __name__ == "__main__":
    sys.exit(main())
