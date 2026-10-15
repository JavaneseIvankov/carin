---
name: agent-device-live-testing
description: Use when live-testing Carin on a connected phone or simulator with agent-device, including device discovery, Expo or Metro startup, UI interaction, and device-session recovery.
---

# Agent Device Live Testing

Use `agent-device` for Carin's real-device and simulator UI checks. Device discovery proves the device is visible to automation; it does not prove the app, Metro, or Carin API is reachable.

## Set up this workspace

In this managed workspace, the default `~/.agent-device` is read-only and the restricted shell cannot bind the local daemon to `127.0.0.1`. Keep the daemon state in a writable temporary directory and run each `agent-device` command through an execution context that permits its local loopback daemon. Use the same state directory and execution context for the entire session:

```sh
AGENT_DEVICE_STATE_DIR=/tmp/carin-agent-device-state agent-device <command>
```

For Codex shell commands here, this requires the approved elevated execution mode for the local daemon. Do not alternate between restricted and elevated calls or between state directories; that can leave the daemon unreachable. `AGENT_DEVICE_STATE_DIR` is the supported state override. Do not redirect `HOME` or delete daemon lock files by hand.

If startup fails, retry once with `--debug` in the same execution context and state directory (for example, `AGENT_DEVICE_STATE_DIR=/tmp/carin-agent-device-state agent-device devices --platform android --debug`). Record the diagnostic ID and log path. Use `agent-device daemon stop --state-dir /tmp/carin-agent-device-state` only to stop that daemon; do not hunt or kill unrelated Node processes.

## Start a device session

- If the app/package is known, start with `agent-device open <app-id> --platform android --foreground`. It returns the initial screen and refs; do not probe first with `devices`, `apps`, `snapshot`, or screenshots.
- If the app ID is unknown or the user asks only to check device connectivity, run `agent-device devices --platform android`. Use `agent-device apps --platform android` to discover installed app IDs, then open the exact discovered ID. Never guess a package ID.
- On a physical Android phone, use the printed device serial with `--serial` if more than one device is present. A booted device listing confirms automation connectivity only.
- Run `agent-device doctor --platform android` only for requested setup diagnostics or when a device, app, or dev-server command fails; it is not routine QA setup.

## Expo and Metro

Run the app's documented dev command from `carin-app/` (`pnpm run dev`, which runs `expo start -c`) and use the host/URL Expo prints. A physical phone needs a host address it can reach over the network; do not give it the computer's `127.0.0.1`. Pass the correct host and port to `open` when starting a native app session, or open the discovered Expo Go app with the printed Expo URL. Do not invent URLs.

Before stopping Metro, identify the process and port owner. Stop only the dev server started for this task (Ctrl+C in its terminal, or its verified PID); never use broad `pkill node`. For JS-only changes in a session already bound to the correct server, use `agent-device metro reload`.

## Interact and finish

Use `snapshot -i` for current interactive refs, then act serially with `press`/`fill`/`scroll --settle`. Trust the settled diff when it shows the next state; use `wait` for delayed results. Verify the requested screen or result is visible before reporting success. Close the session with `agent-device close` when testing is done.

Keep complete `agent-device` command lines and output when diagnosing issues; do not pipe its commands through `grep`, `jq`, or other filters because output includes refs, hints, and recovery details.
