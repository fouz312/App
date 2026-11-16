# Testing report v1.6 (honest)
Verified here:
- All 22 JavaScript files pass a syntax check.
- Chess rules match the standard reference node counts on 4 test positions (start, castling/en passant/promotion, pins, promotions and checks), checkmate and stalemate are detected, and the computer finds a mate in one.
- Checkers: opening moves, forced captures, double jumps, crowning, kings.
- Every action game ran 1,000 frames with simulated input and stopped cleanly; tic-tac-toe (the computer never loses), minesweeper, checkers, chess and the party game ran through their click logic. This found and fixed a crash in checkers.
- No trademarked game names appear in game titles or descriptions.
- The secret command exists and is not listed by help; the games app stays hidden until it is typed.
- The zip updater was run against the real release zip.
NOT verified: how the games look and feel on a phone (sizes, touch controls, speed), game balance, the real Android build, the Java on a phone, the update-by-zip page replacement on a real WebView, everything listed in earlier reports as not verified.


## v1.7 testing (what was really checked)
Run in a real headless Chromium (Playwright), serving the www folder over http:
- App boots through the new startup loader with no console errors.
- Update zip: a real deflate zip built from the project was installed with the real installer; the app restarted into the updated version, the start flag cleared, and it stayed running past the 12 second safety timer (no stuck loading screen).
- A deliberately broken update (throws on start) was removed by the safety timer after 12 seconds and the built-in version came back. A wrong zip was refused with a clear message.
- Screenshots taken of the hub, Island Drop, Strike Force, Turbo Drive (garage and driving), Pitch Pro and Terrabyte; two bugs found by looking (nitro speed above its limit, thin lines across the road) and fixed.
Headless logic tests (node): chess move counts match the reference numbers; Island Drop, Strike Force, Turbo Drive and Pitch Pro each ran full games with simulated input without errors and finished; football produced goals; the three uploaded games are embedded byte-for-byte identical to the uploaded files.
NOT verified: touch feel and speed on your tablet; Voxel3D and Cube Surge running (they need internet for Three.js and fonts, which the test machine did not have); sound; balance and difficulty of the new games; the Android build itself.
