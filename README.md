# NotePadWeb--

开箱即用的网页版文本编辑器。没有安装包，没有构建步骤，也没有后端：用浏览器打开 `index.html` 就能写字、打开文件夹、保存文件。

界面是中文的。编辑器、语法高亮、Markdown 预览、编码转换和文件对比都是这个仓库里的自研代码，不依赖 Monaco、CodeMirror 或其他前端框架。

## 怎么用

1. 克隆仓库，或下载 ZIP 后解压。
2. 用 Chrome 或 Edge 打开 `index.html`。
3. 直接输入文字，或从欢迎页打开文件、文件夹、示例。

推荐用本地静态服务器打开（例如 `python -m http.server`），地址会是 `http://localhost`。这时浏览器把页面当成安全上下文，**打开文件夹**可以读写你选中的目录，`Ctrl+S` 能写回原文件。

用 Chrome 或 Edge 通过 `http://localhost` 或 `https://` 打开时，文件夹和当时打开的文件会记在这台浏览器的 IndexedDB 里。下次访问同一个网址，如果许可还在，会自动重新打开；如果浏览器要求再确认，页面顶部会出现「恢复」。记录的是文件句柄，不是一份文字副本：没保存的修改不会留到下次，重新打开的是磁盘上的内容。拖进页面、或不用系统文件框而用普通选择框打开的内容，没有可再次使用的句柄，关页后不会回来。换浏览器、换电脑或清除站点数据后，记录也会消失。

直接双击 `index.html`（`file://`）也可以编辑。这种情况下浏览器通常不允许写回原路径，保存会下载一份副本，也不会记住上次打开的文件夹。

## 桌面版

