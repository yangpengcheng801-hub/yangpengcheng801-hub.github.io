# 打 APK 前在 PowerShell 中执行: . .\scripts\cap-android-env.ps1
# 使用 Android Studio 自带的 JDK（避免系统 Java 8）

$candidates = @(
  'D:\APP\anzuo\jbr',
  "$env:ProgramFiles\Android\Android Studio\jbr",
  "$env:LOCALAPPDATA\Programs\Android\Android Studio\jbr"
)

foreach ($jbr in $candidates) {
  if (Test-Path "$jbr\bin\java.exe") {
    $env:JAVA_HOME = $jbr
    $env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
    $env:Path = "$jbr\bin;$env:ANDROID_HOME\platform-tools;$env:Path"
    Write-Host "JAVA_HOME=$env:JAVA_HOME"
    Write-Host "ANDROID_HOME=$env:ANDROID_HOME"
    return
  }
}

Write-Warning '未找到 Android Studio 的 JBR，请在本机安装 Android Studio 或修改 scripts/cap-android-env.ps1'
