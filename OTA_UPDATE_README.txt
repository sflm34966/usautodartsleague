US AutoDarts League OTA Updates - Runtime 0.7.25

What this does
- The v0.7.25 APK contains expo-updates and points to the league's own API server.
- The APK automatically checks shortly after opening.
- Settings > Updates also provides a manual Check for Update button.
- A downloaded automatic update reloads the app and applies itself.

Use OTA only for compatible small changes
- App.tsx JavaScript/TypeScript logic
- screen layouts/styles
- wording/text
- API request/response handling
- fixes like the false "aborted" password message

A NEW APK is still required for
- adding/removing native Expo or React Native libraries
- Expo SDK / React Native upgrades
- Android manifest/permissions/native code changes
- changing app.json native configuration
- changing runtimeVersion

How to publish a compatible small fix
1. Keep expo.runtimeVersion at 0.7.25.
2. Make the compatible code changes.
3. Start the Windows USADL Server Manager on the same PC.
4. Run PUBLISH_OTA_UPDATE_WINDOWS.bat.
5. The script exports the bundle and places it in the server's AppUpdates folder.
6. Players receive it automatically on launch or can use Settings > Updates.

Do not publish an OTA update that expects native code not present in the v0.7.25 APK.
