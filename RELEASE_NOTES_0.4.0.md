# Code Insights v0.4.0 Release Notes

Release date: 2026-05-25

Code Insights v0.4.0 is the first release with a full guided learning panel and a working Ask AI experience.

## Highlights

- Added the guided static Test tab with curated code samples, explanation notes, and expected behavior.
- Added Python built-in insights for `sorted`, `len`, and `list.sort`.
- Added resolver support for two-part NumPy calls such as `np.sort(...)` and `np.copy(...)`.
- Added Ask AI with OpenAI and Gemini support.
- Added local multi-turn chat history, temporary chats, rename/delete, response styles, regenerate, and copy actions.
- Added comma-separated API key fallback support for OpenAI and Gemini.
- Fixed Marketplace packaging so bundled JSON insight data is included in the VSIX.
- Added the Marketplace icon and release metadata.

## Configuration

Use a workspace `.env` file for AI settings:

```env
CODE_INSIGHTS_AI_PROVIDER=gemini
CODE_INSIGHTS_AI_MODEL=gemini-2.5-flash
GEMINI_API_KEY=your_first_key,your_backup_key
```

OpenAI is also supported:

```env
CODE_INSIGHTS_AI_PROVIDER=openai
CODE_INSIGHTS_AI_MODEL=gpt-4.1-mini
OPENAI_API_KEY=your_first_key,your_backup_key
```

## Notes

- Test examples are static and educational. Code Insights does not execute code.
- Chat history is stored locally and saved chats are cleaned up after 30 days.
- Temporary chats are not saved to disk.
- `.env` files are excluded from the VSIX package.
