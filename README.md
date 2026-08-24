# Angelica's Photographic Journal

一个按年份维护、从新到旧阅读的静态摄影时间日志。网站使用 Astro 构建并由 GitHub Pages 发布；日常更新不需要修改前端代码。

## 发布一篇日志

1. 把照片放进 `public/images/年份/`，例如 `public/images/2026/sunset.jpg`。
2. 打开对应年份文件，例如 `content/2026.md`。
3. 新增以下内容（写在文件任何位置都可以，网站会自动按日期倒序）：

   ```markdown
   ## 2026-08-23

   ![照片的简短说明](/images/2026/sunset.jpg)

   第一段会自动成为照片旁边的导语。

   第二段开始显示在照片下方。
   ```

4. Commit 并 push 到 `main`。GitHub Actions 会自动检查、构建和发布。

两张照片时，把两行图片连续写在日期后。新的一年只需新建 `content/2027.md`；年份和月份菜单会自动更新。

构建会阻止非法日期、重复日期、年份不匹配和空日志。没有照片时会给出 warning，但文字仍可正常发布。

## 本地预览

需要 Node.js 22：

```text
npm install
npm run dev
```

完整检查：`npm run check && npm test && npm run build`。
