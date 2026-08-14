# 📄 dsh-md-preview

[English](./README.md) | **简体中文**

> **把 Markdown 变成一个可以直接发给别人的网页。**

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 Markdown 渲染插件，两个入口、一套引擎：

- **`md_html_render`** —— 模型可以直接调用的工具。传入 Markdown，返回一份完整、自包含的 HTML 文档，可选写入磁盘。**无图形界面的 headless 配置下同样可用**。
- **MD 抽屉** —— 在网页会话头部按 **MD**，浏览当前工作目录，点开任意 `.md` 文件即时渲染。不开新标签页，不换编辑器，不打断当前上下文。

两者共用同一个渲染器，所以模型生成的页面和你从抽屉导出的页面**逐字节一致**——这一点由测试对整个用例集断言。

![MD 抽屉在会话上层展开，就地渲染一份 README](https://raw.githubusercontent.com/LeslieWylie/dsh-md-preview/main/docs/drawer.png)

---

## 安装

尚未发布到 npm，直接从 GitHub 安装。写进你的 profile `package.json`：

```jsonc
// ~/.dsh/profiles/<profile>/package.json
{
  "dependencies": {
    "dsh-md-preview": "github:LeslieWylie/dsh-md-preview#v0.2.2"
  },
  "dsh": {
    "profile": {
      "bundles": ["dsh-md-preview"]
    }
  }
}
```

然后重装并重启 profile：

```sh
cd ~/.dsh/profiles/<profile> && pnpm install
dsh --profile <profile>
```

去掉 `#v0.2.2` 即可跟随默认分支，不锁版本。

<details>
<summary>不改 profile 直接试用</summary>

```sh
dsh --profile web --patch <(printf -- "- insert:\n    - id: md-preview\n      name: dsh-md-preview\n")
```

包本身仍需能从 profile 的 `node_modules` 解析到，所以还是要先执行上面的 `pnpm install`。
</details>

---

## 工具

```
md_html_render(markdown, title?, save_path?) -> { html, savedPath?, error? }
```

| 参数 | | |
|---|---|---|
| `markdown` | 必填 | Markdown 原文。 |
| `title` | 可选 | 网页 `<title>`，缺省为 `Markdown`。 |
| `save_path` | 可选 | 写入路径。经由会话文件服务解析，因此与其他写操作遵守同一套沙箱策略。 |

报告、方案、对比表——任何原本只能堆在对话里的内容，都可以变成一个能用浏览器打开、能直接发给同事的文件。

> 把这份迁移方案渲染到 `~/Desktop/plan.html`

产物是**自包含**的：样式内嵌，不加载任何外部样式表、字体、脚本或图片。从磁盘打开、从 U 盘打开、在完全断网的机器上打开，效果都一样，并且自动跟随阅读者的深色模式。它不会向外发起任何请求，因为根本没有可发起的目标。

![导出的页面直接从磁盘打开——单文件，不联网](https://raw.githubusercontent.com/LeslieWylie/dsh-md-preview/main/docs/export.png)

如果 `save_path` 被沙箱拒绝，工具仍会连同错误信息一起返回 HTML 正文，不会因为一个权限问题就把成果丢掉。

## 抽屉

| | |
|---|---|
| **原地浏览** | 从当前工作目录打开。点文件夹进入，**↑** 返回上级。不弹系统文件对话框。 |
| **点开即渲染** | 标题、粗体/斜体/删除线、行内代码、围栏代码块、引用、有序/无序/任务列表、表格、链接、图片、分隔线。 |
| **编辑** | 切换到纯文本框改一行或记点东西，再切回渲染视图。 |
| **导出** | 在源文件旁写出一份自包含 HTML —— 与 `md_html_render` 产出的是同一份文档。 |
| **主题自适应** | 读取 harness 主题变量，明暗主题都无需额外配置。 |

## 为什么还要再写一个 Markdown 插件

三件这个插件坚持不做的事：

- **零运行时依赖。** 客户端半边以纯脚本方式加载、不经打包器，因此 `marked`、`markdown-it` 这类库根本用不了。渲染器是约 150 行手写 JavaScript，你要审计的依赖树就是这一个文件。
- **不开第二条通往磁盘的路。** 所有读写都走 harness 的 `fs` 服务，因此插件直接继承会话已有的沙箱策略，绝不自行开辟文件访问通道。抽屉的 `readFile` 会拒绝 `.md`、`.markdown`、`.mdx`、`.txt` 以外的一切。
- **不执行任何原始 HTML。** 文档文本在任何行内语法处理之前就已全部转义；非 `http(s):`、`#`、`/`、`mailto:` 的链接目标一律折叠为 `#`。含 `<script>` 或 `javascript:` 链接的文档只会渲染成字面字符。

## 工作原理

```
                        lib/render.js          ← 唯一的渲染器
                       ╱             ╲
   md_html_render  ◀──╯               ╰──▶  导出按钮
   （宿主端，可无界面）                        （客户端，浏览器内）
          │                                        │
          ╰──────────▶  ctx.fs  ◀──────────────────╯
                     所有读写都走这里
```

只有 `fs` 是硬依赖。工具注册表和客户端连接都通过 `ctx.inject` 按需获取，因此插件在 headless、在网页界面、或两者同时存在的情况下都能运行，并自动退化到当前 profile 实际具备的那个入口，而不是直接加载失败。

## 兼容性

| Profile 形态 | 你会得到 |
|---|---|
| Headless / 命令行 | `md_html_render` |
| 网页界面 | `md_html_render` **加上** MD 抽屉 |
| 无 `fs` 服务 | 打印一条警告并保持惰性，而不是半加载 |

需要 Node `^22.19.0 || >=24.0.0`。

## 测试

```sh
npm test
```

四套真实执行的测试，不对被测对象打桩：

- **`tests/render.test.cjs`** 从浏览器 bundle 中把客户端渲染器抽出来实际运行。
- **`tests/host.test.mjs`** 用同一套用例集跑宿主端渲染器，**断言两者输出完全一致**（正是这种漂移，导致此前出现了两个互相竞争的 Markdown 插件，后来才合并），再用桩 context 驱动 `apply()`，检查工具形态、RPC 各端点，以及沙箱拒写时的兜底路径。
- **`tests/client.test.mjs`** 覆盖抽屉的路径渲染，包括下文提到的 bidi 处理。
- **`tests/boot.test.mjs`** 启动一个真实的 harness `Context`，加载 harness 自己的文件服务，按 profile 的方式装载本包，然后向**真实的**工具注册表索取 `md_html_render` 并对真实磁盘执行一次。

最后这套的存在理由是：DSH 插件完全可能顺利 import、跑过全部单元测试，却在 `Context` 真正启动时什么都没注册——而且是静默的，不报错。单元测试看不见这件事。

它需要 harness 依赖，所以缺依赖时是"跳过"而不是"失败"。这恰恰让跳过这条路径变得危险：集成那一半根本没跑的时候，绿勾什么也证明不了。因此 harness 依赖被放在普通的 **`devDependencies`** 里，而不是可选 peer——npm 不会自动安装可选 peer，用那种方式声明，正好会让这套测试在 CI 里被永久跳过。从全新 clone 执行 `npm install && npm test` 就会真实跑到。**如果日志里写的是 `SKIPPED`，这次运行就应当视为未经验证。**

XSS 相关断言检查的是一条结构性不变式——任何生成的标签都不会出现未闭合的属性或 `on*=` 事件处理器——并且测试里还包含"检查器本身遇到真正危险的标记时会变红"的元断言，避免一条安全断言悄悄退化成永远通过的摆设。

## 附注

**路径栏开头的 `~/`。** 面包屑用了 `direction: rtl`，这样当路径长过栏宽时，`text-overflow: ellipsis` 会从**开头**截断，保留最深的那一级目录——也就是你真正在看的那部分。副作用是：开头那串双向中性字符（`~/` 正是如此）会被重排到末尾，`~/projects/app` 显示成了 `projects/app/~`。解法是在开头加一个 U+200E（从左至右标记），它把这串字符锚定为 LTR，同时不影响从头截断的行为。`unicode-bidi: plaintext` 同样能修好顺序，但会把省略号翻回尾部，丢掉当初用 `rtl` 想要的那个特性；而把标记加在**末尾**则完全没有效果。这一行为由 `tests/client.test.mjs` 固定。

**截图是生成的，不是摆拍的。** `node docs/screenshot.mjs --shoot` 会用真实渲染器重建两张图，其中抽屉的 CSS 是从 `lib/client.js` 里切出来的而非重新誊写，因此不会和插件实际画出来的样子发生漂移。

## 许可

MIT
