# Change Log

All notable changes to the "code-insights" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.4.0] - 2026-05-14

- Added the guided static Test tab with curated code samples, explanations, and expected behavior.
- Added Python built-in insights for `sorted`, `len`, and `list.sort`.
- Fixed resolver support for two-part NumPy calls such as `np.sort(...)` and `np.copy(...)`.
- Added resolver tests for NumPy aliases, direct imports, Python built-ins, list methods, and non-NumPy aliases.
- Added a working Ask AI tab with environment-driven OpenAI and Gemini support.
- Added FAQ starter questions, multi-turn chat memory, local JSON chat storage, temporary chats, rename/delete, 30-day auto cleanup, and styled code block rendering.
- Kept Test educational only: no code execution, sandboxing, or Python runtime.
- Fixed Marketplace packaging so bundled insight data is available after install.
- Updated release metadata and documentation for v0.4.0.
