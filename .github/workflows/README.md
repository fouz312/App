# BrowOS 1.6
Created by Fouz_312 using Claude (Sonnet 5.5 High). Inspired by the BrowOS project by Allysun.
A desktop-style environment inside an Android app. It does not replace Android.

New in 1.7: the update zip no longer freezes on the loading screen (new startup loader, tested in a real Chromium browser). BrowGames now has Chess, Island Drop, Strike Force, Turbo Drive, Pitch Pro, and your three games (Cube Surge, Voxel3D, Terrabyte) embedded unchanged. The older mini-games were removed. index.html is now a small startup page and the app itself is www/app.html. This version needs ONE new APK (the startup loader is inside the APK); after that, zip updates work again.
New in 1.6: BrowGames, a hidden games app with 25 original games (shooters, runners, adventures, sports, racing, real chess and checkers, classic puzzles). It is hidden until you type its secret command in Terminal. The games are original and only inspired by popular game styles; they are not copies and are not affiliated with any game company.
Update the app itself without a new APK: Settings > App update > Choose zip (pick this zip, do not extract it).
Folders: www (the app), icons, android-patch (Java files and NATIVE_VERSION), package.json, capacitor.config.json, debug.keystore, .github/workflows/build-apk.yml.
