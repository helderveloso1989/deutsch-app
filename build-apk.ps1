# Recompila o APK depois de alterares os ficheiros em www/
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
Set-Location $PSScriptRoot
npx cap sync android
Set-Location android
.\gradlew.bat assembleDebug
Copy-Item app\build\outputs\apk\debug\app-debug.apk ..\DeutschLernen.apk -Force
Write-Host "APK pronto: $PSScriptRoot\DeutschLernen.apk"
