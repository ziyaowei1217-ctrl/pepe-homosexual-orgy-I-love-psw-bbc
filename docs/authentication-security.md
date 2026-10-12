# 会话撤销与敏感操作验证

本轮认证改动需要按顺序执行 `prisma migrate deploy`，包含 `20261012090000_durable_auth_sessions` 和 `20261012100000_independent_mfa`。生产必须配置独立的 `MFA_ENCRYPTION_KEY`（32 字节随机值的 canonical base64）；它不能与 JWT、OTP 或标识哈希密钥复用。应备份并限制该密钥的访问。更换密钥前需要完成数据重新加密，否则已绑定的验证器不能解密。

旧令牌没有持久会话标识，升级后需要重新登录。部署时须切断旧版本流量并排空旧实例的 WebSocket，避免旧认证代码继续接受已撤销的令牌；推荐先执行兼容性迁移，再将流量整体切换到验证过的新版本，确认旧实例退出后开放访问。每次邮箱登录建立独立的七天会话。注销只撤销当前设备会话；HTTP 认证每次读取会话状态。WebSocket 通过跨实例适配器关闭同会话连接，且以一秒轮询间隔查数据库，补偿丢失的撤销通知（还需加上数据库查询耗时；查询失败返回后关闭连接）。私密事件发布前只选择仍有效的会话房间。

JWT 使用固定的 HS256、issuer `sublet-api`、audience `sublet-web` 和 purpose `session`。普通会话令牌与独立验证后的令牌共享会话 ID，但只有新令牌带与数据库精确匹配的 `mfaVerifiedAt`；旧令牌不会自动升权。有效窗口为十分钟。再次验证会使此前的升权时间失配，注销或禁用也会使升权失效。

## 首次绑定与恢复

已有管理员首先用邮箱重新登录，在账户验证页启用“敏感操作验证”，将设置密钥添加到验证器，并输入当前验证码完成绑定。系统仅在成功验证后启用，并一次性显示十个恢复码；用户需要保存后确认。管理员写入、真实支付 checkout、远程支付的接受/取消命令都要求近期独立验证。没有生产或开发环境免检路径；无外部资金价值的演示支付不会要求资金操作 MFA。

普通用户的邮箱登录和一般数据读取保持原行为。这是敏感操作的第二因素验证，不是全站强制 MFA，不等于完整 OWASP ASVS L2/L3 验收。

初次绑定和禁用都要求十分钟内完成的邮箱登录。已经启用后不能直接重新绑定；禁用还必须验证现有 TOTP 或未使用的恢复码。没有仅凭邮箱重置因素的接口，也没有恢复码轮换接口。确认绑定和合法禁用都会在同一事务内注销其他设备的会话，仅保留操作当前设备；现有远端 WebSocket 会通过会话轮询断开。合法禁用还会删除因素及恢复码，并清除该用户所有会话的升权状态。之后可重新绑定。丢失验证器且耗尽恢复码时，当前产品不提供自助绕过；需要另外定义有独立身份核验和审计的恢复流程。

TOTP 使用 otplib，仅接受服务器当前的 30 秒时间步（不接受前后时间步；验证器与服务器时钟需同步）；已接受的时间步不可重放。因素密钥使用 AES-256-GCM 加密，并将用户 ID 作为认证上下文。恢复码各有 128 位随机熵，仅存储按用户隔离的 SHA-256 哈希。PostgreSQL 用户行锁串行化验证码/恢复码消费；五次错误后锁定十五分钟，计数在错误响应前持久提交。

## API

所有路径都需要普通有效 Bearer 会话：

| 方法与路径 | 请求与结果 |
| --- | --- |
| GET `/api/v1/auth/mfa` | `enabled`、`recoveryCodesRemaining`、`verifiedUntil`，不返回秘密 |
| POST `/api/v1/auth/mfa/enrollment` | 返回一次设置用的 `secret`、`otpauthUri`；待确认状态绑定当前会话，十分钟过期 |
| POST `/api/v1/auth/mfa/enrollment/confirm` | `{code}`；返回 `accessToken`、`verifiedUntil`、一次性 `recoveryCodes` |
| POST `/api/v1/auth/mfa/verify` | `{code}` 或 `{recoveryCode}` 二选一；返回新的 `accessToken`、`verifiedUntil` |
| POST `/api/v1/auth/mfa/disable` | 现有 `{code}` 或 `{recoveryCode}`；成功 `{disabled:true}` |
| POST `/api/v1/auth/logout` | 持久撤销当前会话，成功 `{revoked:true}`；客户端失败时保留登录状态并允许重试 |

旧的管理员邮箱 step-up API 保留用于兼容和验证码消费，但其令牌不能通过新的管理员独立因素守卫。

## 验证

`api/test/mfa.integration.spec.ts` 使用独立 PostgreSQL 数据库，覆盖 20 并发同时间步 TOTP / 同恢复码各仅一次成功、密钥和恢复码不以明文落库、跨会话绑定、旧令牌不升权、管理与支付守卫、禁用与撤销、时间窗口和持久限流。设置 `RUN_DB_SMOKE=1`、`TEST_DATABASE_URL`、`TEST_DATABASE_CONTAINER` 后使用 API 的 Vitest 命令执行。

`api/test/roommate-valkey-realtime-smoke.spec.ts` 使用两个应用实例、PostgreSQL 和 Valkey，覆盖远端注销关闭同会话连接、保留另一设备，以及遗漏撤销通知后的数据库补偿关闭。额外需要 `RUN_VALKEY_SMOKE=1` 与 `VALKEY_URL`。
