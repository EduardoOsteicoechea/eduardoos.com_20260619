# Data contracts — preserve for cutover

These names and shapes come from the production Eduardo OS deployment.
**Next must read/write them as-is** unless a migration spec is approved.

## S3

| Bucket | Usage |
|--------|--------|
| `eduardoos20260607` | App media |
| `aps20250806` | APS Design Automation I/O |

### Prefixes on `eduardoos20260607`

| Prefix | Domain |
|--------|--------|
| `media/` | Gallery, profiles, audio, epams bodies, etc. |
| `ifcbim/{user}/{modelId}.ifc` | BIM IFC files |

## DynamoDB (us-east-1)

| Table | Notes |
|-------|--------|
| `eduardoos_catalog` | Generic KV |
| `eduardoos_users` | Users (`user:` keys / store mapping) |
| `eduardoos_posts` | Posts |
| `eduardoos_refresh_tokens` | Refresh |
| `eduardoos_flight_logs` | Telemetry |
| `eduardoos_test_runs` | Tester |
| `eduardoos_playlists` | PK `userId`, SK `playlistId` |
| `eduardoos_epams` | Pamphlet metadata; body in S3 |
| `eduardoos_edebats` | Debates |
| `eduardoos_payments` | PayPal intents |
| `eduardoos_entitlements` | Entitlements |
| `eduardoos_ifcbim` | PK `userId`, SK `modelId` |

Env flags production uses: `*_BACKEND=dynamodb`, `S3_BACKEND=aws`, `IFCBIM_TABLE=eduardoos_ifcbim`, etc.

## Auth hashing

Production authenticator uses `sha256:` + hex digest for passwords.
Next auth **must** verify the same format for existing users.

## APS

Env: `APS_CLIENT_ID`, `APS_CLIENT_SECRET`, `APS_ACTIVITY_ID`.
Admin allowlist email: `eduardooost@gmail.com`.
