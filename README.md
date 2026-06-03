# 四级背单词

一个面向大学英语四级的词汇、阅读、作文与复习工具。支持高频词学习、错词测验、间隔复习、阅读高亮查词、作文草稿与模板填空练习。

## 功能

- 高频词 / 全词库切换
- 单词学习、错词记录、错词测验
- 今日复习队列与间隔复习
- 词表搜索、加入错词、标记掌握
- 阅读文章朗读、停止朗读、高频词高亮
- 作文真题/预测题草稿、词数统计、模板填空
- 学习数据统计
- Android APK 打包
- iOS Capacitor 工程

## 本地运行

```bash
npm install
npm run dev
```

## 构建网站

```bash
npm run build
npm run preview
```

构建产物在 `dist/`。

## GitHub Pages 部署

项目已包含 GitHub Pages 自动部署工作流：

```text
.github/workflows/deploy-pages.yml
```

上传到 GitHub 后，在仓库设置中打开：

```text
Settings -> Pages -> Build and deployment -> Source -> GitHub Actions
```

之后推送到 `main` 分支会自动发布网站。

网站地址通常是：

```text
https://你的用户名.github.io/仓库名/
```

## Android APK

```bash
npm run cap:apk
```

生成位置：

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## iPhone 使用

iPhone 推荐两种方式：

1. 用 Safari 打开部署后的网站，选择“添加到主屏幕”。
2. 使用 `ios/` 下的 Capacitor 工程，在 macOS + Xcode 中编译并签名。

Windows 不能直接生成可安装的 iPhone `.ipa`，需要 macOS、Xcode 和 Apple 签名。

## 开源说明

如果你要公开仓库，请先确认 `.env.local` 里没有私密 API Key。项目默认不会把 `.env.local` 提交到 Git。
