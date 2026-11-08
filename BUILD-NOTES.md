# Build notes: ToneShift

Rewrites a pasted message in a chosen tone (Friendly, Professional, Short) using Gemini through a small Express endpoint. Built in Google AI Studio's Build mode. This is project 2 of 5 in my [AI Studio build notes](https://github.com/YenXenshi/ai-studio-build-notes), where the full write-up lives.

This is an independent project, not made or endorsed by Google. Notes are from 2026-11-04 and 2026-11-07.

## What I'm working on here
Making a Gemini-powered app fail gracefully.

## What broke, and how it got fixed
1. A "not valid JSON" error hid the real cause. The logs panel showed Gemini returning a 503 (model busy).
2. Added 3 retries (1 s, then 2 s) and a backup model. The backup produced the rewrite.
3. One call hung with no finish line in the log. Added a 12 s limit per attempt on the server and a 60 s abort in the browser.

## What I tested
All three tones return rewrites; the empty box disables the button. Fresh clone with no API key: 400 for an empty or over-5,000-character message, and a clear 500 for the missing key.

## What I learned
Read the logs panel first. A start line with no finish line means no time limit. Plan for the model being busy.

## Security notes (read from the code, NOT attack-tested)
The key stays on the server, but the endpoint has no login or rate limit. Anyone with the app URL could use the owner's Gemini quota. The footer claims messages are never logged while the server logs attempt and error lines.

## NOT tested
Real rewrites from the fresh clone (no API key used), the 60 s abort message, a real phone, and whether the rate-limit problem can really be abused.

## Running it
`npm install --legacy-peer-deps`, set `GEMINI_API_KEY`, then `npm run dev` (tested on Node 22; plain `npm install` fails with a dependency conflict). Model names are hard-coded in `server.ts` and will go out of date.
