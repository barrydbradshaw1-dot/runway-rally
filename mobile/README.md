# Runway Rally mobile app (Android and iOS)

This wraps the same web client in `../web` with [Capacitor](https://capacitorjs.com). The game logic and grading stay on your server;
the app is the screens plus icons, a splash screen and camera permission for the optional selfie color match.

Verified here: the bundled app loads from the app's own origin, signs in, plays and grades against the server with no errors.
Not verified here: an actual Android or iOS build. This environment has no Android SDK or Xcode.

## One-time setup
Requires Node 20+.
```
cd mobile
npm install
```

## Build the web bundle for the app
Point it at your live HTTPS server:
```
set API_URL=https://nexusdataengineering.com        # PowerShell: $env:API_URL="https://nexusdataengineering.com"
npm run sync
```
Your server must allow the app's origins. The defaults already do (`capacitor://localhost`, `https://localhost`, `http://localhost`).
Override with `CORS_ORIGINS` in the server's `.env` if needed. The teacher console is never opened to the app.

## Android (works on Windows)
1. Install Android Studio.
2. `npm run android` opens the project. Press Run to try it on a phone or emulator.
3. Release: Build > Generate Signed Bundle (AAB). Keep the keystore file and passwords somewhere safe; losing them means you can never update the app.
4. Publish through Google Play Console (one-time $25 developer fee).

## iOS (needs a Mac)
1. Install Xcode and CocoaPods on a Mac, then `npm run ios`.
2. In Xcode set your Team, and bundle id `com.nexusdataengineering.runwayrally` (change it if you want a different id before first publishing).
3. Product > Archive, then upload to App Store Connect (Apple Developer Program, $99 a year).

## Changing the icon
Edit `../web/icons/icon.svg`, then `npm run assets` (regenerates every size), then `npm run sync`.

## Before you submit to a store
- The app collects student nicknames from children. Google Play (Families policy) and Apple (Kids Category) have extra rules: a public privacy policy URL
  (use `../docs/PRIVACY-POLICY.md` after lawyer review), no ads or third-party analytics, and a data-safety / privacy-label form that matches
  `../docs/DATA-PRIVACY-EXHIBIT.md`.
- Apple can reject apps that are only a website in a shell. This one has app-specific pieces (installed icon, bundled screens, camera access),
  but expect a question about it; reviewers want to see real functionality. Offering a demo class code in the review notes helps.
- Most schools will use the web version in Brightspace, and the app is for home use, so decide how a student joins from home (class code and nickname today).
