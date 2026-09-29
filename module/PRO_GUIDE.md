# Pro 开发说明：问题监控

基于 delivery skill 导出的准确 public commit 修改。返回 `handoff.json`、`HANDOFF.md`、`files/module/...`；删除需在 handoff.json 显式列出。

- 完整 Moli 调用代码在 `module/server/providers/moli/`，可以修改请求、响应解析、超时及错误处理。
- 监控业务、持久化和 worker 分别在 `module/server/`、`module/schema/`、`module/worker/`。
- 页面在 `module/client/`。保留已有侧栏、弹窗和业务交互。
- 所有供应商请求在服务端进行。只在子域名验收的成员无需 Key，部署沿用服务器现有配置。
- 不修改 vendor、服务器凭据、部署目标或其他模块，不将付费 Key 放入前端或 ZIP。
- 保留付费提交幂等、同事务资金预留、任务归属和失败恢复；变更接口契约时补充测试。
- HANDOFF.md 写清目的、具体文件、依赖变化及实际验证结果。源码合回不等于发布生产 Dashboard。
