# Milestone: APS Design Automation admin trigger — 2026-08-06
#
# Implemented on Go API gateway (no Node/Express in this repo):
# - POST /api/aps/trigger-workitem (JWT + eduardooost@gmail.com allowlist)
# - Pre-signed S3 PUT (3600s) to bucket aps20250806 / us-east-1
# - Design Automation WorkItem with output verb "put"
# - Frontend /aps-admin with matching email gate + trigger UI
#
# Required env: APS_CLIENT_ID, APS_CLIENT_SECRET, APS_ACTIVITY_ID
# IAM: EC2 role needs PutObject on arn:aws:s3:::aps20250806/*
#
# Peak functional AppBundle tree: commit f3e41eb (Revit 2027 + singleRoom.rvt).
# 2026-08-24: AppBundle+scripts restored only under backend/aps_app/ (spec 028);
# gateway /aps-admin remain pruned.
