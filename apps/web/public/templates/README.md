# `/templates`

此目录用于存放 `QuickLinkKind=DOWNLOAD` 类快捷入口所引用的静态文件。

示例：spec §7.1 中"📦 模板：从 Excel 导入员工、学生、课程" 对应的压缩包，放置为 `import.rar`，则在后台新增 QuickLink 时填 `url = /templates/import.rar`。

实际二进制文件不进仓库（见 `.gitignore`），由运维 / 管理员上线时手动放入对应环境的 `apps/web/public/templates/` 下。
