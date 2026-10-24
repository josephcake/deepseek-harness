// @vitest-environment jsdom
/** Dictation trigger preferences and composer routing survive reloads and Session changes. */
import { afterEach, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { createVoiceActivationStore, VoiceActivationRouter, type VoiceActuator } from '../src/client/activation.ts'

afterEach(() => { localStorage.clear() })

it.each([
  ['{"mode":"hold"}', 'hold'],
  ['{"mode":"toggle"}', 'toggle'],
  ['{"mode":"always"}', 'toggle'],
  ['not json', 'toggle'],
  ['null', 'toggle'],
  ['"hold"', 'toggle'],
  ['{}', 'toggle'],
])('restores %s as the %s trigger mode', (raw, mode) => {
  localStorage.setItem('dsh.voice-input.activation', raw)
  expect(createVoiceActivationStore().getSnapshot().mode).toBe(mode)
})

function actuator(sessionId: SessionId): VoiceActuator {
  return { sessionId, canStart: () => true, isActive: () => false, start: vi.fn(), stop: vi.fn() }
}

it('prefers the main Session composer, falls back to the newest mount, and keeps replacements independent', () => {
  const router = new VoiceActivationRouter()
  const first = actuator('one' as SessionId), second = actuator('two' as SessionId)
  const disposeFirst = router.register(first)
  expect(router.resolve('one' as SessionId)).toBe(first)
  expect(router.resolve('other' as SessionId)).toBe(first)
  expect(router.resolve(undefined)).toBe(first)
  const disposeSecond = router.register(second)
  expect(router.resolve('one' as SessionId)).toBe(first)
  expect(router.resolve('two' as SessionId)).toBe(second)
  expect(router.resolve(undefined)).toBe(second)
  const replacement = actuator('one' as SessionId)
  const disposeReplacement = router.register(replacement)
  disposeFirst()
  expect(router.resolve('one' as SessionId)).toBe(replacement)
  disposeReplacement()
  disposeSecond()
  expect(router.resolve('one' as SessionId)).toBeUndefined()
})
