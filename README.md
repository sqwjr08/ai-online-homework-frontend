# 班级简答题作业平台 · 前端

面向一门课程、多个班级的简答题作业平台，角色为管理员、教师、学生。前端使用 Vue 3、Vue Router、Axios 和 Vite，后端独立使用 Python/FastAPI。

**状态：开发中，16a–16c、17a–17d、18a–18c、19a–19b、20a–20b、21a代码已完成。** 已实现账号管理、教师班级、学生注册入班，以及教师文字题库列表、搜索分页、详情、创建、编辑和停用，以及图片上传、预览和移除引用；教师可选班选题、排序并保存/编辑作业草稿，预览发布或归档作业；学生可读取本班作业、填写文字并进行一次正式提交、核对本人提交状态。17b起沿用暂不运行浏览器的安排，页面待手动检查。尚未进行真实后端联调，教师可读取提交和批改详情；成绩确认与学生查分仍待后续节点。

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
npm run test:users 账号列表、建号与维护测试
npm run test:classes 教师班级与成员测试
npm run test:student 学生注册与入班测试
npm run test:questions 文字题库测试
npm run test:drafts 作业草稿测试
npm run test:assignments 作业草稿、发布与归档测试
npm run test:student-assignments 学生作业读取与文字提交测试
npm run test:review 教师提交与批改详情测试
```

21a通过7项教师提交测试和7项会话回归、预览脚本语法检查与构建；未重复运行无关历史测试。开发入口为 `http://127.0.0.1:5173`；同源 `/api/v1` 默认代理到 `http://127.0.0.1:8000`。启动Vite不会启动后端或worker。开发代理说明见[请求层文档](docs/api-client.md)，虚构预览见[会话说明](docs/auth-session.md)；待手动检查步骤见[账号管理](docs/accounts.md)、[教师班级](docs/classes.md)、[学生注册入班](docs/student-onboarding.md)、[题库](docs/questions.md)、[作业草稿](docs/assignment-drafts.md)、[发布归档](docs/assignment-lifecycle.md)、[学生作业](docs/student-assignments.md)、[文字提交](docs/student-submit.md)和[教师提交详情](docs/teacher-review.md)。

## 开发边界

- 每次推进一个小节点，完成后记录实际验证和未覆盖部分；界面变更需要浏览器检查。
- 新接口使用 `/api/v1` 和 Bearer token，不能继续依赖旧 Express 的 Cookie、路径和响应格式。
- 学生只获得学生视图；提交先保存，辅助评分草稿须教师确认后才成为可见成绩。
- 不在前端存放管理员凭据或模型 Key，不直接请求百炼。
- 联调使用虚构数据与经确认的隔离环境；不自动启动真实模型 worker 或付费重试。
- 不为前端节点擅自修改后端。完整学生历史列表等接口缺口见项目总览。

下一开发节点：**21b 人工确认成绩**。17b–21a浏览器检查待用户执行。继续使用 `codex/node-16a-baseline` 开发分支；未推送到远端。
