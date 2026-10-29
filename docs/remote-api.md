# NotePadWeb-- 远程接口说明

本文档描述 NotePadWeb-- 与远程服务器约定的接口，供服务端实现。

角色分工：

- **插件客户端**：打开页面时打点；用户点「帮助 → 更新插件」时查版本并下载 zip
- **发布方 / CI**：有新版本时，把 zip 和版本号上传到服务器；之后所有插件用户都从同一台服务器拉更新

配置与范围：

- 统一配置：`js/remote-config.js`（只改 `origin` 和 `basePath`）
- 插件权限：由 `node tools/remote_config.js` 或 `node tools/pack_chrome.js` 根据上面配置写入 `manifest.json` 的 `host_permissions`
- 插件侧调用：只有作为 Chrome / Edge 插件运行时才会打点 / 查版本 / 下载；直接打开 `index.html` 或桌面窗口不会调用
- 上传接口：给发布方使用，**不要**做进普通用户插件菜单
- 当前默认：`origin = http://127.0.0.1`，`basePath = /eda_agent/notepad_web`

换服务器或路径时，只改 `js/remote-config.js`，再执行 `node tools/remote_config.js`（或直接 `node tools/pack_chrome.js`）。

接口一览：

| 用途 | 调用方 | 方法 | 路径 |
|---|---|---|---|
| 使用打点 | 插件 | `POST` | `/eda_agent/notepad_web/cat` |
| 查询版本 | 插件 | `GET` | `/eda_agent/notepad_web/version` |
| 下载更新包 | 插件 | `GET` | `/eda_agent/notepad_web/update.zip`（也可由 version 返回的 `url` 指定） |
| 上传新版本 | 发布方 / CI | `POST` | `/eda_agent/notepad_web/upload` |

统一更新流程：

1. 本地改代码，提高 `manifest.json` 的 `version`
2. 执行 `node tools/pack_chrome.js` 生成 zip
3. 调用上传接口，带上 zip 和版本号
4. 服务器保存为当前最新包，并更新 version 元数据
5. 用户在插件里点「更新插件」→ 查到新版本 → 下载 zip → 解压覆盖目录 → 重新加载

---

## 1. 使用打点

### 基本信息

| 项 | 值 |
|---|---|
| 方法 | `POST` |
| URL | `http://127.0.0.1/eda_agent/notepad_web/cat` |
| Header | `Content-Type: application/json` |
| Query | 无 |
| 鉴权 | 无 |
| 客户端超时 | 约 4 秒；超时或失败直接放弃 |

### 何时发送

| event | 触发时机 | action | durationMs |
|---|---|---|---|
| `open` | 插件编辑页打开 | `open` | `0` |
| `action` | 用户点了菜单 / 工具栏 / 快捷键 | 命令名，如 `save`、`openFolder`、`about`、`theme:dark` | `0` |
| `leave` | 页面关闭或离开 | `leave` | 本次页面可见的毫秒数 |

同一 `action` 在 1 秒内只会上报一次。正文不包含文件名、路径和文件内容。

### 请求 Body（JSON）

```json
{
  "installId": "6b65e0ae-e547-4a17-848e-6d24385f9da2",
  "sessionId": "3e9d583a-7833-42f9-b3c4-4cf930b57e6e",
  "version": "1.0.0",
  "event": "open",
  "action": "open",
  "ts": 1793255983955,
  "durationMs": 0
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `installId` | string | 是 | 这一次插件安装的随机编号（UUID）。不卸载则一直不变 |
| `sessionId` | string | 是 | 这一次打开编辑页的编号（UUID） |
| `version` | string | 是 | 插件 `manifest.json` 的 `version` |
| `event` | string | 是 | `open` / `action` / `leave` |
| `action` | string | 是 | 具体操作名；`open` / `leave` 时与 `event` 相同 |
| `ts` | number | 是 | 客户端发送时的 Unix 毫秒时间戳 |
| `durationMs` | number | 是 | 停留毫秒；仅 `leave` 有意义，其余为 `0` |

`action` 常见值（不完整）：`open`、`leave`、`new`、`openFile`、`openFolder`、`save`、`saveAs`、`find`、`replace`、`compare`、`about`、`updateExt`、`theme:dark`、`lang:javascript`、`enc:gbk`、`md:split` 等。

### 响应

客户端不解析状态码，也不读响应正文。

服务端建议：

- HTTP `200`
- 正文可为空，或 `{"ok":true}`
- 尽快返回；打点失败不能影响编辑器

### 服务端处理建议

1. 校验 JSON，按字段入库或写日志。
2. 用 `installId` 统计安装量 / 活跃量。
3. 用 `sessionId` 串起同一次打开中的操作。
4. 用 `action` 统计功能使用频次。
5. 用 `leave.durationMs` 估算停留时间。

---

## 2. 查询版本

### 基本信息

| 项 | 值 |
|---|---|
| 方法 | `GET` |
| URL | `http://127.0.0.1/eda_agent/notepad_web/version` |
| Header | 无特殊要求 |
| Query | 无 |
| 鉴权 | 无 |
| 客户端超时 | 约 4 秒 |
| Cache | 客户端使用 `cache: "no-store"` |

