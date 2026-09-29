# Moli 接口开发

这里是监控模块实际使用的完整供应商实现。子仓路径为 `module/server/providers/moli/`。

## 大家怎样开发

只在 `progress.frontmind.cn` 测试时，开发成员不需要拿到或配置 Key：修改本目录及 `module/worker/` 的代码，按 delivery skill 提交、构建并部署，服务器会自动注入已有 `MOLI_API_TOKEN`。不要把 Key 放进 React、`VITE_*`、GitHub 或 Pro ZIP。

该目录与主仓 `modules/progress/` 双向同步。主仓旧 `packages/monitoring-provider-moli` 只是兼容导出；发布镜像中的 worker 使用本目录实现。

## 从哪里改

| 文件 | 职责 |
| --- | --- |
| `client.ts` | HTTP、认证、超时、提交、查询、停止与账单读取 |
| `endpoints.ts` | 完整 API 路径；默认地址 `https://business-api.molizhishu.com` |
| `types.ts` | 请求和响应类型 |
| `normalize.ts` | 平台、任务、回答、引用、情感和账单解析 |
| `reasoning.ts`、`screenshot.ts` | 推理模式与截图能力 |
| `ids.ts` | 防止重复提交的 consumerTaskId |
| `errors.ts` | 配置错误、拒绝请求、响应异常及提交结果未知 |

服务端以 `new MoliClient({token, origin, timeoutMs})` 创建客户端，使用 Bearer 认证。现有入口包括 `listModels`、`listDomesticRegions`、`listOverseasRegions`、`submitSingleAttempt`、`getTaskStatus`、`getTaskResult`、`getSubTaskResult`、`stopTask`、`getBalance`、`getBillingSummary`、`getBillingRecords`；参数见 `types.ts`。

`module/worker/processor.ts` 和 `module/server/worker-repository.ts` 负责业务排队、轮询、回答落库、资金及重试决策。不要因网络超时直接创建新付费任务；保留原 consumerTaskId 和“提交结果未知”的恢复行为。

## 验证

仓库根运行 `pnpm install --frozen-lockfile`、`pnpm typecheck`、`pnpm test`、`pnpm build`。`module/tests/moli-provider.test.mjs` 使用假 HTTP 响应验证请求契约，不消耗真实额度。子域名的真实验收需核对一次监控的任务状态、回答、引用和截图；目录可读不代表任务执行完成。

## 新增 API 功能，不需要先改主仓

1. 在 `endpoints.ts` 新增官方路径，`types.ts` 定义参数与结果，`client.ts` 新增方法并处理响应/错误。
2. 需要后台执行时，在 `module/worker/ports.ts` 的 `MoliProviderPort` 增加方法签名，再修改 `processor.ts`；实际注入的对象就是本目录的 MoliClient。
3. 需要页面直接读取时，在 `module/server/routes.ts` 的 `monitoring`（或现有 `platforms`、`regions`、`monitors`、`runs`）路由组新增受授权保护的 procedure。处理器可使用本目录 `createMoliClientFromEnvironment()`，自动读取服务器配置，无需在私有 Core 加一个同名方法。输入输出 schema 写在 module/ 内。
4. 在 `module/client/` 增加调用和交互，提交 API 契约测试。部署会编译整份 module，新增 procedure 自动注册；这些路由组允许新增子路径，不必逐个修改主仓白名单。

付费提交仍走原有资金预留和队列，不把 raw provider 任意 URL 转发器暴露给浏览器。新增官方功能本身不应绕开现有记录归属和幂等规则。
