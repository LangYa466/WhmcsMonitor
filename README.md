# WhmcsMonitor

监控 WHMCS 商店页面的产品库存，目标方案从「缺货」恢复为「可下单」时通过 Telegram Bot 推送补货通知。

适用于任何基于 WHMCS 默认订购页模板的商家（产品块为 `<div class="package" id="productN">`，下单按钮为 `.btn-order-now`，缺货时按钮带 `disabled` 类）。

## 快速开始

需要 Node.js 20.6+（使用内置 `process.loadEnvFile`，无外部依赖）。

```bash
git clone https://github.com/LangYa466/WhmcsMonitor.git
cd WhmcsMonitor
cp .env.example .env
# 编辑 .env，填入 URLS / TG_TOKEN / CHAT_ID
node check.js
```

也可以用 npm script：

```bash
npm start
```

## 配置（.env）

| 变量 | 必填 | 说明 |
|------|------|------|
| `URLS` | ✅ | 要监控的 WHMCS 商店页 URL，多个用英文逗号分隔 |
| `TG_TOKEN` | ✅ | Telegram Bot Token（向 @BotFather 申请） |
| `CHAT_ID` | ✅ | 接收通知的 chat id（个人 id 或群组 id） |
| `KEYWORD` | ⛔ | 仅监控标题包含此关键词的产品；留空则监控页面上全部产品 |
| `INTERVAL_MS` | ⛔ | 轮询间隔，毫秒，默认 `1800000`（30 分钟） |
| `RENOTIFY_COOLDOWN_MS` | ⛔ | 同一产品的二次通知冷却时间，毫秒，默认 `1800000` |
| `USER_AGENT` | ⛔ | 自定义请求 UA |

`.env` 已在 `.gitignore` 中，不会被提交。

## 工作机制

1. 每 `INTERVAL_MS` 拉取一次 `URLS` 中每个页面的 HTML。
2. 用正则提取所有 `package` 产品块，得到 `{id, title, inStock, href}`。
3. 若设置了 `KEYWORD`，按标题子串过滤。
4. 对每个产品维护「上一次是否有货」的状态。当状态从 `缺货 → 有货` 时推送一条 Telegram 消息，附带产品名与下单链接。
5. 通过 `RENOTIFY_COOLDOWN_MS` 防止抖动重复打扰。

启动时还会发送一条「监控已启动」的心跳消息，方便确认 Bot/Chat 配置正确。

## 关于通知

- 通知按 URL 分组，每个 URL 一条消息。
- 产品的下单链接使用 `URL` 构造解析，所以无论站点域名是什么都能拼出正确的绝对 URL。
- 如果你只想在「页面首次出现某产品」时也得到通知（而不仅是状态翻转），默认行为已经满足：第一次看到 `inStock=true` 的产品会触发一次通知（受冷却时间约束）。

## 部署提示

- 服务器上 `nohup node check.js > monitor.log 2>&1 &` 即可常驻；或写一个 `systemd` unit。
- 想要更稳的服务管理，用 `pm2 start check.js --name whmcs-monitor`。
- Docker 用户可直接 `node:20-alpine` 跑，挂载 `.env` 即可。

## 开发

仓库非常薄：只有 `check.js` 一个文件。所有依赖都是 Node 内置（`fetch` / `URL` / `process.loadEnvFile`）。

欢迎 issue / PR：https://github.com/LangYa466/WhmcsMonitor

## License

MIT
