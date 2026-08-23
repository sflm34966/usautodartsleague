US AutoDarts League v0.7.16 - Codemagic Debug APK Build

This package is configured for a simple Codemagic DEBUG APK build.
No Android keystore or Expo/EAS signing credentials are required.

Use this workflow when you uninstall the previous APK before installing each new build.

Codemagic setup:
1. Put the CONTENTS of this project folder in the root of your GitHub repository.
2. In Codemagic, connect that repository.
3. Project path: .
4. Project type: React Native (manual is fine).
5. Codemagic will read codemagic.yaml from the repository root.
6. Start the workflow named "US AutoDarts League Android APK".
7. When finished, download the APK from Artifacts.

Build output:
android/app/build/outputs/apk/debug/app-debug.apk

Important:
- Uninstall the previously installed US AutoDarts League app before installing this APK if it was signed with a different key.
- App data stored only on the phone will be removed by uninstalling. Server-side league data is unaffected.
