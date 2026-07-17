# V3 Android Studio 工程

## 1. 打开方式

Android Studio -> Open -> 选择此目录中的 android 文件夹：

```text
ShenlunApp_V3_AndroidStudio/android
```

不要选外层根目录。

## 2. 安装依赖

在工程根目录执行：

```powershell
cd C:\Users\hecto\ZCodeProject\ShenlunApp_V3_AndroidStudio
npm install
```

确认这个文件存在：

```text
node_modules\@react-native-community\cli-platform-android\native_modules.gradle
```

## 3. Gradle JDK

设置 Gradle JDK 为：

```text
C:\Users\hecto\jdk17\jdk-17.0.19+10
```

在 `android/gradle.properties` 加上：

```properties
org.gradle.java.installations.auto-detect=true
org.gradle.java.installations.auto-download=false
```

## 4. V3 入口

```text
index.js → src/App.tsx → HomeScreen.tsx → 5 个卡片 + 底部 5 Tab
```

打开后应该看到：

- 顶部：申论 + 红色日期印章
- 锦言卡（左侧大字+右侧红字"换一句"）
- 昨日总结（3 列虚线分隔）
- 今日待做（右上角虚线圆 + 黄铜斜纹进度段）
- 5 行主菜单（壹/贰/叁/肆/伍）
- 底部 5 个 Tab（积累/素材/题目/分析/设置）
