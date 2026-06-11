# Preset Organizer

Collapsible sections, search, and bulk toggles for SillyTavern's Chat
Completion prompt manager.

## How sections work

Name any prompt with a divider-style name and it becomes a section header:

```
===== Writing Style =====
--- NSFW toggles ---
## Jailbreaks
```

Everything below a divider (until the next one) belongs to that section.
The divider pattern is a regex you can change in Extensions ▸ Preset Organizer.

## Features

- **Click a header** to collapse/expand its section — state is saved per preset
- **Enabled/total badge** on every header (teal = all on, gray = all off)
- **Bulk toggle** on each header: enable or disable the whole section in one click
- **Search bar** above the list — filters prompts by name across all sections
- **Collapse all / expand all** buttons

Non-destructive: SillyTavern's own prompt rows are decorated in place, never
re-parented, so drag-to-reorder, editing, and all native controls keep working.

### New in 1.1.0

- **Preset Navigator** — a grid-style preset browser. Click the grid icon next
  to the preset dropdown to search, favorite (⭐ floats to top), and switch
  presets visually; the current preset is highlighted

### New in 1.2.0

- **Navigator covers every API** — browse buttons now appear next to all four
  of SillyTavern's preset dropdowns: Chat Completion (OpenAI, Claude, Google,
  Mistral, Cohere, Scale, AI21, OpenRouter, …), KoboldAI, NovelAI, and Text
  Completion (TextGen WebUI, Tabby, …). Favorites are saved per API.
- **Search highlighting** — matching text lights up in amber as you type
- **Section chips** — a colored chip row under the toolbar; click any chip to
  expand and jump straight to that section

### New in 1.3.0

- **Extensions panel organizer, built in** — the Extensions settings panel gets
  the full treatment: sticky search toolbar, pin favorites (⭐), assignable
  color-coded categories with collapsible card sections, monogram tiles and
  count chips, A–Z sorting, and an organize mode that hides the controls for
  everyday use. Styled like Context Lens: solid navy cards, accent gradients.
- Shares saved pins/categories with the standalone "Extension Organizer"
  extension and automatically stands down if it detects the standalone running
  — but you should disable the standalone and use this one.
- Toggle it off under Extensions ▸ Preset Organizer (refresh to restore vanilla).

### New in 1.4.0

- **Quick Lorebook Access** — a compact, collapsible bar inside the prompt
  manager. Tap chips to toggle global lorebooks without leaving the panel;
  amber = active, and a teal underline marks books in the current character's
  LoreLink profile. If LoreLink is installed, the header shows profile ✓ or
  a mismatch warning with a one-tap **Sync** button. Built mobile-first:
  big tap targets, wraps cleanly on narrow screens, collapsed by default.
  Works standalone too (just chips + count) if LoreLink isn't installed.

## Install

Extensions ▸ Install extension ▸ paste this repo's URL.
Or copy this folder into `data/<your-user>/extensions/` and reload.

Chat Completion APIs only.
