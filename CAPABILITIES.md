# 进度监控：能力与验收记录

## 记录基线

- 模块：`progress`。
- 审阅的业务源码：[`f5f6ccc1b257f84fa052f0bfd327b1358cc54466`](https://github.com/xiafanzeng/frontmind-progress/tree/f5f6ccc1b257f84fa052f0bfd327b1358cc54466)。
- 整理日期：2026-09-17。本清单记录已执行检查与仍待补充的验收。
- 开发域名：[progress.frontmind.cn](https://progress.frontmind.cn)。实际运行版本以 `/api/version` 的 `moduleSha` 和 `coreSha` 为准。

“源码已包含”“本地检查通过”“真实业务验收通过”分别记录，不能互相替代。文档合并不会更新正在运行的镜像。

## 能力清单

| 能力 | 源码能力 | 主要源码 | 本地验证 | 真实业务验收 |
|---|---|---|---|---|
| 监控项目与配置 | 已包含：监控项目、品牌、独立问题输入、平台/区域/次数和截图配置，以及对应 API 和持久化。 | `module/client/ModuleWorkspace.tsx`；`module/client/components/MonitorForm.tsx`；`module/server/routes.ts`；`module/server/monitoring-repository.ts` | 见下方本地检查；不据此推定真实业务通过。 | 真实 UI 创建项目、保存问题分类与监控配置、刷新后重新打开并保持配置已通过；已有配置修改另行验收。 |
| 任务与事务 | 已包含：监控创建和排队业务、任务 repository；通过 Core 注入保留业务、资金与队列事务。 | `module/server/monitoring-repository.ts`；`module/server/worker-repository.ts`；`module/schema/index.ts` | 见下方本地检查；不据此推定真实业务通过。 | 真实排队、扣费预留和失败处理未验收；普通 ZIP 检查不触发付费监控。 |
| 监控执行 | 已包含：所属 worker 的调度、处理、速率限制、结果哈希、存储接口和错误处理。 | `module/worker/engine.ts`；`module/worker/processor.ts`；`module/worker/rate-gate.ts` | 见下方本地检查；不据此推定真实业务通过。 | 供应商执行未验收。已有测试配置缺少 MOLI_API_TOKEN 的记录，配置状态需验收时复核；未配置时 worker 保持停用。 |
| 回答、引用和截图 | 已包含：运行详情、回答阅读、引用列表、截图查看、分析面板和结果读取。 | `module/client/features/monitoring/`；`module/client/pages/RunDetailPage.tsx`；`module/server/monitoring-read-repository.ts` | 见下方本地检查；不据此推定真实业务通过。 | 真实产物读取、引用链接与截图访问待验收；合成 UI 测试不代表已产生真实结果。 |
| 报告 | 已包含：报告对话框、范围选择、监控指标和分析展示。 | `module/client/features/monitoring/MonitoringReportDialog.tsx`；`module/client/features/monitoring/panels/` | 见下方本地检查；不据此推定真实业务通过。 | 真实回答数据的报告呈现和相关文件访问待验收。 |

## 已完成的本地检查

名称修改、报价循环修复及页面新建项目入口完成 frozen install、typecheck、62 项 UI 测试、3 项持久化 Node 测试和完整 build。回归使用真实监控表单与 tRPC/React Query mutation 生命周期；构建后浏览器测试用合成 API 核对已有项目时可以新建项目、同输入不重复报价、数量改变时重新报价。

本轮修改包均经过 delivery skill 的路径检查、准确基线候选和隔离三方合并，没有未解决冲突。以上测试使用本地或合成场景，不产生真实供应商任务。

## 开发域名实际验收记录

| 范围 | 已有证据与待完成项 |
|---|---|
| 目标版本页面 | 已核验 moduleSha `f5f6ccc1b257f84fa052f0bfd327b1358cc54466` / coreSha `0ec4bad6b88360bb770e36c2fc16be6f10af7497`。首页、刷新、通用智能体路径回首页及真实截图检查通过；无名称测试后缀、预览标记、浏览器异常或失败业务请求。 |
| 普通保存与刷新 | 通过页面新建监控项目，保存手工问题分类与监控配置，刷新后重新打开并核对持久化。初始报价 1 次，刷新重开后累计 2 次，无报价循环。保存配置采用 `schedule.type=none`，`nextRunAt=null`，运行数为 0；余额不变，没有立即执行、自动计划或供应商调用。仅软删除本轮随机测试记录，原项目保留。 |
| 供应商流程 | 实际监控采集、资金预留结算、回答落库、引用、截图及真实报告未执行。验收时监控 worker 未启用且未运行；配置保存通过不能作为采集执行通过。 |

后续部署应重新记录实际两个 SHA，并对变更交互复验。停用的 worker 不记为任务执行通过；旧版本结果不直接作为新镜像验收。公开文档只记录检查结论，不包含账号凭据、私有路径、业务记录正文或运行数据。

## 仍保留的能力边界

已有项目时通过页面追加项目、保存不执行的监控配置及刷新重开已通过。实际采集、扣费、结果存储、引用、截图和报告仍需配置供应商并单独验收；不把本地预览中的回答、截图或报告认作真实产物。

## 运行与公开范围

`module/` 包含公开业务源码、业务依赖和所属工作流，`standalone/` 包含独立壳与合成预览，`vendor/` 由主仓维护并按版本下发。`pnpm dev` 明确显示“本地预览”，不连接真实测试数据库或付费供应商。真实持久化、后台任务、授权文件和供应商连接由私有 Core 运行入口提供。

开发域名进入固定测试工作区；子仓不实现产品登录、成员、租户或通用智能体。主仓注入真实用户和工作区上下文，并按需提供跨模块入口。独立模块保留自己的输入流程。

普通 ZIP 导入、CI 和页面检查不触发付费生成、监控采集、媒体外发或客户域名发布。没有供应商配置、指定测试目标或额度时，明确记录未配置或未执行；不以合成预览替代真实验收。

## 下一轮修改

先让 `frontmind-module-delivery` 读取开发域名 `/api/version` 并导出精确线上源码、完整 SHA 和交接模板。`main` 可能含尚未上线的文档或代码，不能直接当线上基线。

Pro 按 [PRO_GUIDE.md](https://github.com/xiafanzeng/frontmind-progress/blob/main/PRO_GUIDE.md) 返回 ZIP 后，delivery skill 在隔离工作树中合并、验证并部署指定子域名。验收后使用 `frontmind-module-sync` 合回业务源码；独立壳、预览数据和开发门禁不回灌主仓。源码同步不自动部署生产 Dashboard。
