# Feature Brief: Folder Sync Manager (Two-Way)

## Overview
A sync system that watches a **Manager folder** (with subfolders) and a **CLI folder** (with subfolders), keeping them in sync in both directions. Not limited to `.ps1` — should work for any file type (`.md`, `.txt`, `.js`, `.py`, etc).

When a change is detected on either side, the user is prompted before anything is written — no silent overwrites.

---

## Core Concept

```
Manager Folder/Subfolder   <——sync——>   CLI Folder/Subfolder
```

- Two-way: a change in **either** folder can trigger a sync to the other.
- Not automatic-silent — every detected change surfaces a **confirmation prompt** before it's applied.
- Structure (subfolders) should mirror between the two sides.

---

## Sync Trigger Flow

1. File system watcher detects a change in either folder (create, edit, delete, rename).
2. System identifies which side changed and what changed.
3. User is shown a prompt with **3 options**:
   - **Execute** → apply the change to the other folder now
   - **Ignore** → discard this change, don't sync it (this time only)
   - **Remind me later** → defer the prompt (queue it, re-surface on next app open / next check-in)
4. Log the action taken (for audit / undo reference — recommended, not strictly required for v1).

---

## Requirements

### File type support
- Must not be hardcoded to `.ps1` — needs to handle arbitrary file extensions.
- Suggest treating all files the same at the file-system level (byte/content diff), regardless of extension. No special parsing needed unless a specific format requires it later.
- **Exception: `.md` files on the Manager side.** See "Markdown Source Extraction" below — these need special parsing, not a raw byte diff.

### Markdown source extraction (Manager → CLI direction)
When the source file on the **Manager side is a `.md` file**, the sync should not copy the raw file as-is. Instead:

1. Parse the `.md` file and find the **first fenced code block** (` ```...``` `).
2. Extract **only the content inside that first code block** — this becomes the actual synced script content.
3. **Ignore everything else** in the `.md` file — any text/title/notes before the code block, and anything after it (including any additional code blocks further down the file).
4. The extracted content is written to the corresponding file on the CLI side (e.g., as `.ps1`, `.sh`, etc., based on the language tag or a configured mapping).

**Example:**
```markdown
# My Script Title

Some notes about what this does...

​```powershell
Get-ChildItem -Recurse
​```

More notes down here, or a second code block — none of this is synced.
```
→ Only `Get-ChildItem -Recurse` gets written to the CLI-side file.

**Change detection implication:** since the source is now "content inside first code block" rather than "whole file," the hash/diff used to detect changes on the Manager side must be computed on the **extracted block content**, not the raw `.md` file. Otherwise, editing the surrounding notes (title, comments) would falsely trigger a sync even though the actual script content didn't change.

**Open question:** does the **CLI → Manager** direction need the reverse behavior — i.e., when a CLI-side script changes, does it get wrapped back into the `.md` file's existing code block (preserving the surrounding notes), or does it just overwrite the whole `.md`? Preserving surrounding notes is safer but more complex to implement (need to re-inject content into the same fence location rather than regenerating the file).

### Change detection
- Watch both folders recursively (subfolders included).
- Detect: **new file**, **modified file** (content changed), **deleted file**, **renamed/moved file**.
- Needs a way to tell "this file changed on the Manager side" vs "this file changed on the CLI side" — track last-synced state (e.g., hash or timestamp per file) so it knows which direction the change came from.

### Conflict handling
- If **both sides** change the same file before a sync happens → this is a conflict. Needs explicit handling (e.g., show both versions, let user pick, or default to "ask every time" for conflicts specifically).

### Content extraction rule (Manager side)
- On the Manager side, files are markdown notes — title, description, notes, **then a code block** containing the actual script/content.
- Sync should **only look at the content inside the first code block** in the file. Everything before it (title, intro text) and everything after it (notes, comments, extra sections) is **ignored** for change-detection and diffing purposes.
- So: change detection = hash/diff of "first codeblock content" only, not the whole markdown file.
- When syncing Manager → CLI: extract first codeblock content, write that as the plain file on the CLI side (e.g., `.ps1`, `.js`, whatever the fence language implies or whatever extension is configured).
- When syncing CLI → Manager: the raw CLI file content gets inserted back into the first codeblock of the corresponding markdown note, **without touching** the surrounding title/notes text.
- Edge case to flag for the dev: what if the markdown file has **no codeblock yet** (new note, nothing written inside)? Needs a defined behavior — e.g., skip until a codeblock exists, or treat the whole file as pending/invalid for sync.
- Edge case: what if there's **more than one codeblock** in the note? Per this brief, only the **first** one is used — everything after it, including a second codeblock, is ignored by the sync logic.

### "Remind me later" behavior
- Deferred changes should queue somewhere the user can review later (a pending-changes list), not just vanish.
- Decide: does it re-prompt automatically on next app launch, or only when user opens the pending list manually?

---

## Open Questions for Implementation

1. **Folder mapping** — is it always one Manager folder ↔ one CLI folder, or should the user be able to configure multiple folder pairs?
2. **Subfolder structure** — must subfolder names/structure match exactly on both sides, or can the mapping be customized (e.g., Manager `/scripts/` maps to CLI `/bin/`)?
3. **Watcher implementation** — native file system watcher (e.g., `FileSystemWatcher` in .NET/PowerShell, `chokidar` in Node) vs polling on interval? Native watcher is more efficient but can be less reliable across network drives.
4. **Conflict default** — if not specified, should conflicts default to "ask" or is there a preferred fallback (e.g., newest timestamp wins)?
5. **Deletion sync** — if a file is deleted on one side, should it prompt to delete on the other side too, or only sync additions/edits?

---

## Suggested v1 Scope (to keep it buildable)

- Single folder pair (Manager ↔ CLI), no multi-pair config yet
- Mirror subfolder structure 1:1
- Content-hash based change detection (simple, reliable)
- Confirmation prompt with Execute / Ignore / Remind Me Later
- Pending list for "remind me later" items, manually reviewable
- Conflicts default to "always ask" (safest, simplest to implement first)

Multi-folder mapping, custom path mapping, and auto-resolve rules can be v2.