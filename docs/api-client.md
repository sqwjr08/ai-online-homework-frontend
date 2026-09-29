# 请求基础：16b

更新日期：2026-09-29。请求层已完成独立验证，登录页面、角色守卫、登录恢复尚未接入（16c）。业务页面仍有旧接口，不代表平台主流程可用。

## 地址与本地开发

浏览器统一请求同源 `/api/v1`；调用方只传不含该前缀的路径，例如 `/auth/me`。不接受完整URL、重复的 `/api/v1`、父目录或编码路径；查询条件通过 `params` 传递。

`npm run dev` 使用 `http://127.0.0.1:5173`，只绑定本机，端口被占用时明确报错，不自动换端口。不读取证书或私钥，原证书文件保留且继续被Git忽略。

开发代理默认转发到 `http://127.0.0.1:8000`，保留 `/api/v1` 路径，不做旧接口映射；同时代理 `/uploads` 静态路径。Vite启动本身不会启动后端、数据库或worker。

如果使用另一个已确认的隔离后端，在启动前为当前终端设置：

```powershell
$env:API_PROXY_TARGET = 'http://127.0.0.1:8001'
npm run dev
```

`API_PROXY_TARGET` 只从启动进程的环境读取，不从 `.env` 文件加载。它只能是HTTP(S)来源，不允许包含账号密码、路径、查询串或片段；不是模型配置，也不能填API Key。修改后重启Vite。恢复默认时从该终端移除这项环境变量。前端代码不需要任何真实密钥。

代理不自动跟随重定向，并移除上游3xx的Location以防浏览器继续跳转；API应使用路由要求的精确路径，不依赖尾斜杠重定向。后端不可达返回502。后端输出的图片绝对URL仍按实际URL加载，代理不会改写响应中的图片地址。

生产环境需由网站服务将同源 `/api/v1` 和适用的 `/uploads` 转发到后端，并配置历史路由回退；Vite开发代理不是生产部署方案。图片绝对URL应由后端PUBLIC_BASE_URL正确配置。

## 使用方式

```javascript
import api, { tokenStore } from '../api/index.js';

// 16c接入时使用；只存后端返回的access_token，不保存密码。
const result = await api.post('/auth/login', { username, password }, { skipAuth: true });
tokenStore.set(result.access_token);
const me = await api.get('/auth/me');
const page = await api.get('/questions', { params: { page: 1, page_size: 20, q: '索引' } });

// 上传不手动指定Content-Type，交由浏览器生成multipart边界。
const form = new FormData();
form.append('file', selectedFile);
const image = await api.post('/uploads/images', form);

// 退出时即使网络请求失败，也应清理本地会话。
tokenStore.clear();
```

这些是使用说明，不会自动登录、上传或请求后端。普通成功调用直接得到响应体（对象、数组或分页对象），不再读取 `res.code` 或额外的 `res.data`。201、202同样是HTTP成功；202或提交201不表示评分完成。

`tokenStore` 仅为内存接口，刷新页面会丢失。16c决定并实现登录恢复、用户状态、退出清缓存及路由跳转；本节点不声称已经支持持久登录。

受保护请求发送 `Authorization: Bearer ...`。登录、注册等公开接口应使用 `skipAuth: true`，避免登录失败清理另一会话。请求层覆盖调用方的旧Authorization，关闭跨域凭据选项，不依赖旧Cookie会话。

401只清理发起请求时对应的当前会话；旧请求迟到返回401不清除较新的登录。403不会退出。需要接入导航和用户缓存清理时，在 `src/api/index.js` 的 `createApiClient` 传入 `onUnauthorized` 回调；默认请求层不弹窗、不跳路由。退出还需由16c负责清理用户资料、页面数据与可能新增的持久化记录。

## 错误契约

失败抛出 `ApiError`，页面处理以下字段，而不是读取Axios的 `error.response.data`：

| 字段 | 用途 |
| --- | --- |
| message | 中文通用提示 |
| kind | http / unauthorized / validation / network / timeout / cancelled / configuration |
| status | HTTP状态码；网络、超时、取消、配置错误时为null |
| detail | 4xx的字符串业务原因；用于页面按场景映射，不能一概解释成同一种冲突 |
| fieldErrors | 422数组的 `{path, message}`，path保留body/query及字段、数组序号 |

例：`['body', 'answers', 0, 'answer_text']` 可定位第一题答案。不会保留Pydantic的input/ctx，也不在错误对象中保留原Axios请求、响应、密码、token或答案请求体。服务端5xx原文不透传；没有全局console输出或alert。

页面需区分：401登录失效；403无权限；404内容不可见或没有本人提交；409状态/锁定/重复/竞争冲突；422字段校验；413大小或像素限制；415图片格式；503暂时不可用。登录失败可依据401及detail显示账号密码错误，不应一律提示会话过期。

默认超时15秒，无自动重试、无token刷新请求。写操作超时、断网或取消都不能证明服务器没有保存；提交、确认成绩等应先查询结果，不自动重复POST。取消通常由页面静默处理；禁止把网络故障当作“没有提交”。

## 验证范围

`npm run test:api` 使用Node内置测试工具，无新增依赖。6项请求层测试用Axios模拟适配器，2项代理测试包含本机随机端口的虚构HTTP服务和实际Vite代理；不访问8000上的开发后端、数据库或模型。临时服务在测试结束关闭。

2026-09-29：8项通过，前端构建通过；没有运行真实API、浏览器页面或完整业务验收。旧页面仍使用旧路径和旧错误结构，后续逐节点迁移；共享请求层会拒绝旧完整URL，登录页原fetch尚未改造。
