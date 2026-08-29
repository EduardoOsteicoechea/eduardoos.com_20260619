#!/usr/bin/env python3
"""Default BIM runtime hello — prints greeting and BIM_IFC_ARGS (spec 037)."""

from __future__ import annotations

import json
import os
import sys

print("hello world")
print("bim_runtime:", os.environ.get("BIM_RUNTIME_ROOT", ""))
raw = os.environ.get("BIM_IFC_ARGS", "{}")
try:
    args = json.loads(raw)
except json.JSONDecodeError:
    args = {"raw": raw}
print("ifc_args:", json.dumps(args, ensure_ascii=False))
sys.stdout.flush()
