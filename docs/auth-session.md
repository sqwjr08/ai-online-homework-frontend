# 登录与角色入口：16c

更新日期：2026-09-29。范围是登录、恢复、退出和角色入口，不包括注册、账号管理或作业业务。

## 会话约定

- `session.login(username, password)` 发送JSON到POST `/api/v1/auth/login`，取得Bearer令牌，再GET `/api/v1/auth/me`核实启用状态和真实角色。未完成核实前不进入工作区。
- 仅令牌保存于sessionStorage（`class-homework.access-token`）；不保存密码或用户资料，不解析JWT来决定角色。刷新重新请求me，浏览器存储不可用时降级为内存并提示刷新需重登。不是跨标签同步或长期“记住我”。
- 网络/服务故障恢复失败时隐藏受保护页面，显示重试与退出入口；401清除会话。退出立即清除本地状态，即使logout请求失败也生效。后端logout不撤销单个JWT。
- 迟到的登录、恢复和401不能恢复已退出会话或清除新会话。页面按用户ID隔离；后续新增共享缓存须另行清理，不可只依赖组件卸载。
- sessionStorage仍可被同源脚本访问，不是防XSS保险箱；后续题干、评语按文本渲染，不引入未净化HTML。

## 页面与扩展入口

- `/login`：用户名密码、忙碌状态、错误反馈。注册留给17d，忘记密码联系教师或管理员。
- `/teacher`、`/student`、`/admin`：按me返回的角色进入，各自展示后续任务，业务卡片暂未开放。
- 未登录直接访问受保护地址转登录；登录回跳仅允许匹配当前角色的本地路由。跨角色转`/forbidden`；未知页面有404；服务故障转`/session-error`。
- 新业务页接入router时声明`requiresAuth`及`roles`，使用`src/api/index.js`默认实例。前端守卫只改善体验，权限仍由后端执行。
- 旧`src/components`保留供后续迁移参考，不再接入当前路由；不恢复其旧接口或假数据。

## 隔离验证

`npm run test:auth`使用Node内置测试与虚构适配器，覆盖三角色、失败登录、刷新、网络故障、退出竞争及路由回跳。

如需重现浏览器检查，在独立交互终端执行：

```text
node tests/fixtures/auth-preview.mjs
```

打开`http://127.0.0.1:5174`。虚构账号为`teacher_demo`、`student_demo`、`admin_demo`，统一虚构密码`demo-pass`；`disabled_demo`模拟停用。这些账号只属于本机测试服务，不能用于真实后端。终端输入`offline`模拟503，`expired`模拟me的401，`online`恢复，`stop`关闭。

该脚本独立启动Vite及随机端口虚构HTTP服务，不读取环境文件，不访问8000、数据库、worker或模型。不会由正常dev/build启动，也不进入生产应用。浏览器可能自行自动填充测试字段，应用本身不保存密码。

实际验证结果见[节点进度](frontend-progress.md)。隔离检查不等于真实后端联调或完整业务验收。
