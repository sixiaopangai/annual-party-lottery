# Annual Party Lottery

年会抽奖与签到一体化 Web 应用，支持管理员配置活动、现场抽奖、大屏展示、管理员 H5 展示签到码，以及用户 H5 扫码签到。

## 在线地址

- 主站: `https://annual-party-lottery.yushenchuanmei.online`
- 后台管理: `https://annual-party-lottery.yushenchuanmei.online/admin.html`
- 管理员签到码页: `https://annual-party-lottery.yushenchuanmei.online/gate.html`
- 用户签到页: `https://annual-party-lottery.yushenchuanmei.online/sign.html`

## 页面入口

- `admin.html`: 管理员后台，配置活动、管理签到、执行抽奖
- `index.html`: 主会场抽奖页
- `viewer.html`: 大屏展示页
- `gate.html`: 管理员 H5，展示签到二维码
- `sign.html`: 用户 H5，扫码签到
- `results.html`: 结果展示页

## 技术栈

- Vite 6
- Node.js
- WebSocket `ws`
- 原生 HTML / CSS / JavaScript

## 本地启动

```bash
npm install
npm run start
```

默认启动后访问：

- `http://127.0.0.1:3300`
- `http://127.0.0.1:3300/admin.html`

健康检查接口：

```text
GET /api/health
```

## 常用脚本

```bash
npm run dev
npm run build
npm run server
npm run start
npm test
```

## 生产部署说明

当前生产环境部署在腾讯云 Ubuntu 24.04 服务器上，部署结构如下：

- 应用目录：`/opt/annual-party-lottery`
- Node 服务：`annual-party-lottery.service`
- 反向代理：Nginx
- 对外域名：`annual-party-lottery.yushenchuanmei.online`
- HTTPS：Let's Encrypt / Certbot

Node 服务默认监听 `3300` 端口，由 Nginx 统一代理到 `80/443`。

## 仓库

- GitHub: `https://github.com/sixiaopangai/annual-party-lottery`
