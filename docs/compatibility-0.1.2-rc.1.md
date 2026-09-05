# DSH 0.1.2-rc.1 compatibility

Verified on Windows with DSH `0.1.2-rc.1` on 2026-09-05.

## Verified

- The package installed and its Host projection and Client bundle activated in real DSH Web Profiles.
- Existing local session history and its Token projections remained readable after the DSH upgrade.
- The real `127.0.0.1:3080` profile displayed both Token-rate indicators and the Token usage page.
- The separate `127.0.0.1:3081` QA Profile loaded the upgraded plugin inventory, settings contribution, and usage statistics.
- The Client uses the DSH 0.1.2 Session Controller, Client Store, Connection, and UI Renderer packages. The removed `dsh-client-runtime` package is absent.
- Host and Client type checks, the 136-test suite, deterministic repeated builds, and package-content checks ran against the DSH `0.1.2-rc.1` source contract.

## Preserved behavior

- The header and sidebar rates measure only Provider-confirmed output Token increments recorded by DSH projections.
- The displayed rate covers at most the latest 10 seconds and refreshes every 5 seconds. Missing projections, counter regression, source changes, and suspended timers start a fresh baseline.
- A displayed `0 tok/s` is a valid loaded state. It does not prove that a new non-zero Provider response was recorded.
- Historical, blank, or pre-plugin Session rows without a Token projection contribute zero and do not keep the global indicator in a permanent sampling state. If a counter later appears, that Session starts from a fresh baseline.
- After this fix was rebuilt, the real profile's global indicator left its permanent sampling state and displayed the valid ready value `0 tok/s` across the existing 447-session history.
- Existing global and exact provider/model budget meanings, local trajectory-report history, and aggregate export fields remain unchanged.
- The cross-platform CSS module namespace and normalized source-map line endings introduced in `0.3.1` remain enforced by tests and deterministic builds.

## Compatibility boundary

`compatible` means the plugin installs, activates, reads existing history, registers its projections and UI, and displays its statistics on DSH `0.1.2-rc.1`.

The first Provider attempt reached OAuth `403` after the upgraded HTTP stack stopped inheriting the previous proxy route. After the existing local proxy route was restored, the shared runtime completed a real root-plus-one-child request at 13:11 on 2026-09-05. It returned `ROOT_OK_0905` and `CHILD_OK_0905:42`; the session recorded two rounds, three steps, and a successful round with about 66K input Tokens and 152 output Tokens. This proves the shared DSH Provider and projection-producing request path. It does not yet prove that both transient UI indicators captured a non-zero rate inside their 10-second window; that screenshot/readback remains a separate final check after the global sampler fix is loaded.