用户点击「帮助 → 更新插件」时调用。

### 成功响应

- HTTP `200`
- `Content-Type: application/json`
- Body：

```json
{
  "version": "1.0.1",
  "url": "http://127.0.0.1/eda_agent/notepad_web/update.zip"
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `version` | string | 建议必填 | 服务端当前最新插件版本，如 `1.0.1`。客户端会与本地 `manifest.version` 比较 |
| `url` | string | 否 | 更新包完整下载地址。省略时客户端使用默认 `.../update.zip` |

### 版本比较规则（客户端）

1. 去掉可选前缀 `v` / `V`
2. 按 `.`、`+`、`-` 分段，每段取整数
3. 从左到右比较；远端更大才下载

例：本地 `1.0.0`，远端 `1.0.1` → 会下载；远端 `1.0.0` → 提示已是最新。

### 失败时的客户端行为

版本接口超时、非 2xx、或 JSON 解析失败时：

- 不中断流程
- 视为「没有可用的远端版本号」
- 仍尝试下载默认更新包 `UPDATE_ZIP_URL`

### 响应示例

已是最新：

```json
{
  "version": "1.0.0",
  "url": "http://127.0.0.1/eda_agent/notepad_web/update.zip"
}
```

有新版本：

```json
{
  "version": "1.0.1",
  "url": "http://127.0.0.1/eda_agent/notepad_web/update.zip"
}
```

---

## 3. 下载更新包

### 基本信息

| 项 | 值 |
|---|---|
| 方法 | `GET` |
| 默认 URL | `http://127.0.0.1/eda_agent/notepad_web/update.zip` |
| 也可 | 使用 version 接口返回的 `url` |
| 鉴权 | 无 |

客户端通过 `chrome.downloads.download` 下载，保存为本地文件名 `NotePadWeb-chrome.zip`。

### 成功响应

- HTTP `200`
- `Content-Type: application/zip`（或 `application/octet-stream`）
- Body：zip 二进制

### Zip 内容要求

压缩包根目录必须直接包含插件文件，例如：

```text
manifest.json
index.html
css/
js/
ext/
```

不要再套一层 `NotePadWeb-chrome/` 目录。`manifest.json` 里的 `version` 应高于用户当前版本。

可用仓库里的打包命令生成：

```bash
node tools/pack_chrome.js
```

产物：`NotePadWeb-release/NotePadWeb-chrome.zip`。服务端可直接托管这份文件，或拷成 `update.zip`。

### 客户端安装说明（人工一步）

Chrome 不允许插件改写自己的安装目录。下载完成后，用户需要：

1. 解压 `NotePadWeb-chrome.zip`
2. 用解压出的文件覆盖当前「加载未打包的扩展程序」所指向的目录
3. 在插件对话框点「重新加载」，或到扩展页点重新加载

服务端只需提供可下载的 zip；覆盖目录由用户完成。

---

## CORS 与跨域

插件页面源类似：

```text
chrome-extension://<扩展ID>
```

对 `fetch`（打点、查版本）建议服务端允许：

```http
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, X-Upload-Token
```

若浏览器预检 `OPTIONS`，请对 `/cat`、`/version` 返回上述头。上传接口一般由发布脚本调用，可不对浏览器开放 CORS，但仍建议校验 Token。

`chrome.downloads` 下载 zip 一般不走页面 CORS；仍建议下载地址可公网或内网直连访问。

---

## 4. 上传新版本（发布方）

用于把新的插件 zip 发到服务器，实现集中更新。普通插件用户不会调用这个接口。

### 基本信息

| 项 | 值 |
|---|---|
| 方法 | `POST` |
| URL | `http://127.0.0.1/eda_agent/notepad_web/upload` |
| Content-Type | `multipart/form-data` |
| 鉴权 | 请求头 `X-Upload-Token: <发布口令>`（服务端自定义口令；未带或错误时返回 `401`） |

### 表单字段

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `version` | string | 是 | 新版本号，须与 zip 内 `manifest.json` 的 `version` 一致，如 `1.0.1` |
| `file` | file | 是 | 插件 zip 二进制。根目录须直接含 `manifest.json`、`index.html`、`css/`、`js/`、`ext/` |
| `notes` | string | 否 | 更新说明，可写入服务端日志或管理页 |
| `force` | string | 否 | 传 `1` 时允许覆盖已存在的相同版本；默认拒绝重复上传同一版本 |

### 请求示例（curl）

```bash
curl -X POST "http://127.0.0.1/eda_agent/notepad_web/upload" \
  -H "X-Upload-Token: 你的发布口令" \
  -F "version=1.0.1" \
  -F "notes=修复更新提示" \
  -F "file=@NotePadWeb-release/NotePadWeb-chrome.zip;type=application/zip"
```

仓库内也可执行：

