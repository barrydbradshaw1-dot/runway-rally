# Runway Rally for iPhone and Android

These are the store apps for Runway Rally, built with [Capacitor](https://capacitorjs.com). Capacitor makes one iPhone project and one Android project from the same student game in `../web`, so there is one game to keep up, and the game files ship inside the app instead of loading a website (Apple and Google both reject apps that only show a website).

The app is the student game only. The teacher console and the family progress page stay on the website.

## What the app adds over the website

- The game opens from inside the app, so it starts quickly on slow school Wi-Fi.
- The sign-in is also kept in the phone's app storage, so it survives when the phone clears web data.
- "Family progress link" opens the phone's share sheet.
- "Delete my data" under **For grown-ups** deletes the student's own data (Apple requires this; it is on the website too).
- "Privacy policy" link under **For grown-ups** when you set `RR_PRIVACY_URL`.
- A clear "check your internet" message when the server can't be reached.

## Before you build

1. **Deploy the server first.** The apps need this branch's server changes: the API answers the app origins (`APP_ORIGINS`, default `capacitor://localhost,https://localhost`) and has `DELETE /api/me`. Without them every request from the app fails.
2. **Publish the privacy policy** at a public https address (both stores ask for one, and Google wants it reachable in the app).
3. Install Node 20 or newer, then in this folder run `npm install`.

## Android (any computer)

Needs [Android Studio](https://developer.android.com/studio) (it brings the Android SDK and Java).

```
RR_API_BASE=https://YOUR-DOMAIN RR_PRIVACY_URL=https://YOUR-DOMAIN/privacy npm run android
```

That copies the game into the app and opens Android Studio. Press Run to try it on a phone or emulator. For the store: **Build > Generate Signed App Bundle**, create an upload key, and keep the key file and its password somewhere safe (if you lose it you need Google support to reset it). Play App Signing is on by default for new apps.

The project targets Android 16 (API 36), which Google Play requires for new apps from August 31, 2026.

## iPhone (needs a Mac)

Needs a Mac with Xcode (the version App Store Connect currently requires).

```
RR_API_BASE=https://YOUR-DOMAIN RR_PRIVACY_URL=https://YOUR-DOMAIN/privacy npm run ios
```

That opens Xcode. Under **Signing & Capabilities** pick your Apple Developer team, run it on a phone, then **Product > Archive > Distribute App** to send it to App Store Connect and TestFlight.

## Changing things

- After changing anything in `../web`, run `npm run sync` (with the same `RR_API_BASE`) so both apps get the new files.
- App icon and splash come from `../web/icons/icon.svg`: `npm run icons` remakes them.
- The app ID is `com.nexusdataengineering.runwayrally`. It can't change once the app is in a store, so change it in `capacitor.config.json`, `android/app/build.gradle` and the Xcode project first if you want another.
- Version numbers: `versionCode`/`versionName` in `android/app/build.gradle`, and Version/Build in Xcode. Raise them for every store upload.
- `npm test` checks the build script.

## Store accounts and costs

| | Cost | Notes |
|---|---|---|
| Apple Developer Program | $99 a year | As an individual no D-U-N-S number is needed. As a company (Nexus Data Engineering) you need a free D-U-N-S number, which can take up to 5 business days. |
| Google Play Console | $25 once | A new **personal** account must run a closed test with at least 12 testers, opted in for 14 days in a row, before it can publish. |
| D-U-N-S number | free | Only for an organization account. |

## Filling in the store forms

**Apple, App Store Connect**
- Category: Education. Don't choose the Kids Category: it is for ages 11 and under, and it doesn't allow links out of the app (the family share link and privacy link) without a parental gate.
- App Privacy: no tracking. Data collected, linked to the student, used only for app functionality: **Gameplay content** (answers, progress, designs) and **Other user content** (the nickname). Apple wants even app-functionality data declared. `ios/App/App/PrivacyInfo.xcprivacy` says the same.
- App Review notes: make a class in the teacher console called "App Review" and give its class code and a nickname to use. Keep the server running during review (guideline 2.1).
- Export compliance: the app only uses standard HTTPS, so it is set as exempt (`ITSAppUsesNonExemptEncryption` = NO).

**Google, Play Console**
- Target audience: if you pick any age under 13 (6th graders are 11 and 12), the Families policy applies. The app meets it as built: no ads, no analytics, no device identifiers sent.
- Data safety: collects App activity (in-app actions and answers) and a nickname (no real names, emails or ages); encrypted in transit; people can ask for deletion (in the app, and teachers can delete).
- Privacy policy: the same address as `RR_PRIVACY_URL`.
- Optional: apply for **Teacher Approved** once listed.

## Things that could get it rejected

1. **Apple 4.2, "repackaged website".** The game ships inside the app and uses the phone's share sheet and storage, which is the usual answer, but Apple can still say it needs more. If that happens, reply in App Review explaining the offline-ready game files and the share and saved sign-in features, or add more phone features (for example haptics on right answers).
2. **Server not reachable or no demo class (Apple 2.1).** Review fails if the reviewer can't join a class.
3. **Account deletion (Apple 5.1.1(v)).** Covered by "Delete my data", which must stay easy to find.
4. **Privacy policy missing in the app or the listing** (Apple 5.1.4, Google Families). Set `RR_PRIVACY_URL`.
5. **Google 14-day closed test** for a new personal account. Plan two weeks and 12 testers before the public release.
