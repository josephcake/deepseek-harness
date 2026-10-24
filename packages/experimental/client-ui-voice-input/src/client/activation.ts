/** Browser-local dictation trigger mode and the composer actuators a shortcut can drive. */
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'

/** How the dictation shortcut starts and stops one recording. */
export type VoiceActivationMode = 'toggle' | 'hold'

/** Persisted trigger preference; key bindings stay in the shortcuts service. */
export interface VoiceActivationPreference {
  readonly mode: VoiceActivationMode
}

/**
 * Restore the trigger mode beside the microphone preference.
 * @returns validated store whose default keeps the shortcut press-to-toggle.
 */
export function createVoiceActivationStore(): SnapshotStore<VoiceActivationPreference> {
  const store = createSnapshotStore<VoiceActivationPreference>({ mode: 'toggle' }, { persist: { name: 'dsh.voice-input.activation' } })
  const saved: unknown = store.getSnapshot()
  if (!saved || typeof saved !== 'object' || !('mode' in saved) || (saved.mode !== 'toggle' && saved.mode !== 'hold')) {
    store.set({ mode: 'toggle' })
  }
  return store
}

/** One mounted composer that can start and end a recording for its Session. */
export interface VoiceActuator {
  readonly sessionId: SessionId
  /** Whether a fresh recording can start now. */
  canStart(): boolean
  /** Whether this composer owns a request, capture, or transcription. */
  isActive(): boolean
  start(): void
  /** Stop an active capture and transcribe it; a request released early stops once capture starts. */
  stop(): void
}

/**
 * Route the shortcut to the composer the user is looking at, falling back to the most recently mounted one.
 * Mounted composers own their draft and readiness, so the router never starts work on an unmounted Session.
 */
export class VoiceActivationRouter {
  private readonly actuators = new Map<SessionId, VoiceActuator>()

  /**
   * Contribute one mounted composer.
   * @param actuator - Session-scoped start and stop operations.
   * @returns disposer that leaves a later registration for the same Session intact.
   */
  register(actuator: VoiceActuator): () => void {
    this.actuators.set(actuator.sessionId, actuator)
    return () => { if (this.actuators.get(actuator.sessionId) === actuator) this.actuators.delete(actuator.sessionId) }
  }

  /**
   * Resolve the composer for a Session, or the most recent fallback while navigation has no main Session.
   * @param sessionId - Session retained by the main view, when known.
   * @returns the matching or fallback actuator.
   */
  resolve(sessionId: SessionId | undefined): VoiceActuator | undefined {
    const preferred = sessionId === undefined ? undefined : this.actuators.get(sessionId)
    return preferred ?? [...this.actuators.values()].at(-1)
  }
}
