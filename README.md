# Aether Survivor

A 3D action roguelite survivor game built with Vite, React and three.js (react-three-fiber).

## How to play
You are the village guard. Gear up in the peaceful village, then press **Defend the Village** to fight off waves of monsters.

| Action | Desktop | Touch |
|---|---|---|
| Move | WASD / arrow keys | left joystick |
| Basic attack | automatic at enemies in range (archer can shoot while moving; wizard/barbarian stand still) | automatic |
| Skills | **1 / 2 / 3** (hold to aim, release to cast) | skill buttons (drag to aim, tap to auto-cast) |
| Ultimate | **R** (needs full charge bar + finished cooldown) | ULT button |
| Class dash | **Space** | DASH button |
| Potions | **Z** (health) / **X** (mana) | HP / MP buttons |
| Interact / harvest (village) | **E** / **F** | buttons |
| Hero sheet / bag / pause | **C** / **I** / **Esc** | top-right buttons |

Waves end when every monster is dead (fast-clear bonus) or the timer runs out; pick a reward card after each wave. Shops close during a siege and reopen between waves.

## Run locally
```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build in dist/
```

## Get the Android APK
A GitHub Actions workflow builds a debug APK on every push.
1. GitHub repo -> **Actions** -> latest **Android APK** run (make sure Actions is enabled on the repo).
2. Scroll to **Artifacts**, download `aether-survivor-debug-apk` and unzip it.
3. Copy the `.apk` to your phone and install it (allow "Install unknown apps" for your file manager/browser).

Build locally (requires Android SDK + JDK 17): `npm run build:android && cd android && ./gradlew assembleDebug`.

## Install as a PWA
Open the deployed site in Chrome on Android -> menu -> **Add to Home screen**. It runs fullscreen in landscape and caches assets for offline play.

## Credits
- 3D models: [KayKit](https://kaylousberg.itch.io/) (CC0)
- Nature assets: [Kenney](https://kenney.nl/) (CC0)
