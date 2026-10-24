# eBay MCP — RD-Mason 安全加固 Fork

本仓库基于 [YosefHayim/ebay-mcp](https://github.com/YosefHayim/ebay-mcp) 的提交 `2dbcead9f38d32371a862e4db3e51dfb56826b56`（2026-10-20）二次开发，供本人在本机受控使用。保留原 MIT 许可。此项目不是 eBay 官方产品。

**不承诺绝对安全、不承诺不会被 eBay 限制账号。** 代码加固不能替代平台授权、卖家合规或人工检查。

## 当前默认行为

- Sandbox、只读；仅开放 inventory / metadata / taxonomy / stores 中的读取工具。
- 写操作必须同时设置 `EBAY_READ_ONLY=false`、`EBAY_ALLOW_WRITES=true`，并将每个具体工具列入 `EBAY_MCP_ALLOWED_WRITE_TOOLS`。动态发现不能扩大这些权限；这不是人工审批系统，启用写入后仍须在客户端逐次确认。
- 凭证维护不向模型开放。凭证留在本地 `.env`，POSIX 权限 `0600`，原子保存，拒绝符号链接、硬链接和其他用户拥有的文件。
- 默认对已知买家字段、邮箱、Token 脱敏；默认禁止二进制导出。自由文本无法保证完全去除个人信息。
- HTTP 只允许本机回环地址，且必须鉴权；Host、Origin 与会话身份均校验。
- 凭证只能发送到精确匹配的 eBay HTTPS API 主机；显式设置的本地代理属于额外信任边界。禁用远程代理及自动重定向。
- 退款、刊登等写请求在 5xx 后不自动重放。
- 已迁移到修复版本 Zod 4.6.6，并在 SDK 校验前限制输入大小、深度和集合项数。
- 不运行后台版本检查；依赖固定版本，使用冻结锁文件，禁用安装生命周期脚本。
- 不自动同步上游、不自动发布 npm 包、不自动合并更新。

## 本机运行

需要 Node.js 24 或以上，以及 **pnpm 10.14.0**。不要使用 `npx ebay-mcp`，那会运行上游 npm 包。

首次准备（无需 eBay 密钥）：

```sh
npm exec --package=pnpm@10.14.0 -- pnpm install --frozen-lockfile --ignore-scripts
npm exec --package=pnpm@10.14.0 -- pnpm run build
npm exec --package=pnpm@10.14.0 -- pnpm run check:ci
npm exec --package=pnpm@10.14.0 -- pnpm run typecheck
npm exec --package=pnpm@10.14.0 -- pnpm test
npm exec --package=pnpm@10.14.0 -- pnpm test:integration
node scripts/seal-local.mjs
node scripts/smoke-local.mjs
```

离线 STDIO 服务（没有真实 eBay 数据，不发 eBay 请求）：

```sh
./run-local.sh --offline
```

STDIO MCP 由客户端启动并通过标准输入输出交互，不是网页服务；手动启动后等待输入属于正常行为。`smoke-local.mjs` 会真实完成 MCP 握手、获取工具列表、确认写工具不可见，再关闭子进程。

构建、依赖、Node 二进制或 Git 提交与本地验收锁不一致时，启动器拒绝运行。`.local/runtime-lock.json` 只记录本机指纹，不含凭证、不提交 Git。这用于防止意外更新，不抵抗能同时修改验证器与锁文件的本机恶意进程。

## 申请 eBay 开发者凭证

普通 eBay 账号、开发者账号、Sandbox 测试账号是分开的。

1. 到 [eBay Developers Program](https://developer.ebay.com/) 注册免费的开发者账号，按官网要求提供真实资料、验证邮箱并接受协议。官方入门页说明审核约需一个工作日，以实际审核为准。
2. 在 **Application Keys → Sandbox → Create a keyset** 创建测试密钥；获得 App ID / Client ID、Cert ID / Client Secret。
3. 创建 Sandbox 测试用户，再进行用户 OAuth 授权。
4. 在本机复制 `.env.example` 为 `.env`，设置 `chmod 600 .env`，只在本地填写凭证。不要发到聊天、截图、GitHub、日志或工单。
5. 使用本地 `node build/scripts/setup.js` 完成授权和客户端配置。生成配置只指向本地已验收启动器，不复制密钥。
6. 验收锁不覆盖 `.env`，因此填入凭证无需重新构建；真实连接前请核对环境与 OAuth scope。

[官方申请与测试说明](https://developer.ebay.com/develop/guides/sell/get-started-with-ebay-apis)。默认只申请基础、库存只读、商店只读 scope；以本人 keyset 实际获准范围为准。测试通过后才考虑 Production，并先完成卖家资格、删除通知/豁免及数据处理合规。

配置完成后：

```sh
./run-local.sh
```

清除本地 Token 不等于撤销 eBay 服务器端授权；停用时还应在 eBay 撤销第三方访问。其他进程、备份中的副本不受本地清理影响。

## 上游更新是否影响我

**不会自动影响。** Fork 是独立仓库；上游提交不会自动进入本 Fork 或本机。只有主动同步/合并/拉取并重新部署才会改变代码。

- `origin` 指向 `RD-Mason/ebay-mcp`；`upstream` 仅用于查看原仓库更新，已禁用向上游推送。
- `git fetch upstream` 只更新远程引用，不修改当前文件。不要对生产版本盲目执行 Sync fork 或强制同步。
- 需要更新时新建评审分支，逐项审查 diff，合并或挑选提交，冻结安装、跑测试、构建，再生成新的本地验收锁。
- 本仓库只保留固定提交的只读 CI 定义，GitHub Actions 当前保持关闭；没有定时同步、自动发布或自动合并流程。不要给 Actions 添加 eBay 密钥。

变更明细和限制见 [SECURITY.md](SECURITY.md)。原接口清单可查阅[固定上游 README](https://github.com/YosefHayim/ebay-mcp/blob/2dbcead9f38d32371a862e4db3e51dfb56826b56/README.md)，但不要使用其中指向上游 npm 的安装/更新命令。
