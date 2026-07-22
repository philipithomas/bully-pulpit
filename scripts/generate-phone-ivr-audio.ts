import { access, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { gateway } from '@ai-sdk/gateway'
import { generateSpeech } from 'ai'
import {
  PHONE_IVR_FALLBACK_PROMPTS,
  PHONE_IVR_SPEECH_FORMAT,
  PHONE_IVR_SPEECH_MODEL_ID,
  PHONE_IVR_SPEECH_VOICE,
  type PhoneIvrFallbackKey,
  phoneIvrFallbackAudioPath,
} from '@/lib/phone/ivr-audio'

const model = gateway.speechModel(PHONE_IVR_SPEECH_MODEL_ID)

function isWaveAudio(audio: Uint8Array): boolean {
  return (
    audio.byteLength >= 12 &&
    Buffer.from(audio.subarray(0, 4)).toString('ascii') === 'RIFF' &&
    Buffer.from(audio.subarray(8, 12)).toString('ascii') === 'WAVE'
  )
}

async function main(): Promise<void> {
  const prompts = Object.entries(PHONE_IVR_FALLBACK_PROMPTS) as Array<
    [PhoneIvrFallbackKey, string]
  >

  for (const [key, text] of prompts) {
    const relativePath = phoneIvrFallbackAudioPath(key).slice(1)
    const outputPath = path.join(process.cwd(), 'public', relativePath)
    try {
      await access(outputPath)
      console.log(`[phone:audio] kept ${relativePath}`)
      continue
    } catch {
      // A configuration or prompt change creates a new hashed path.
    }

    const { audio, warnings } = await generateSpeech({
      model,
      text,
      voice: PHONE_IVR_SPEECH_VOICE,
      outputFormat: PHONE_IVR_SPEECH_FORMAT,
    })
    if (audio.mediaType !== 'audio/wav' || !isWaveAudio(audio.uint8Array)) {
      throw new Error(`Unexpected ${key} audio type: ${audio.mediaType}`)
    }
    if (warnings.length > 0) {
      console.warn(`[phone:audio] ${key} warnings:`, warnings)
    }

    await mkdir(path.dirname(outputPath), { recursive: true })
    await writeFile(outputPath, audio.uint8Array)
    console.log(`[phone:audio] wrote ${relativePath}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
