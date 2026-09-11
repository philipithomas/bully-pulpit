# Bell voice

Bell defaults to GPT-Live-1 for the continuous voice conversation. The Live
session delegates research to the same Sol model and archive tools as web Bell,
using high reasoning, Gateway provider fallback and zero data retention. Voice
and text backend instructions are separate. Neither recorded call audio nor
live transcript content is persisted; transcript fragments remain in memory for
the existing post-call admin email. `store: false` is explicit on both APIs.

## Telephone connection

Twilio dials the project SIP URI with TLS signaling and `secure=true` for SRTP
media. The existing signed `/api/openai/realtime-call` endpoint must subscribe to
`live.transport.incoming`. It accepts only SIP transports, keeps the returned
`live_` identifier unchanged, verifies the CallSid-bound invitation and caller
metadata, then accepts through `/v1/live/sessions/{session_id}/accept`.

Keep the legacy `live.call.incoming` webhook while provider retries drain.
Paired Realtime notifications do not accept a second time. A 409 decision from
OpenAI never starts another controller. The one background controller attaches
to `/v1/live/sessions/{session_id}/attach` without another `session.start`.

The controller requests the opening with `session.instructions.append`, then
sends a short commentary prompt after the matching acknowledgment. The
acknowledgments, output transcript, and audible reflected samples verify
generated speech, not that a caller heard the entire opening. Continuous silence
frames cannot satisfy the startup deadline. Live has no spoken-response completion
event. Transcript rows are therefore partial observations rather than completed
turns. A closed socket without `session.closed` is incomplete finalization.

Client delegation notifications contain no task text. Bell waits for transcript
context, serializes speaker values as JSON strings, and passes current context
to its backend. A new caller fragment invalidates stale backend work and results.
The backend keeps authorization checks immediately before private actions.

## Signup and voicemail

An explicit voicemail request uses the existing authenticated parent-call
redirect. An explicit signup request opens the keypad menu, which reads the
existing disclosure and lets the caller press 2. A spoken yes in GPT-Live never
subscribes anyone. Existing subscribers are not offered another signup; the
same call's unfinished signup can still recover its onboarding enqueue.

The star key always reaches the manual menu. The call retains its five-minute
limit and fallback on controller failure. Fixed IVR prompts remain Iris WAVs;
recorded voicemail still uses its separate transcription workflow.

## Configuration and verification

`OPENAI_PHONE_VOICE_ENGINE=gpt-live-1` is the default. For explicit rollback,
set it to `realtime`, retain `realtime.call.incoming` on the webhook, and use
`OPENAI_PHONE_REALTIME_MODEL=gpt-realtime-2.1` (or the supported mini). That
rollback retains the previous semantic-VAD and playback-gated spoken signup.

Before activation, verify Live session access with the production project key
and the Live webhook subscription. After activation, verify the SIP/media path
with an inbound call. Run the delivery-free
`pnpm phone:live:smoke` to verify WebRTC audio, the real sideband controller,
greeting, and graceful close. It requires Chrome and a Playwright runtime;
set `BELL_LIVE_PLAYWRIGHT_PATH` if Playwright is installed outside the project.
Pass `--input-wav /tmp/question.wav` for a synthetic
research question encoded as mono PCM16LE at 24 kHz, and optionally
`--output-wav /tmp/bell-live-smoke.wav` to inspect generated test speech.
The smoke has no private actions and sends no SMS or email. It verifies the
OpenAI audio/delegation path, not Twilio's PSTN/SIP delivery or handset playback.

## Official references

- [Live migration and separation of voice/backend instructions](https://developers.openai.com/api/docs/guides/live-migration)
- [SIP acceptance, events, and opaque session IDs](https://developers.openai.com/api/docs/guides/voice-sip?api=live)
- [Sideband controls and the limits of reflected audio](https://developers.openai.com/api/docs/guides/voice-server-controls?api=live)
- [Client delegation and context appends](https://developers.openai.com/api/docs/guides/live-delegation)
- [Disclosures, transcripts, storage, and session finalization](https://developers.openai.com/api/docs/guides/live-conversations)
- [Twilio secure SIP media](https://www.twilio.com/docs/voice/api/secure-media)