```bash
node tools/pack_chrome.js
set NOTEPADWEB_UPLOAD_TOKEN=你的发布口令
node tools/upload_chrome.js
```

可选环境变量：

| 变量 | 默认 | 说明 |
|---|---|---|
| `NOTEPADWEB_UPLOAD_URL` | `http://127.0.0.1/eda_agent/notepad_web/upload` | 上传地址 |
| `NOTEPADWEB_UPLOAD_TOKEN` | 空 | 写入 `X-Upload-Token` |
| `NOTEPADWEB_UPLOAD_NOTES` | 空 | 更新说明 |
| `NOTEPADWEB_UPLOAD_FORCE` | 空 | 设为 `1` 时强制覆盖同版本 |

### 成功响应

HTTP `200`，`Content-Type: application/json`：

```json
{
  "ok": true,
  "version": "1.0.1",
  "url": "http://127.0.0.1/eda_agent/notepad_web/update.zip",
  "size": 170596,
  "sha256": "可选，文件摘要",
  "uploadedAt": 1793255983955
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `ok` | boolean | 是否成功 |
| `version` | string | 已登记的版本号 |
| `url` | string | 之后插件下载应使用的地址；建议与 `GET /version` 返回的 `url` 一致 |
| `size` | number | zip 字节数 |
| `sha256` | string | 可选 |
| `uploadedAt` | number | 可选，上传完成的毫秒时间戳 |

### 失败响应建议

| HTTP | 场景 | Body 示例 |
|---|---|---|
| `400` | 缺字段、不是 zip、zip 内没有 `manifest.json`、version 与包内不一致 | `{"ok":false,"error":"version mismatch"}` |
| `401` | Token 缺失或错误 | `{"ok":false,"error":"unauthorized"}` |
| `409` | 同版本已存在且未传 `force=1` | `{"ok":false,"error":"version exists"}` |
| `413` | 文件过大 | `{"ok":false,"error":"too large"}` |
| `500` | 存储失败 | `{"ok":false,"error":"store failed"}` |

### 服务端落盘建议

上传成功后，服务端应立刻让「查版本」和「下载」生效：

1. 校验 `X-Upload-Token`
2. 校验 `file` 为 zip，且根目录有 `manifest.json`
3. 读取包内 `version`，与表单 `version` 比对，不一致则 `400`
4. 保存 zip，例如：
   - 当前最新：`.../update.zip`（覆盖）
   - 历史可选：`.../releases/1.0.1.zip`
5. 更新元数据，使 `GET /version` 返回：

```json
{
  "version": "1.0.1",
  "url": "http://127.0.0.1/eda_agent/notepad_web/update.zip"
}
```

6. `GET /update.zip` 返回刚上传的内容，`Content-Type: application/zip`

这样所有装了插件的机器，只要还能访问这台服务器，点「更新插件」都会拿到同一份最新包。

### 安全注意

- 上传口令只给发布人或 CI，不要写进插件源码
- 上传接口不要对公网匿名开放
- 建议限制上传体积（例如 20MB 以内）
- 建议只接受 zip，并检查包内必须有 `manifest.json`

---

## 错误与可用性

| 场景 | 客户端 / 发布方行为 |
|---|---|
| 打点失败 / 超时 / 4xx / 5xx | 插件静默忽略，编辑器继续可用 |
| 版本接口失败 | 插件仍尝试下载默认 `update.zip` |
| 更新包下载失败 | 插件弹窗提示，编辑器继续可用 |
| 上传 Token 错误 | 发布脚本失败退出，服务器保持旧版本 |
| 服务器未部署 | 插件功能照常用；只是没有打点和在线更新 |

服务端实现时，打点接口应尽快响应；上传接口可稍慢，但应在成功返回前完成落盘与 version 元数据更新。

---

## 配置对照（改服务器时）

只改 `js/remote-config.js`：

```js
ND.remote = {
  origin: "http://127.0.0.1",
  basePath: "/eda_agent/notepad_web",
  ...
};
```

由此自动拼出：

| 用途 | 拼法 | 当前结果 |
|---|---|---|
| 打点 | `origin + basePath + /cat` | `http://127.0.0.1/eda_agent/notepad_web/cat` |
| 版本 | `.../version` | `http://127.0.0.1/eda_agent/notepad_web/version` |
| 更新包 | `.../update.zip` | `http://127.0.0.1/eda_agent/notepad_web/update.zip` |
| 上传 | `.../upload` | `http://127.0.0.1/eda_agent/notepad_web/upload` |
| 主机权限 | `origin + /*` | `http://127.0.0.1/*` |

上传口令仍用环境变量 `NOTEPADWEB_UPLOAD_TOKEN`，不要写进源码。若临时改上传地址，可用 `NOTEPADWEB_UPLOAD_URL` 覆盖。

改完后执行：

```bash
node tools/remote_config.js
# 或直接打包（打包时会自动同步 manifest）
node tools/pack_chrome.js
```

然后在扩展页点一次「重新加载」。
