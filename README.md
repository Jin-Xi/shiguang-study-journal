# 拾光本地工作台

用于按天记录学习、复习和选择性发布的本地工具。网页界面只在本机打开，私人数据不会被提交到 GitHub。

## 启动

需要 Node.js 22+ 和已登录的 GitHub CLI。

```bash
npm install
npm run local
```

启动后会自动打开 `http://127.0.0.1:4317`。

## 数据和发布

- 私人日志默认保存在相邻的 `shiguang-data` 目录。
- 公开博客默认位于相邻的 `public-blog` 目录。
- 点击“发布到 GitHub”时，只导出已勾选公开的记录，并在博客构建通过后提交和推送。
- GitHub Actions 会自动更新 `https://jin-xi.github.io/`。

可以通过 `SHIGUANG_DATA_DIR`、`SHIGUANG_BLOG_DIR` 和 `SHIGUANG_PORT` 环境变量修改默认路径和端口。
