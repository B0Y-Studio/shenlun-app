# 申论积累 (ShenlunApp)

> 申论备考一站式应用：精读素材 / 真题练习 / 复盘回顾 / 分析建议 / 积累笔记

V3 方案 Android 工程。

## 目录

- [`ShenlunApp/`](./ShenlunApp) — React Native 主工程源码
- [`ShenlunApp_V3_AndroidStudio/`](./ShenlunApp_V3_AndroidStudio) — V3 定稿的 Android Studio 工程副本
- [`docs/mockups/`](./docs/mockups) — 设计稿 HTML
- [`docs/sessions/`](./docs/sessions) — 历史会话记录

## V3 设计要点

V3 首页布局严格对照 `docs/mockups/home_v3_panel.html`：

| 区域 | 元素 |
|------|------|
| 头部 | "申论" 28px 衬线粗体 + 右侧旋转 -3° 红色日期印章 |
| 锦言 | 大字"锦言" + 红色"换一句" + 13.5px 楷体斜体正文 + 红色引号 |
| 昨日总结 | 居中"昨 日 总 结" + 3 列虚线分隔数字（已读/标记/分钟） |
| 今日待做 | "今 日 待 做" eyebrow + 22px 衬线粗体标题 + 黄铜斜纹进度段 + 右上角虚线圆 |
| 主菜单 | 5 行：壹/贰/叁/肆/伍 衬线斜体 + 标题 + 副标题 + › |
| 底部 Tab | 5 个楷体加粗 tab（积累/素材/题目/分析/设置），active 红色 + 3px 下划线 |

设计 tokens：宣纸 `#F0EAD6` / 深栗 `#1C1714` / 印章红 `#C04851` / 黄铜金 `#C9A962` / 纸白 `#FFFBF0`。

## 技术栈

- React Native 0.74.5 + TypeScript 5
- React Navigation 6 (native-stack)
- MMKV 2.12.2 (本地存储)
- SourceHanSerifCN 4 字重 (Regular/Medium/Bold/Heavy)
- Hermes JS engine
- Gradle 8.6 + Kotlin 1.9.22 + JDK 17

## 打开方式

### Android Studio

```
File → Open → 选择 ShenlunApp_V3_AndroidStudio/android
```

**关键配置：**

1. **Gradle JDK** = `C:\Users\hecto\jdk17\jdk-17.0.19+10`
2. **gradle.properties** 增加：
   ```
   org.gradle.java.installations.auto-detect=true
   org.gradle.java.installations.auto-download=false
   ```
3. **SDK** = `F:\Android\Sdk`（在 `android/local.properties` 写入 `sdk.dir=F\\:\\Android\\Sdk`）

### 命令行构建

```bash
cd ShenlunApp_V3_AndroidStudio
npm install  # 仅当 node_modules 缺失
cd android
./gradlew.bat assembleDebug
```

APK 输出：`android/app/build/outputs/apk/debug/app-debug.apk`

### 安装到设备

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

## 字体说明

工程自带 SourceHanSerifCN 4 字重 OTF 文件，路径：

```
android/app/src/main/assets/fonts/
  SourceHanSerifCN-Regular.otf
  SourceHanSerifCN-Medium.otf
  SourceHanSerifCN-Bold.otf
  SourceHanSerifCN-Heavy.otf
```

**关键**：字体引用名（`tokens.ts`）必须与 OTF 内部 PostScript name 一致，即 `SourceHanSerifCN-*`（不是 SC）。

## V3 启动入口链

```
index.js → src/App.tsx → MainTabs(activeKey='home') → HomeScreen
```

根 `App.tsx` 已转发到 `src/App.tsx`，避免加载 React Native 默认模板。

## 构建产物清理

旧 V1/V2 bundle 残留会导致新 bundle 被覆盖。如遇到首页显示异常：

```bash
rm -f ShenlunApp_V3_AndroidStudio/android/app/src/main/assets/index.android.bundle
```

## License

MIT