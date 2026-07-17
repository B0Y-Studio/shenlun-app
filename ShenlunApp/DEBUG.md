# 申论积累 - Android Studio 调试指南

## ⚡ 最常见的 5 个坑（按出现概率）

### 坑 1：Metro bundler 没启动 → 手机打开白屏
**症状**：App 打开后白屏，或 "Unable to load script"
**解决**：Android Studio 调试时**必须**先单独开一个终端：
```bash
cd C:\Users\hecto\ZCodeProject\ShenlunApp
npm start
```
等 Metro 显示 "Welcome to Metro!" 再回到 Android Studio Run。

### 坑 2：Android Studio 用错 JDK
**症状**：Gradle sync 报错 "Could not find tools.jar" 或 Java 版本不对
**解决**：
- File → Project Structure → SDK Location → Gradle JDK
- 选 **JDK 17**（`C:\Users\hecto\jdk17\jdk-17.0.19+10`）或 **JBR 21**（`E:\softwares\jbr`）

### 坑 3：Gradle 找不到 Android SDK
**症状**：`SDK location not found`
**解决**：已配置 `android/local.properties` 的 `sdk.dir=F:\\Android\\Sdk`。如果 Android Studio 还报错：
- File → Settings → Languages & Frameworks → Android SDK
- 设置 SDK 路径为 `F:\Android\Sdk`

### 坑 4：端口 8081 被占用
**症状**：Metro 启动报 `EADDRINUSE`
**解决**：
```bash
netstat -ano | findstr :8081
# 找到占用进程 PID，kill
taskkill /F /PID <pid>
```

### 坑 5：手机没开启 USB 调试
**症状**：Run 后下拉设备列表是空的
**解决**：
- 手机 → 设置 → 关于手机 → 连点 7 下"版本号"激活开发者模式
- 设置 → 开发者选项 → 打开"USB 调试"
- 用 USB 数据线连接电脑（不要用纯充电线）
- 手机弹出"允许 USB 调试"对话框 → 勾选"始终允许" → 确定

---

## 🚀 完整调试流程（按顺序）

### 第 1 步：首次打开项目
1. Android Studio → File → Open → 选择 `C:\Users\hecto\ZCodeProject\ShenlunApp\` 文件夹
2. **不要选 `android/` 子目录！** 选根目录 `ShenlunApp/`
3. 等待 Gradle 同步完成（第一次 5-15 分钟）

### 第 2 步：确认 Metro bundler 没在跑
```bash
# 检查 8081 端口
netstat -ano | findstr :8081
```

### 第 3 步：启动 Metro（关键）
打开一个**新的** PowerShell 或终端窗口：
```bash
cd C:\Users\hecto\ZCodeProject\ShenlunApp
npm start
```
**这个终端保持打开**，不要关。等看到：
```
Welcome to Metro!
Fast - Scalable - Integrated
```
就可以了。

### 第 4 步：Android Studio 启动 App
- 顶部工具栏确认设备已选（如 "Pixel 5" 或你的真机名字）
- 点击 ▶ Run 按钮（或 Shift+F10）
- 等待 Gradle build + 安装到设备

### 第 5 步：手机上的反应
- 第一次启动会下载 JS bundle（10-30 秒）
- 看到"申论积累"印章 Logo → 1.5 秒后跳转首页
- 首页拉取 3 篇时评（需要联网）

---

## 🔍 调试技巧

### 在 Logcat 看日志
Android Studio 底部 → Logcat → 过滤器：
- Package Name: `com.shenlunapp`
- 或搜索 `ReactNativeJS`

### 重新加载 JS
不重新 build 也能刷新 JS：
- App 内 → 摇一摇手机 → "Reload"
- 或 Cmd+M (Android) → Reload

### 修改 JS 后自动重载
Metro 默认开了 Fast Refresh。改 JS 保存后 App 自动 reload。

### 调试 native code
如需调试 Kotlin/Java：
- 在 `MainActivity.kt` 行号处点左边设断点
- Run → Debug 'app'（绿色虫子按钮）

---

## ⚠️ 当前已知状态

| 项目 | 状态 |
|---|---|
| 项目结构 | ✅ 完整 |
| node_modules | ✅ 已装 |
| 字体（思源宋体）| ✅ 已下载到 assets/fonts |
| local.properties | ✅ 已创建 |
| AndroidManifest cleartext | ✅ 已加 |
| App 名（申论积累）| ✅ 已改 |
| MMKV | ✅ 降级为 v2.12.2 + 懒加载 |
| Java 17 | ✅ 路径 C:\Users\hecto\jdk17\ |
| Android SDK | ✅ F:\Android\Sdk |

---

## 🆘 仍报错？告诉我具体信息

请贴出：
1. **Android Studio Event Log 窗口**（右下角黄色感叹号点击查看）的报错
2. **Logcat 中红色错误**（过滤器 ReactNativeJS）
3. **手机上看到的现象**（白屏 / 红屏 / 闪退 / 卡在启动）

我看到具体信息就能精准修复。