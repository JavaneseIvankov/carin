# Minimal Template

This is a [React Native](https://reactnative.dev/) project built with [Expo](https://expo.dev/) and [React Native Reusables](https://reactnativereusables.com).

It was initialized using the following command, then the `Minimal (Nativewind)` template was selected when prompted:

```bash
npx @react-native-reusables/cli@latest init
```

## Getting Started

To run the development server:

```bash
    npm run dev
    # or
    yarn dev
    # or
    pnpm dev
    # or
    bun dev
```

This will start the Expo Dev Server. Open the app in:

- **iOS**: press `i` to launch in the iOS simulator _(Mac only)_
- **Android**: press `a` to launch in the Android emulator
- **Web**: press `w` to run in a browser

You can also scan the QR code using the [Expo Go](https://expo.dev/go) app on your device. This project fully supports running in Expo Go for quick testing on physical devices.

## Adding components

You can add more reusable components using the CLI:

```bash
npx react-native-reusables/cli@latest add [...components]
```

> e.g. `npx react-native-reusables/cli@latest add input textarea`

If you don't specify any component names, you'll be prompted to select which components to add interactively. Use the `--all` flag to install all available components at once.

## Project Features

- ⚛️ Built with [Expo Router](https://expo.dev/router)
- 🎨 Styled with [Tailwind CSS](https://tailwindcss.com/) via [Nativewind](https://www.nativewind.dev/)
- 📦 UI powered by [React Native Reusables](https://github.com/founded-labs/react-native-reusables)
- 🚀 New Architecture enabled
- 🔥 Edge to Edge enabled
- 📱 Runs on iOS, Android, and Web

## Learn More

To dive deeper into the technologies used:

- [React Native Docs](https://reactnative.dev/docs/getting-started)
- [Expo Docs](https://docs.expo.dev/)
- [Nativewind Docs](https://www.nativewind.dev/)
- [React Native Reusables](https://reactnativereusables.com)

## Deploy with EAS

The easiest way to deploy your app is with [Expo Application Services (EAS)](https://expo.dev/eas).

- [EAS Build](https://docs.expo.dev/build/introduction/)
- [EAS Updates](https://docs.expo.dev/eas-update/introduction/)
- [EAS Submit](https://docs.expo.dev/submit/introduction/)

---

If you enjoy using React Native Reusables, please consider giving it a ⭐ on [GitHub](https://github.com/founded-labs/react-native-reusables). Your support means a lot!

## Carin mobile shell and data client

Copy `.env.example` to `.env.local` and set `EXPO_PUBLIC_API_URL` to the Carin API URL reachable from the target device. `EXPO_PUBLIC_ENV` names the cache namespace (`development`, `staging`, or `production`). Only the public API URL belongs in Expo variables; credentials remain with the auth client added in C11. Email verification and resend callbacks require a publicly reachable HTTPS API URL; use a development HTTPS tunnel for those flows. The resend action reports a configuration error and does not start its cooldown when the API URL is HTTP.

In `development`, a loopback API URL (`localhost`, `127.0.0.1`, or `::1`) uses the Expo machine's host on native devices and the browser's host on web, preserving the API port and path. Explicit API hosts and staging/production URLs remain as configured. The API must listen on the reachable network interface; for web on a phone, add the exact web origin to `AUTH_TRUSTED_ORIGINS`. Both registration consent checkboxes remain visible while documents load, but acceptance and registration stay disabled until the current documents are available.

The root `AppDataProvider` exposes `setSessionUser(userId)` and `clearSession()` through `useAppData()`. C11 should call these after the server verifies a session, on logout, and when a 401 invalidates the session. Until C11 wires auth, resource queries remain disabled because no user scope exists. Feature screens can use `useAppRead`, `useAppWrite`, and `createDraftStore`; all resource data keys include environment and user ID. Writes require server acknowledgement and cannot queue offline.

The four tab screens and two food action destinations are shell placeholders. Their feature owners replace the body of those routes.
