# Interval trainer

- Custom Selection is the only current training mode. Record completed quiz answers only.
- Preserve existing training behavior unless the user requests a change.
- Do not redesign the UI without being asked.
- Keep reference playback and the interactive piano independent of quiz state and statistics.
- Use free browser APIs and free dependencies. No paid services or backend required.
- Keep raw attempts in IndexedDB; support versioned JSON backups and validated, duplicate-safe import.
- Run syntax checks and relevant tests after meaningful changes.
- Prefer small, reviewable edits. Preserve the original intervalsPractice.html as the baseline.
- The user runs index.html through VS Code Live Server. No build step is required.
- Confusion recommendations stay inside Statistics. No post-error prompts or automatic drills. Explicit pair choices must preserve unanswered questions and session totals.
