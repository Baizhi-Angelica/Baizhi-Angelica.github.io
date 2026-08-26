# Angelica's Photographic Journal

一个按年份维护、从新到旧阅读的静态摄影时间日志。网站使用 Astro 构建并由 GitHub Pages 发布；日常更新不需要修改前端代码。

## 发布一篇日志

1. 把 JPG、JPEG 或 PNG 原图放进 `public/images/年份/`，例如 `public/images/2026/sunset.JPG`。
2. 打开对应年份文件，例如 `content/2026.md`。
3. 新增以下内容（写在文件任何位置都可以，网站会自动按日期倒序）：

   ```markdown
   ## 2026-08-23

   ![照片的简短说明](/images/2026/sunset.JPG)

   第一段会自动成为照片旁边的导语。

   第二段开始显示在照片下方。
   ```

4. 双击本地的 `02_COMMIT_AND_PUSH.bat`。它会自动压缩照片、更新 Markdown、Commit 并 push；GitHub Actions 随后自动构建和发布。

两张照片时，把两行图片连续写在日期后。新的一年只需新建 `content/2027.md`；年份和月份菜单会自动更新。

照片发布时会保持主文件名不变，例如 `sunset.JPG` 会生成 `sunset.webp`，Markdown 中的路径也会自动改成 `.webp`。转换后的大图不会低于 2 MB；如果缩小版本低于这个下限，程序会自动保留更高分辨率或更高质量。原图会移动到本地 `.photos-src/年份/` 目录，网站和 Git 只保存 WebP。`.photos-src` 不会上传 GitHub，请把相机原片另外做好正式备份。

构建会阻止非法日期、重复日期、年份不匹配和空日志。没有照片时会给出 warning，但文字仍可正常发布。

## 本地预览

需要 Node.js 22：

```text
npm install
npm run dev
```

完整检查：`npm run check && npm test && npm run build`。

单独执行照片处理：`npm run photos`。通常无需手动运行，双击 `02_COMMIT_AND_PUSH.bat` 即会自动执行。

## License / 授权

本仓库的源码与摄影内容分别采用不同许可证：

- **网站源码**：MIT License，详见 [`LICENSE`](./LICENSE)。
- **摄影作品及原创日志文字**：Creative Commons
  Attribution-NonCommercial-ShareAlike 4.0 International
  （**CC BY-NC-SA 4.0**），详见
  [`LICENSE-CONTENT.md`](./LICENSE-CONTENT.md)。

除非另有说明，`public/images/` 中的原创摄影作品以及 `content/`
中的原创日志内容均适用 CC BY-NC-SA 4.0。

第三方素材仍按照其各自的版权及许可条款使用。

```
MIT
├── src/**
├── scripts/**
├── astro.config.mjs
├── package.json
├── package-lock.json
├── *.bat
└── .github/workflows/**

CC BY-NC-SA 4.0
├── public/images/**
└── content/**
```