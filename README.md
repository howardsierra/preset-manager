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

## Install

Extensions ▸ Install extension ▸ paste this repo's URL.
Or copy this folder into `data/<your-user>/extensions/` and reload.

Chat Completion APIs only.
