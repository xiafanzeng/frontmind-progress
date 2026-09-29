# FrontMind 问题监控模块

公开仓库：https://github.com/xiafanzeng/frontmind-progress

维护域名：https://progress.frontmind.cn

`module/`（主仓为 `modules/progress/`）包含实际监控页面、API、持久化、worker、供应商调用实现和测试。完整 Moli 接口位于 [server/providers/moli](server/providers/moli/README.md)，可直接修改，子域名 worker 使用同一份实现。

服务器已配置调用凭据。只在子域名测试的成员无需配置 Key；普通开发流程是导出准确线上基线 → Pro 修改 ZIP → delivery skill 提交部署 → 子域名验收 → sync skill 合回主仓。

身份、跨模块连接和通用账务由宿主提供，业务代码仍拥有何时创建任务、提交、重试和保存结果的逻辑。没有数据库结构或页面风格变更。
