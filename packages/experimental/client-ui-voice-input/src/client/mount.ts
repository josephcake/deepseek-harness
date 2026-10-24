/** Source-safe lifecycle for the optional speech Remote and browser UI. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-experimental-api-speech-to-text/remote'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { VoiceInput, type VoiceInputInjected } from './VoiceInput.tsx'
import { Recording } from './audio.ts'
import { createMicrophoneDeviceStore } from './microphone-device.ts'
import { en, ja, es, fr, de, ru, pt, NS, zh } from './locales.ts'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type {} from '@deepseek-ai/dsh-client-shortcuts/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type { ShortcutCommandId } from '@deepseek-ai/dsh-client-shortcuts/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { observeReadiness } from './readiness.ts'
import { VoicePreparation } from './PreparationCard.tsx'
import { VoiceSetupPrompt } from './VoiceSetupPrompt.tsx'
import { createVoiceActivationStore, VoiceActivationRouter } from './activation.ts'

export const inject = ['remote', 'slots', 'locale', 'shortcuts', 'sessions']

function registerUi(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en, ja, es, fr, de, ru, pt }))
  const recordings = new Set<Recording>()
  const microphone = createMicrophoneDeviceStore()
  const activation = createVoiceActivationStore()
  const actuators = new VoiceActivationRouter()
  const readiness = observeReadiness(ctx)
  ctx.effect(() => readiness.dispose)
  ctx.effect(() => async () => { await Promise.all([...recordings].map(recording => recording.dispose())) })
  // The Plugins page provides its navigation only while the current Peer may use it.
  const pluginNavigation = createSnapshotStore(false)
  ctx.inject(['pluginNavigation'], (scope: Context) => {
    scope.effect(() => {
      pluginNavigation.set(true)
      return () => { pluginNavigation.set(false) }
    }, 'voice-input: plugin navigation presence')
  })
  const t = ctx.locale.bind(NS)
  const mainSessionId = (): SessionId | undefined => Object.values(ctx.sessions.list.getSnapshot().byId)
    .find(row => (row.retainedBy.mainView ?? 0) > 0)?.id
  ctx.effect(() => ctx.shortcuts.register({
    id: 'voice.dictate' as ShortcutCommandId,
    label: () => t('dictate'),
    aliases: ['voice input', 'dictation', 'microphone', 'speech to text'],
    defaults: {
      'desktop:macos': { code: 'KeyV', modifiers: ['primary', 'alt'] },
      'desktop:windows': { code: 'KeyV', modifiers: ['primary', 'alt'] },
      'web:macos': { code: 'KeyV', modifiers: ['primary', 'alt'] },
      'web:windows': { code: 'KeyV', modifiers: ['primary', 'alt'] },
    },
    regions: ['page', 'editable'],
    modals: [],
    resolve: () => {
      const actuator = actuators.resolve(mainSessionId())
      if (actuator === undefined) return { status: 'blocked', reason: t('shortcut.unavailable') }
      if (activation.getSnapshot().mode === 'hold') {
        if (!actuator.canStart()) return { status: 'blocked', reason: t('shortcut.busy') }
        return { status: 'handled', run: () => { actuator.start() }, release: () => { actuator.stop() } }
      }
      if (actuator.isActive()) return { status: 'handled', run: () => { actuator.stop() } }
      if (!actuator.canStart()) return { status: 'blocked', reason: t('shortcut.busy') }
      return { status: 'handled', run: () => { actuator.start() } }
    },
  }), 'voice-input: dictation shortcut')
  const actions: VoiceInputInjected = {
    openSettings: () => { ctx.get('pluginNavigation')?.openBundle('@deepseek-ai/dsh-experimental-voice-input-bundle') },
    hooks: { speechReadiness: readiness.state, microphoneDevice: microphone, voiceActivation: activation,
      shortcuts: ctx.shortcuts.catalog, pluginNavigation },
    selectMicrophone: (device) => { microphone.set(device) },
    selectActivation: (mode) => { activation.set({ mode }) },
    registerActuator: actuator => actuators.register(actuator),
    createRecording: () => {
      const recording = new Recording(() => { recordings.delete(recording) }, microphone.getSnapshot().id)
      recordings.add(recording)
      return recording
    },
    transcribe: async (request, signal) => await ctx.remote.speech.transcribe(request, signal),
    configure: async (patch) => { const result = await ctx.remote.speech.configure(patch); if (!result.ok) throw result.error },
    prepare: async (providerId, options) => {
      const result = await ctx.remote.speech.prepare(providerId, options); if (!result.ok) throw result.error
    },
    cancelPreparation: async (providerId) => {
      const result = await ctx.remote.speech.cancelPreparation(providerId); if (!result.ok) throw result.error
    },
  }
  ctx.slots.inject('conversation.input.activity', () => ctx.slots.register({
    name: 'conversation.input.activity', locale: NS, inject: () => actions,
  }, VoiceInput))
  ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({ name: 'plugins.bundle.config',
    key: '@deepseek-ai/dsh-experimental-voice-input-bundle', locale: NS, inject: () => actions,
  }, VoicePreparation))
  ctx.slots.inject('plugins.bundle.activation', () => ctx.slots.register({ name: 'plugins.bundle.activation',
    key: '@deepseek-ai/dsh-experimental-voice-input-bundle', locale: NS, inject: () => actions,
  }, VoiceSetupPrompt))

}

/**
 * Mount this experimental namespace without adding it to stable API Remotes.
 * @param ctx - Client runtime owning the Remote, dictionaries and slots.
 * @param contribution - generated speech Remote definitions.
 * @returns disposer joining UI and Remote withdrawal.
 */
export async function mountVoiceInput(ctx: Context, contribution: TypertRemoteContribution): Promise<() => Promise<void>> {
  const disposeRemote = await ctx.remote.$mount(contribution)
  const ui = ctx.inject(['remote.speech', 'slots', 'locale', 'shortcuts', 'sessions'], registerUi)
  try { await ui } catch (error) { await ui.dispose(); await disposeRemote(); throw error }
  return async () => { await ui.dispose(); await disposeRemote() }
}
