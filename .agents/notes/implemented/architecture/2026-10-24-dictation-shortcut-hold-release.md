# Agent Note: Dictation shortcuts end on key release

Status: implemented

English | [中文](2026-10-24-dictation-shortcut-hold-release.zh.md)

## Problem

Voice input starts only from its microphone button. Users with the dictation bundle enabled cannot start or stop capture from the keyboard, and the shortcut service dispatched only key presses: a hold-to-talk command had no event that could end its capture. Adding a plugin-local key listener would bypass the command catalog, conflict checks, user bindings, and per-platform delivery.

## Decision

A handled `ShortcutResolution` may return `release()`. The registry records the resolved action with the physical key or chord that activated it and calls `release()` when the last of those keys goes up. Releasing a chord key that did not start the action removes only that key. Window focus loss and a hidden page release every held action. Disposing a command drops its pending activations without invoking `release()`; the owner's teardown settles its own action.

Windows and macOS Desktop forward the release of every press they intercepted as native input, using the same trusted preload channel and accepting it independently of the accepted configuration revision. Web reads the same fact from DOM key events, and Linux Desktop leaves its un-intercepted key releases to the DOM path.

The voice input plugin registers the editable `voice.dictate` command inside `ctx.effect()`. Command defaults are Command+Option+V and Ctrl+Alt+V for macOS and Windows on Desktop and Web; Linux profiles are unbound because the platform reservation rejects that combination. The resolver targets the composer of the Session retained by the main view, then the most recently mounted composer. Bundle details persist the client-local `Activation` preference: press-to-toggle sends one `run()`, while hold-to-talk returns `run()` and `release()`. A release that arrives while microphone permission is pending defers the stop until capture starts.

## Alternatives considered

**Listen for raw key events inside the voice plugin.** It would duplicate physical-key validation, conflict reporting, user overrides, and Desktop native delivery that the shortcut service already owns, and the binding would not appear in Keyboard shortcuts.

**Register a second command for release.** Commands resolve an action against a live target; a separate registration cannot share the target resolved by the press and would race with rebinding between press and release.

**Store the trigger mode in Host speech settings.** Activation describes browser input behavior, not recognition. A Host round trip would couple a local keyboard preference to the recognition profile and make unrelated sessions wait on settings writes.

## Consequences

The shortcut service now owns a lifecycle beyond a synchronous press, so adapters must deliver releases and command owners must keep `release()` idempotent. Desktop pays one extra IPC message per intercepted press. The Linux profiles gain no default binding; the command appears in Keyboard shortcuts and users assign a supported combination there. The mode preference follows the browser origin rather than the Harness profile, matching microphone selection.

Verification covers registry release for single keys, chords, repeats, disposal, focus loss, and page hiding; DOM and native adapters; Desktop interception forwarding; the registered command in both modes; actuator routing; deferred stop during permission; trigger-mode restoration; and the settings control.
