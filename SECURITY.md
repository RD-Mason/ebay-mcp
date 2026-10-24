# Security scope and change record

Baseline: upstream commit `2dbcead9f38d32371a862e4db3e51dfb56826b56` (2026-10-20). Fork owner: RD-Mason. This fork is private-use software in a public MIT-licensed repository; it is not an eBay approval or a guarantee against account sanctions.

## Changes

- Read-only by default; conservative tool classification, startup-captured permissions, exact write allowlist, credential tools local-only. Dynamic discovery operates only on already-authorized handles.
- Default tool families avoid customer, financial, analytics and competitor-research data. Basic/inventory/store read-only OAuth consent defaults.
- Secure local credentials: 0600 on POSIX, owner/type/link checks, validated field names and token values, atomic replace and fsync. Clearing tokens removes local saved copies while retaining app keys.
- OAuth callback binds only loopback, with state checks in both main and legacy interactive flows.
- Local-only HTTP, mandatory auth, constant-time static-token comparison, Host/Origin checks and identity-bound sessions. One process still uses one shop credential set.
- Exact outbound HTTPS host allowlist, only explicitly configured loopback proxies, no automatic redirects, no 5xx retries of non-idempotent requests.
- Default customer-field redaction before UI projection and before protocol output, secret redaction, no request/response bodies by default, opaque binary exports blocked before serialization, 1 MiB output cap.
- Local absolute launch command, no credential copies in AI client configurations, private atomic config writes, cleared Node preload environment. Background update checks opt-in.
- Frozen dependencies, disabled install scripts, private package, SHA-pinned read-only CI; removed scheduled sync/release/publish/cleanup workflows.
- Local runtime lock detects changes to commit, built artifacts, dependency files, link destinations and Node binary. External or transient-directory symlinks are refused.
- Patched body-parser to 2.4.0 and fast-uri to 3.1.9; compressed HTTP JSON bodies are rejected.

## Dependency audit (2026-10-24)

The fork migrates tool schemas and JSON Schema generation to native Zod 4.6.6, removes zod-to-json-schema, and does not route validation through zod/v3. A regression confirms an oversized constrained array is rejected before validating all elements. Transport budgets independently limit incoming messages before SDK validation: 256 KiB, 4096 nodes, 20 levels and 100 entries per collection; STDIO buffering is capped before JSON parsing. These controls do not guarantee freedom from future advisories.

Local validation on 2026-10-24 used Node 24.19.0 and pnpm 10.14.0: 1648 unit tests and 210 hermetic integration tests passed; server/UI TypeScript checks and the build passed. `pnpm audit --prod --json` examined 196 production dependencies and reported zero known vulnerabilities at every severity. This is a point-in-time advisory check, not a security proof or a complete dependency-source audit. GitHub Actions remains disabled; local test results do not imply a remote CI run.

## Historical issues

The upstream CVE-2026-27203 advisory describes environment-variable injection in old token persistence. This baseline already quotes environment values; the fork additionally rejects token newlines/NUL, validates keys, limits the credential-store key set, and removes credential-changing tools from model access. This is not a claim of formal CVE certification.

The deprecated Finding API tool was removed in the upstream baseline (#201/#202). It is not reintroduced.

## Limits

No complete security proof is possible. This review and regression suite do not audit every transitive dependency, validate eBay production eligibility, or guarantee freedom from future vulnerabilities. Human approval and platform permission remain necessary for sensitive operations. Field-based minimization cannot detect all personal information in prose; binary exports are disabled by default for this reason.

The runtime lock is an accidental-update safeguard, not a defense against a local attacker who can modify both the checker and its lock. Node startup configuration must be controlled before launching Node. Windows filesystem protection depends on ACLs. The credential writer uses an in-process mutex, not a cross-process database transaction.

Never store real shop credentials in GitHub Actions, commit them, or submit them in issue reports. Report suspected vulnerabilities privately to the repository owner through GitHub's available private reporting mechanism; do not post live secrets.
