# Onboarding mascot assets and shared header pattern

Task / scope: Reuse the profile's food/health/journal pattern on suitable headers and give each onboarding slide its own contextual mascot pose.

Changes and affected files: The pattern moved from `components/profile/profile-header-pattern.tsx` to `components/app/header-pattern.tsx` and is reused by Dashboard, History, Examinations, Profile and the onboarding illustration panel. Header overflow clips decorative icons to rounded boundaries. The pattern remains low contrast, ignores touches and is hidden from assistive technology.

The carousel uses `assets/images/carin-mascot.png` for the welcoming wave, `assets/images/carin-mascot-camera.png` for photographing food, and `assets/images/carin-mascot-doctor.png` for the doctor/health-record pose. The first title is now “Hai, selamat datang di Carin!”. Each slide has its own accessible illustration description. The health profile remains optional; existing consent, nutrition and navigation behavior is unchanged.

## Asset provenance and prompts

Mode: built-in `image_gen` tool, identity-preserving edits with actual transparent backgrounds. Reference/edit target: `assets/images/carin-mascot.png`. The original waving illustration is reused unchanged. New PNGs are copied into the app asset directory; no runtime image generation or image-service dependency is introduced.

Shared prompt prefix (used verbatim for both generated assets):

> Use case: identity-preserve. Reference/edit target: the attached existing Carin mascot. Preserve the exact character identity: round olive-green sprout creature, single large leaf on its head, cream belly and tiny cream feet, large glossy dark-brown eyes with amber highlights, peach cheeks, soft textured painterly 3D children's illustration. Full body centered, same proportions and face, clean crisp silhouette, square composition with 10% transparent margin. Output a standalone transparent PNG app onboarding illustration. No words, letters, logos, watermark, background panel or scenery.

Camera suffix:

> Change its pose so it is happily taking a photograph of a small plate of food with a smartphone held in both hands. Phone angled down toward the small plate of rice and vegetables placed beside its feet. Face and head leaf clearly visible, camera action easy to read at small size. Keep the same character and original illustration style. Actual transparent background.

Doctor suffix:

> Change its pose so it is a friendly doctor helper wearing a small ivory doctor's coat and a simple stethoscope around its neck, holding a small health-record clipboard in one hand and a pencil in the other. Friendly smile, not diagnosing or examining a patient. Head leaf clearly visible above the coat. Keep the exact same face, olive-green color and original illustration style. Clipboard has only simple abstract lines, no readable text. Actual transparent background.

## Handoff

Verification (from `carin-app/`): Prettier on changed TS/TSX sources, `tsc --noEmit`, `eslint . --max-warnings 0`, and `vitest run` passed (56 files, 405 tests). `git diff --check` passed. Native bundle/asset verification is recorded after the asset generation step.

Unverified work / blockers: Physical iPhone appearance, dark theme and enlarged text require device review. No backend or API changes are part of this task.

Next step: Reload Expo Go; inspect header patterns and advance/back through all three onboarding poses.

Worktree state: Uncommitted on `feat/ios-ui-improvements`. Preserve the existing unrelated local change in `infra/.env.example`; do not commit secrets.

Final asset verification: Both generated PNGs are 1254 × 1254 RGBA with alpha ranging from 0 to 255 (actual transparency). The active Metro iOS bundle returned HTTP 200 and includes both camera and doctor asset references. Both outputs were visually inspected against the original mascot. Final generated files are `assets/images/carin-mascot-camera.png` and `assets/images/carin-mascot-doctor.png`; the original waving asset remains unchanged.

## Onboarding slide transitions

Task / scope: Make onboarding slide changes smoother.

Changes: `components/onboarding/welcome-carousel.tsx` animates the illustration and copy together with a 220 ms directional fade/slide when Lanjut or Kembali changes the slide. Forward and backward navigation use opposite directions. Native Reanimated transitions respect the system Reduce Motion setting. Footer controls remain stationary, and navigation/skip behavior is unchanged. There is no looping or automatic mascot movement.

Verification (from `carin-app/`): Prettier, `tsc --noEmit`, ESLint on the changed component, and `vitest run lib/onboarding/welcome-slides.unit.test.ts` passed (3 tests). Physical iPhone animation smoothness and Reduce Motion still need device review.

Worktree state: Animation change is uncommitted; preserve unrelated infra env changes.

## Preload and preserve mascot layers

Task / scope: Avoid mascot-image blinking during onboarding slide changes.

Changes: All three native image layers mount together when onboarding opens, starting asset loading/decoding before navigation. The layers stay mounted across slide changes and crossfade over 220 ms using Reanimated with system Reduce Motion support. Android's default image fade is disabled. Only the active image is exposed to accessibility. Lanjut waits for the next image's onLoad event, with retry and skip available on asset failure. The illustration panel remains stable while the text keeps its directional transition.

Verification (from `carin-app/`): Prettier, `tsc --noEmit`, ESLint on `components/onboarding/welcome-carousel.tsx`, and `vitest run lib/onboarding/welcome-slides.unit.test.ts` passed (3 navigation/copy tests). The Metro iOS bundle returned 200 and includes MascotLayer. `git diff --check` passed. These checks do not verify native decode timing or visual smoothness; cold-load, repeated forward/back, network failure/retry and Reduce Motion need iPhone review.

Worktree state: This change and the preceding slide-animation change are uncommitted; unrelated infra env settings remain preserved.
