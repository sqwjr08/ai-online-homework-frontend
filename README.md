# 班级简答题作业平台 · 前端

面向一门课程、多个班级的简答题作业平台，角色为管理员、教师、学生。前端使用 Vue 3、Vue Router、Axios 和 Vite，后端独立使用 Python/FastAPI。

**状态：开发中，已完成 16a–16c、17a。** 登录和三角色入口已实现；管理员可查询、筛选、分页查看账号并创建教师/学生。其他未开放卡片继续明确标注。已通过隔离虚构服务的浏览器检查，尚未进行真实后端联调，提交和查分仍待后续节点。

## 开发入口

- [项目总览与交接](PROJECT_CONTEXT.md)：业务规则、接口清单、页面规划、节点计划及已知缺口。
- [节点进度与实际验证](docs/frontend-progress.md)：每次会话完成的内容、验证范围和下一步。
- [请求层使用说明](docs/api-client.md)：地址、开发代理、令牌接口、错误契约与验证范围。
- [前端仓库](https://github.com/sqwjr08/ai-online-homework-frontend)。
- [独立后端仓库](https://github.com/sqwjr08/ai-online-homework-backend)：以当前路由、响应模型及 OpenAPI 为契约依据。

`task.md` 和 `.trae/rules/` 是保留的旧业务记录，其中角色、Vuex 和完成标记可能不符合当前代码。后续开发以项目总览及节点进度为准，不按旧任务表恢复旧功能。

## 当前技术基线

使用 npm 和 `package-lock.json`。16a 保留本地已有的依赖清单与锁文件，没有安装或升级依赖，也没有回退到远端早期的 Vite 4/Vuex 清单。

| 依赖 | 锁定版本 |
| --- | --- |
| Vue | 3.5.13 |
| Vue Router | 4.5.1 |
| Axios | 1.9.0 |
| Vite | 6.3.5 |
| @vitejs/plugin-vue | 5.2.4 |

现有脚本：

```text
npm run dev       本地开发
npm run build     构建
npm run preview   预览构建结果
npm run test:api  请求层与隔离开发代理测试
npm run test:auth 登录会话与角色守卫测试
npm run test:users 账号列表与建号测试
```

17a通过6项账号测试、7项会话回归与构建；8项请求/代理测试已于16c通过，本轮未改请求层，不重复运行。开发入口为 `http://127.0.0.1:5173`；同源 `/api/v1` 默认代理到 `http://127.0.0.1:8000`。若使用另一个已确认的隔离后端，通过启动终端的 `API_PROXY_TARGET` 指定来源，详见请求层说明。启动Vite不会启动后端或worker。虚构预览方法见 [登录与会话说明](docs/auth-session.md)，账号契约与范围见 [账号管理说明](docs/accounts.md)。

## 开发边界

- 每次推进一个小节点，完成后记录实际验证和未覆盖部分；界面变更需要浏览器检查。
- 新接口使用 `/api/v1` 和 Bearer token，不能继续依赖旧 Express 的 Cookie、路径和响应格式。
- 学生只获得学生视图；提交先保存，辅助评分草稿须教师确认后才成为可见成绩。
- 不在前端存放管理员凭据或模型 Key，不直接请求百炼。
- 联调使用虚构数据与经确认的隔离环境；不自动启动真实模型 worker 或付费重试。
- 不为前端节点擅自修改后端。完整学生历史列表等接口缺口见项目总览。

下一节点：**17b 账号维护**（启停用、重置密码及旧会话失效反馈）。继续使用 `codex/node-16a-baseline` 开发分支；未推送到远端。
