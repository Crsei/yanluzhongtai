# 访问控制说明

当前权限模型来源于需求与 spec：

- 访客
- 一般成员
- 管理员
- 超级管理员

当前脚手架尚未落地真实 RBAC 守卫，但后续应在后端补充：

- JWT 签发与校验
- 路由级角色守卫
- 文件访问权限控制
- 敏感字段脱敏
- 审计日志

建议结合以下文件继续实现：

- `apps/api/src/modules/auth`
- `apps/api/src/modules/users`
- `apps/api/src/common`
- `docs/spec/00-全局约束与实施路线.md`

