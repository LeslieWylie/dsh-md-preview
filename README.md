# dsh-md-preview

**DeepSeek Harness Web GUI 的 Markdown 侧边抽屉预览插件。**

点击会话头部 **MD** 按钮打开右侧抽屉：浏览当前工作目录，点选 `.md` 文件即得
GitHub 风格即时预览；可切换编辑模式实时改源码，或将渲染结果导出为独立 HTML。

## 功能

- 会话头部 **MD** 按钮开合右侧抽屉
- **内置目录导航**：打开即显示当前工作目录；点目录进入、`⬆` 返回上级——无需系统目录选择器
- 点 / 双击 `.md` 文件即渲染
- **预览 / 编辑** 切换，编辑时实时重渲染
- GitHub 风格渲染：标题、粗/斜/删除线、行内代码、围栏代码块、引用、有序/无序列表、
  **任务列表**、**表格**、链接、图片、水平线
- **导出**：将当前文档渲染为独立样式化 HTML 写入当前目录
- 状态栏：行数 / 当前文件 / 提示与错误
- 主题自适应：跟随 DSH `--dsw-alias-*` CSS 变量（明暗双主题）

## 文件

| 文件 | 作用 |
|---|---|
| `host.js` | Host 半：`md/ls`、`md/up`、`md/readFile`、`md/export` 包私有 RPC，走 `fs` 服务 |
| `client.js` | Client 半：手写轻量 Markdown 解析器 + 抽屉 UI + 主题感知 CSS |

## 安装 / 部署

本插件以**动态 Cordis 插件快照**形式发布（Host + Client 双半），通过 DSH 插件工作流部署：
`cordis_define`（`code.host` 填 `host.js` 内容、`code.client` 填 `client.js` 内容）后再
`cordis_run`（Client 半首次运行需在 UI 批准）。动态插件为进程内存活，进程重启后请从本仓库
文件重新部署。

若需要静态、可 npm 分发的 bundle 形态（仅 Host），参考配套 `dsh-md-html-render` 工具的风格：
`package.json` 声明 `dsh.bundle.patch` + `cordis.patch.yml`，经
`dsh plugin --profile <name> add <pkg>` 安装。

## 设计说明

- 分屏实时预览布局参考 StackEdit / HackMD
- 排版与表格边框采 GitHub 风格
- 响应式表格与代码展示参考 Codex CLI 的渲染管线
- Client 沙箱无 `import`/bundler，故解析器为**手写纯 JS**：
  所有文本先 HTML 转义再处理行内语法，预览不执行原始脚本

## 许可

MIT