# 📄 dsh-md-preview

[English](./README.md) | **简体中文**

> **在会话里直接看、改、导出 Markdown，不用切走。**

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web 界面加一个预览抽屉。在会话头部点 **MD**，浏览当前工作目录，点开 `.md` 文件就地渲染。不开新标签页，不开第二个编辑器，不打断手头的事。

---

## 安装

目前还没发布到 npm，直接从 GitHub 装。在 profile 的 `package.json` 里加：

```jsonc
// ~/.dsh/profiles/<profile>/package.json
{
  "dependencies": {
    "dsh-md-preview": "github:LeslieWylie/dsh-md-preview"
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

想锁版本而不是跟随默认分支，用 `github:LeslieWylie/dsh-md-preview#v0.1.0`。

<details>
<summary>不改 profile 先试一下</summary>

```sh
dsh --profile web --patch <(printf -- "- insert:\n    - id: md-preview\n      name: dsh-md-preview\n")
```

包本身仍然要能从 profile 的 `node_modules` 解析出来，所以还是得先跑上面的 `pnpm install`。
</details>

---

## 能做什么

| | |
|---|---|
| **就地浏览** | 抽屉打开时停在当前工作目录。点文件夹进入，**↑** 返回上级。不弹系统文件选择框。 |
| **点开即渲染** | 标题、粗体 / 斜体 / 删除线、行内代码、围栏代码块、引用、有序 / 无序列表、任务列表、表格、链接、图片、分割线。 |
| **编辑** | 切到纯文本框改一行或记点东西，再切回来。 |
| **导出** | 在源文件旁边写出一个**独立**的样式化 HTML 页面——自包含、跟随系统深色模式、在哪都能打开。 |
| **跟随主题** | 读取 harness 的主题变量，明暗自适应，不用配置。 |

## 为什么还要再写一个 Markdown 插件

这个插件刻意不做三件事：

- **没有运行时依赖。** Client 半以普通脚本加载，没有打包器，因此 `marked`、`markdown-it` 这类库根本用不了。渲染器是约 150 行手写 JavaScript。你要审的依赖树就是这一个文件。
- **不新开一条访问磁盘的路。** 所有读写都走 harness 的 `fs` 服务，因此插件继承会话本身已有的沙箱策略，不自己另开文件系统权限。`readFile` 只接受 `.md`、`.markdown`、`.mdx`、`.txt`。
- **不执行原始 HTML。** 文档里的每一段文本都先做 HTML 转义再处理行内语法；链接目标只要不是 `http(s):`、`#`、`/`、`mailto:` 就一律降级成 `#`。含 `<script>` 或 `javascript:` 链接的文档会原样显示成字符。

## 工作方式

两个半边，通过一条私有 RPC 通道通信：

```
Web client 半                         Host 半
 slots.inject(header, overlay)  ──▶   ctx.connection.rpc.handle("/dsh-md-preview")
 在浏览器里渲染 Markdown               ls · up · readFile · export ──▶ ctx.fs
```

Host 半永远不渲染，client 半永远不碰磁盘。

## 兼容性

需要带 Web 界面的 harness（`ctx.slots`、`ctx.connection`），以及 host 侧的 `ctx.fs` 服务。如果没有 `fs`，插件会打一条警告日志并保持不激活，而不是加载一半。

## 许可

MIT
