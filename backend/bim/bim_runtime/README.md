# BIM Python runtime (spec 037)

Host-side working directory for admin `POST /api/bim/python/run`.

- The Go backend runs `python3` with **cwd** set here (override root with `BIM_RUNTIME_ROOT`).
- Scripts may create files under this tree (`jobs/`, `tmp/`, `out/`).
- Do not use this as a general EC2 admin shell. No Docker service is started for Python.

`hello_world.py` is the default when the request sends empty `code`.
