# 进度监控：能力与验收记录

## 记录基线

- 模块：`progress`。
- 审阅的业务源码：[`40041b226572e31069312d7f32ff1ad0a41327e2`](https://github.com/xiafanzeng/frontmind-progress/tree/40041b226572e31069312d7f32ff1ad0a41327e2)。
- 整理日期：2026-09-16。本清单记录已执行检查与仍待补充的验收。
- 开发域名：[progress.frontmind.cn](https://progress.frontmind.cn)。实际运行版本以 `/api/version` 的 `moduleSha` 和 `coreSha` 为准。

“源码已包含”“本地检查通过”“真实业务验收通过”分别记录，不能互相替代。文档合并不会更新正在运行的镜像。

## 能力清单

| 能力 | 源码能力 | 主要源码 | 本地验证 | 真实业务验收 |
|---|---|---|---|---|
| 监控项目与配置 | 已包含：监控项目、品牌、独立问题输入、平台/区域/次数和截图配置，以及对应 API 和持久化。 | `module/client/ModuleWorkspace.tsx`；`module/client/components/MonitorForm.tsx`；`module/server/routes.ts`；`module/server/monitoring-repository.ts` | 见下方本地检查；不据此推定真实业务通过。 | 创建项目、问题保存、配置更新和刷新持久化待验收。 |
| 任务与事务 | 已包含：监控创建和排队业务、任务 repository；通过 Core 注入保留业务、资金与队列事务。 | `module/server/monitoring-repository.ts`；`module/server/worker-repository.ts`；`module/schema/index.ts` | 见下方本地检查；不据此推定真实业务通过。 | 真实排队、扣费预留和失败处理未验收；普通 ZIP 检查不触发付费监控。 |
| 监控执行 | 已包含：所属 worker 的调度、处理、速率限制、结果哈希、存储接口和错误处理。 | `module/worker/engine.ts`；`module/worker/processor.ts`；`module/worker/rate-gate.ts` | 见下方本地检查；不据此推定真实业务通过。 | 供应商执行未验收。已有测试配置缺少 MOLI_API_TOKEN 的记录，配置状态需验收时复核；未配置时 worker 保持停用。 |
| 回答、引用和截图 | 已包含：运行详情、回答阅读、引用列表、截图查看、分析面板和结果读取。 | `module/client/features/monitoring/`；`module/client/pages/RunDetailPage.tsx`；`module/server/monitoring-read-repository.ts` | 见下方本地检查；不据此推定真实业务通过。 | 真实产物读取、引用链接与截图访问待验收；合成 UI 测试不代表已产生真实结果。 |
| 报告 | 已包含：报告对话框、范围选择、监控指标和分析展示。 | `module/client/features/monitoring/MonitoringReportDialog.tsx`；`module/client/features/monitoring/panels/` | 见下方本地检查；不据此推定真实业务通过。 | 真实回答数据的报告呈现和相关文件访问待验收。 |

## 已完成的本地检查

名称修改及报价循环修复完成 frozen install、typecheck、60 项 UI 测试、3 项持久化 Node 测试和完整 build。新回归使用真实监控表单与 tRPC/React Query mutation 生命周期；构建后浏览器测试用合成 API 核对同输入不重复报价、数量改变时重新报价。

本轮修改包均经过 delivery skill 的路径检查、准确基线候选和隔离三方合并，没有未解决冲突。以上测试使用本地或合成场景，不产生真实供应商任务。

## 开发域名实际验收记录

| 范围 | 已有证据与待完成项 |
|---|---|
| 目标版本页面 | 待报价循环修复镜像部署并复验。旧版本页面与刷新检查通过，但监控保存验收因重复报价未通过，不能沿用为本次修复后的保存结论。 |
| 普通保存与刷新 | 新目标版本的监控配置保存、刷新持久化及报价请求次数待真实验收；旧测试未触发立即执行或自动计划。 |
| 供应商流程 | 实际监控采集、资金预留结算、回答落库、引用、截图及真实报告未执行；测试供应商配置缺项时 worker 保持停用。 |

后续部署应重新记录实际两个 SHA，并对变更交互复验。停用的 worker 不记为任务执行通过；旧版本结果不直接作为新镜像验收。公开文档只记录检查结论，不包含账号凭据、私有路径、业务记录正文或运行数据。

## 仍保留的能力边界

已有项目时追加监控项目的页面入口尚待完善或单独验收；本轮旧测试曾经由 API 创建合成项目，不算页面新建项目通过。尚无供应商执行结果时，不把预览中的回答、截图或报告认作真实产物。

## 运行与公开范围

`module/` 包含公开业务源码、业务依赖和所属工作流，`standalone/` 包含独立壳与合成预览，`vendor/` 由主仓维护并按版本下发。`pnpm dev` 明确显示“本地预览”，不连接真实测试数据库或付费供应商。真实持久化、后台任务、授权文件和供应商连接由私有 Core 运行入口提供。

开发域名进入固定测试工作区；子仓不实现产品登录、成员、租户或通用智能体。主仓注入真实用户和工作区上下文，并按需提供跨模块入口。独立模块保留自己的输入流程。

普通 ZIP 导入、CI 和页面检查不触发付费生成、监控采集、媒体外发或客户域名发布。没有供应商配置、指定测试目标或额度时，明确记录未配置或未执行；不以合成预览替代真实验收。

## 下一轮修改

先让 `frontmind-module-delivery` 读取开发域名 `/api/version` 并导出精确线上源码、完整 SHA 和交接模板。`main` 可能含尚未上线的文档或代码，不能直接当线上基线。

Pro 按 [PRO_GUIDE.md](https://github.com/xiafanzeng/frontmind-progress/blob/main/PRO_GUIDE.md) 返回 ZIP 后，delivery skill 在隔离工作树中合并、验证并部署指定子域名。验收后使用 `frontmind-module-sync` 合回业务源码；独立壳、预览数据和开发门禁不回灌主仓。源码同步不自动部署生产 Dashboard。