桌面程序用 [Neutralino](https://neutralino.js.org/) 包同一套页面。Windows 和 Linux 都走本机文件：打开文件夹拿到真实路径，`Ctrl+S` 写回原文件，下次启动会按路径重新打开。浏览器里打开 `index.html` 的用法仍然保留。

需要 Node.js。

```bash
npm install
npm run setup
npm run desktop
```

`npm run setup` 下载各平台的 Neutralino 运行时。`npm run desktop` 打开桌面窗口。

打包：

```bash
npm run build
```

产物不在这个仓库里，而在上一级目录的 `NotePadWeb-release`。在 Windows 上打包也会同时得到 Linux 包，因为 Linux 运行时是现成的二进制，和同一份 `resources.neu` 放在一起。打包结束后，仓库里的下载文件和中间目录会被清掉。

- `NotePadWeb-release/NotePadWeb-windows.zip`：解压后运行 `NotePadWeb-win_x64.exe`。Windows 10/11 一般已经带有 WebView2。
- `NotePadWeb-release/NotePadWeb-linux.zip`：解压后执行 `chmod +x NotePadWeb-linux_x64 && ./NotePadWeb-linux_x64`。桌面环境里要有 GTK3 和 WebKitGTK（Debian/Ubuntu 上是 `libgtk-3-0` 与 `libwebkit2gtk-4.1-0` 或 `libwebkit2gtk-4.0-37`）。很多桌面发行版已经有这两样。很老的发行版或没有图形桌面的机器不在支持范围内。

页面资源打进 `resources.neu`，和对应平台的小运行时放在一起。运行时本身不包含网页引擎，所以 Linux 包只有几兆，引擎用系统里的那一份。

## 能做什么

- 多标签编辑，撤销 / 重做，行选择、词选择和按住 Alt 拖出的列选择
- 自动缩进、括号与引号补全、当前文档里的词语联想
- 行号、书签、代码折叠、缩略图、空白字符、自动换行、缩放和全屏
- 按扩展名高亮：JavaScript、TypeScript、Python、Java、C、C++、C#、Go、Rust、HTML、XML、CSS、JSON、SQL、Shell、YAML、Markdown、TCL、Verilog，以及常见配置文件
- 侧栏里的文件夹树、已打开文档、函数 / 类列表；可以同时挂上多个文件夹
- 查找和替换（区分大小写、全词、正则），以及在已打开文件夹里搜索
- 跳转到行、匹配括号、行注释和块注释
- 编码：UTF-8、UTF-8 BOM、GBK、GB18030、UTF-16 LE；打开时按 BOM 和内容判断，保存时按当前编码写回。换行支持 CRLF、LF、CR
- Markdown 源码、并排预览、仅预览。预览支持标题、列表、任务列表、表格、代码块和安全链接
- 十六进制查看和改字节。看起来像二进制的文件会自动用十六进制打开
- 对比两个文件、和打开时的内容比较、对比两个文件夹
- 录制并重放一段编辑操作
- MD5、SHA-256、Base64、URL 编解码、JSON / XML 整理、字数统计
- 六套主题，首选项记在本机 `localStorage`（键名 `notepadmm.settings`）

常用快捷键：

| 操作 | 快捷键 |
| --- | --- |
| 新建 / 打开文件 / 打开文件夹 | `Ctrl+N` / `Ctrl+O` / `Ctrl+Alt+O` |
| 保存 / 另存为 / 全部保存 | `Ctrl+S` / `Ctrl+Shift+S` / `Ctrl+Shift+A` |
| 查找 / 替换 / 在文件中查找 | `Ctrl+F` / `Ctrl+H` / `Ctrl+Shift+F` |
| 下一个 / 上一个匹配 | `F3` / `Shift+F3` |
| 跳转到行 | `Ctrl+G` |
| 书签 | `Ctrl+F2`，`F2` / `Shift+F2` 切换 |
| 行注释 | `Ctrl+/` |
| 复制当前行 / 删除当前行 | `Ctrl+D` / `Ctrl+Shift+L` |
| 上移 / 下移行 | `Alt+Up` / `Alt+Down` |
| Markdown 并排预览 | `Ctrl+Shift+M` |
| 开始录制宏 / 播放宏 | `Ctrl+Shift+R` / `Ctrl+Shift+P` |

菜单里能看到完整列表。帮助 → 快捷键也会列出来。

## 浏览器

| 环境 | 打开与保存 |
| --- | --- |
| Chrome、Edge，且页面在 `https://` 或 `http://localhost` | 使用 File System Access API。选中的文件夹可浏览，保存写回原文件 |
| 直接打开本地 `index.html`，或其他不支持该 API 的浏览器 | 用文件选择框打开。保存时下载副本，不改磁盘上的原文件 |

编辑器本身只需要较新的桌面浏览器：`TextEncoder` / `TextDecoder`、`localStorage`、Canvas。GBK 解码使用浏览器自带的 `gb18030`。

## 大文件

为了避免把超大文件整份放进页面、或把只读了开头的内容覆盖回完整文件：

- 约 1.5 MB 以上的文本不再做语法高亮，也不再和“打开时的内容”做对比基准
- 超过约 2 MB 时只载入开头约 1 MB，并标成只读。直接保存会被拒绝，以免截断原文件
- 更大的二进制文件只打开开头约 1 MB 的十六进制窗口
- 超过约 2 万行时关闭自动换行

另存为截断内容时，界面会先说明写出的只是已载入的开头。

## 目录

```
index.html          页面骨架，按固定顺序加载脚本
css/app.css         界面、主题、编辑器和预览样式
js/model.js         文档模型：光标、选区、撤销、折叠、书签、查找替换
js/editor.js        自绘视图，只渲染可见行；输入法、十六进制、缩略图
js/highlight.js     按行的词法高亮和符号列表
js/markdown.js      Markdown 转 HTML
js/codec.js         编码、换行、MD5、SHA-256
js/gbk.js           生成好的 GBK 编码表，不要手改
js/diff.js          行对比；大文件用唯一行作锚点，短行再做字符级差异
js/native.js        桌面版的本机文件接口；浏览器里打开时不生效
js/app.js           菜单、标签、文件夹、设置和各种命令
neutralino.config.json  桌面窗口和打包配置
tools/gen_gbk.py    重新生成 js/gbk.js
tools/gen_icon.js   打包时生成窗口图标
tools/stage_frontend.js  打包前把页面收进临时目录
tools/pack_desktop.js    把 Windows / Linux 包放到仓库外
tools/clean.js      清掉打包留下的中间文件
```

脚本都挂在全局对象 `ND` 上，没有打包器。`index.html` 底部的加载顺序就是模块依赖顺序。

## 本地修改

改完 `html` / `css` / `js` 后刷新页面即可，不需要安装 npm 包。

只有在需要重做 GBK 编码表时才运行：

```bash
python tools/gen_gbk.py
```

脚本用 Python 标准库把 BMP 里能编成双字节 GBK 的字符写成 `js/gbk.js`。保存为 GBK / GB18030 时走的是这张表；表里没有的字符会提示改用 UTF-8，不会静默丢字。GB18030 的四字节字符不在这张表里。

## 参与维护

Issues 和 Pull Requests 都欢迎。改界面或编辑行为时，请用 Chrome 或 Edge 把对应路径走一遍：新建、打开、编辑、撤销、保存，以及你改到的编码、预览或对比。

建议的提交粒度：一次改动解决一件事，说明为什么改。`js/gbk.js` 是生成文件，和 `tools/gen_gbk.py` 一起提交。

## 许可

[MIT License](LICENSE)。可以自由使用、修改和再发布，保留版权声明即可。
