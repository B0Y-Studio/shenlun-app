# Launching BLIND삼국 with the Debugging Port

The trainer talks to the game's renderer via Chrome DevTools Protocol on
`127.0.0.1:9222`. For Chromium-based Electron apps, you opt in by adding the
launch flag `--remote-debugging-port=9222`.

## Steam launch options (recommended)

1. Right-click **BLIND삼국** in your Steam library.
2. Choose **Properties…**.
3. In the **Launch Options** box, paste:

       --remote-debugging-port=9222

4. Confirm. From now on, every Steam launch will expose the CDP endpoint.

## Verifying

After starting the game:

    curl http://127.0.0.1:9222/json/version

Expected: a JSON payload showing the Chromium version. If `Connection refused`,
double-check the launch options string and that Steam actually used them
(check the **General → Launch Options** field is not empty).

## Security

`--remote-debugging-port=9222` exposes full V8 control to anyone on the
loopback interface. **Never** add `--remote-allow-origins=*` or run it on a
network port. Treat the loopback as trusted-local only.
