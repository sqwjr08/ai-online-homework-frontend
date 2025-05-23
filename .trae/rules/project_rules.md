# AI线上作业系统的前端

## 项目概述
JavaScript线上作业系统前端，拥有简单用户系统，用户分为学生和管理员两类。
学生在登陆后可以查看并完成管理员布置的作业，也可以查看已完成作业的分数，学生按班级进行细分。
管理员可上传题目，建立作业，以班级为单位给学生发布作业。
“作业”由“题目”组成，题目包含题目内容和标准答案。
学生提交的题目的答案将传递给ai大模型与原答案进行比对，评分，最后成绩返回给学生、管理员。
管理员可以查看学生的成绩，也可以查看学生的提交情况和学生所提交的答案。

## 项目页面
- 主页（mainpage.vue）
- 登录注册页（login&register.vue）：用户登录、注册
- 学生主页（studentpage.vue）：查看已完成未完成作业、成绩、提交情况
- 作业页（exampage.vue）：完成管理员布置的作业，提交答案
- 管理员主页（adminpage.vue）：可通往上传题目页，建立、发布作业页，查看学生成绩页，学生管理页
- 上传题目页（upload.vue）：管理员上传题目
- 建立、发布作业页（build.vue）：管理员以班级为单位建立、发布作业
- 查看成绩页（score.vue）：管理员查看学生成绩、提交情况、学生提交的答案
- 学生管理页（manage.vue）：管理员查看学生信息、删除学生、修改班级

## 技术栈
- Vue3
- Vue Router
- Vuex
- Axios
- vite

## 项目结构 
```
├── README.md
├── package.json
├── public
│   ├── favicon.ico
│   └── index.html
├── src
│   ├── api
│   │   └── index.js
│   ├── App.vue
│   ├── assets
│   │   └── logo.png
│   ├── components                   

## 启动项目
npm run dev
