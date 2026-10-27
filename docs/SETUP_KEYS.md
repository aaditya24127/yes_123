# Adding your AI keys

Everything is already installed. The app works without any keys (free built-in rules and free Whisper speech-to-text on
this computer). Keys only make the answers smarter.

## Steps

1. Open the file `.env` in the project folder (`C:\Users\Rohan\CRP\.env`) in Notepad or VS Code.
2. Find the block **AI KEYS** and paste each key after the `=` sign, with no spaces or quotes:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```
3. Save the file. That's it: the app notices the change by itself (no restart needed).
4. Open the website, go to **Settings**, and press **Test AI connections**. Each AI shows a green tick, a red cross with
   the reason, or "not in use". The test is free (it does not use any credit).

## Which keys

| Key | What it switches on | Where to get it | Cost |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Claude (first choice for every AI job): sorting unclear files, reading reports / scans / handwriting, student questions, lesson evaluation, textbook web search, Ask the copilot | The key from the hackathon (starts with `sk-ant-`), or console.anthropic.com > API keys | Paid from the credit. Haiku (cheap) does routine work; Opus only for scans and evaluations. `AI_BUDGET_USD` (default 50) is a cap inside the app: when the app's logged Claude cost reaches it, Claude is skipped and Gemini / rules take over. |
| `GEMINI_API_KEY` + `READ_PROVIDER=gemini` | Gemini free tier: second choice for every AI job (works on its own when there is no Claude key) | aistudio.google.com/apikey | Free tier, limited per day. Models are tried in order (`models` in `config/ai.json`), skipping busy or retired ones. Free tiers may use what you send to train their AI: **demo data only, never real student data.** |
| `GROQ_API_KEY` | Faster speech-to-text in the cloud | console.groq.com/keys | Free tier. Without it, Whisper runs on this computer for free (already downloaded). |

## Watching the cost

**Settings > AI cost** shows every AI call, which AI answered, tokens used, and the approximate cost in dollars, for the last 30
days and all time.

## Changing which AI does what

`config/ai.json` lists, for every job, the AIs to try in order. Examples:
- Use Sonnet instead of Opus for evaluations: change `"model": "claude-opus-5-5"` under `claude_smart` to `"claude-sonnet-5-5"`.
- Use only free options: put `"rules"` first in a job's list.
- Use your own trained model: see `docs/REAL_WORLD_V2.md` ("plug in your own trained model").

Saved changes to `config/ai.json` also take effect without a restart.

## Keep keys safe

- Never put keys in the app, in git, in chat, or in a screenshot.
- On a cloud server, put them in the host's "environment variables" settings instead of a file.
- If a key leaks, delete it in the provider's console and make a new one.
