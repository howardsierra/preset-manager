/**
 * Preset Organizer — collapsible sections, search, and bulk toggles for
 * SillyTavern's Chat Completion prompt manager.
 *
 * How sections work:
 *   Any prompt whose NAME matches the divider pattern becomes a section
 *   header. Everything below it (until the next divider) belongs to that
 *   section. Example divider names:
 *       ===== Writing Style =====
 *       --- NSFW toggles ---
 *       ## Jailbreaks
 *
 *   Default pattern: names starting with 2+ of  = - — _ * # ~ •
 *   (configurable in Extensions ▸ Preset Organizer).
 *
 * Features:
 *   - Click a header to collapse/expand its section (state saved per preset)
 *   - Enabled/total count badge on every header
 *   - Per-section bulk toggle: one click enables or disables the whole group
 *   - Search bar that filters prompts by name across all sections
 *   - Collapse-all / expand-all buttons
 *
 * Non-destructive: SillyTavern's own <li> elements are decorated in place,
 * never re-parented, so drag-to-reorder and all native controls keep working.
 */

(() => {
    'use strict';

    const MODULE = 'presetOrganizer';
    const DEFAULT_PATTERN = '^\\s*[=\\-—–_*#~•]{2,}';

    /** Per-section accent colors, cycled in order down the list. */
    const PALETTE = [
        '#8B7CFF', // violet
        '#FF6B9D', // pink
        '#FFB347', // amber
        '#4ECDC4', // teal
        '#A8E05F', // lime
        '#FF8C66', // coral
        '#6FB8FF', // sky
        '#E07BE0', // orchid
    ];

    const ctx = () => SillyTavern.getContext();

    function settings() {
        const es = ctx().extensionSettings;
        es[MODULE] = es[MODULE] || { pattern: DEFAULT_PATTERN, collapsed: {}, favorites: [] };
        if (typeof es[MODULE].pattern !== 'string') es[MODULE].pattern = DEFAULT_PATTERN;
        if (!es[MODULE].collapsed) es[MODULE].collapsed = {};
        if (!Array.isArray(es[MODULE].favorites)) es[MODULE].favorites = [];
        return es[MODULE];
    }

    function save() { ctx().saveSettingsDebounced(); }

    /* ------------------------------------------------------------------ */
    /* DOM access helpers                                                  */
    /* ------------------------------------------------------------------ */

    const listEl = () => document.getElementById('completion_prompt_manager_list');

    function presetKey() {
        const sel = document.getElementById('settings_preset_openai');
        return sel?.selectedOptions?.[0]?.textContent?.trim() || '_default';
    }

    function dividerRegex() {
        try { return new RegExp(settings().pattern, 'u'); }
        catch { return new RegExp(DEFAULT_PATTERN, 'u'); }
    }

    function promptName(li) {
        return li.querySelector('.completion_prompt_manager_prompt_name a, .completion_prompt_manager_prompt_name span, .completion_prompt_manager_prompt_name')
            ?.textContent?.trim() ?? '';
    }

    function isEnabled(li) {
        return !li.classList.contains('completion_prompt_manager_prompt_disabled');
    }

    /** Strip divider characters to get a clean section title. */
    function cleanTitle(name) {
        const t = name.replace(/^[\s=\-—–_*#~•]+|[\s=\-—–_*#~•]+$/gu, '').trim();
        return t || name.trim() || 'Section';
    }

    /* ------------------------------------------------------------------ */
    /* Section model: scan the list and group items under dividers         */
    /* ------------------------------------------------------------------ */

    function scanSections() {
        const list = listEl();
        if (!list) return [];
        const items = [...list.querySelectorAll('li.completion_prompt_manager_prompt')];
        const re = dividerRegex();
        const sections = [];
        let current = null;

        for (const li of items) {
            const name = promptName(li);
            if (name && re.test(name)) {
                current = { headerLi: li, id: li.getAttribute('data-pm-identifier') || name, title: cleanTitle(name), members: [] };
                sections.push(current);
            } else if (current) {
                current.members.push(li);
            }
        }
        return sections;
    }

    /* ------------------------------------------------------------------ */
    /* Decoration                                                          */
    /* ------------------------------------------------------------------ */

    let applying = false;          // guard: our own DOM edits must not re-trigger
    let observer = null;

    function apply() {
        const list = listEl();
        if (!list || applying) return;
        applying = true;
        try {
            ensureToolbar();
            // Clear decorations from a previous pass that ST's re-render may
            // have left behind on recycled nodes
            list.querySelectorAll('.porg-caret, .porg-badge, .porg-bulk').forEach(n => n.remove());
            list.querySelectorAll('li').forEach(li => li.classList.remove('porg-header', 'porg-collapsed-hide', 'porg-search-hide', 'porg-member'));

            const sections = scanSections();
            const collapsedMap = settings().collapsed[presetKey()] || {};
            const chips = [];

            sections.forEach((sec, i) => {
                const li = sec.headerLi;
                const accent = PALETTE[i % PALETTE.length];
                chips.push({ title: sec.title, accent, id: sec.id, headerLi: li });
                li.classList.add('porg-header');
                li.style.setProperty('--porg-accent', accent);
                const collapsed = !!collapsedMap[sec.id];

                /* caret */
                const caret = document.createElement('span');
                caret.className = 'porg-caret fa-solid fa-chevron-down';
                caret.classList.toggle('porg-rot', collapsed);
                caret.title = collapsed ? 'Expand section' : 'Collapse section';

                /* enabled/total badge */
                const on = sec.members.filter(isEnabled).length;
                const badge = document.createElement('span');
                badge.className = 'porg-badge';
                badge.textContent = `${on}/${sec.members.length}`;
                badge.classList.toggle('porg-badge-off', on === 0);
                badge.classList.toggle('porg-badge-full', on === sec.members.length && sec.members.length > 0);
                badge.title = `${on} of ${sec.members.length} prompts enabled`;

                /* bulk toggle */
                const bulk = document.createElement('span');
                bulk.className = `porg-bulk fa-solid ${on > 0 ? 'fa-toggle-on' : 'fa-toggle-off'}`;
                bulk.title = on > 0 ? 'Disable whole section' : 'Enable whole section';
                bulk.addEventListener('click', (e) => {
                    e.stopPropagation();
                    bulkToggle(sec, on === 0);
                });

                const nameSpan = li.querySelector('.completion_prompt_manager_prompt_name') || li;
                nameSpan.prepend(caret);
                nameSpan.append(badge);
                const controls = li.querySelector('.prompt_manager_prompt_controls');
                (controls || li).prepend(bulk);

                /* collapse on header click (but never on ST's own controls) */
                li.addEventListener('click', onHeaderClick);

                /* hide members if collapsed */
                if (collapsed) {
                    for (const m of sec.members) m.classList.add('porg-collapsed-hide');
                }
                for (const m of sec.members) {
                    m.classList.add('porg-member');
                    m.style.setProperty('--porg-accent', accent);
                }
            });

            renderChips(chips);
            addNavButtons();
            applySearch();
        } finally {
            // Let the mutation queue flush before re-arming
            requestAnimationFrame(() => { applying = false; });
        }
    }

    function onHeaderClick(e) {
        // Ignore clicks on interactive ST controls or our bulk toggle
        if (e.target.closest('.prompt_manager_prompt_controls, .porg-bulk, a, input, .drag-handle')) return;
        const li = e.currentTarget;
        const id = li.getAttribute('data-pm-identifier') || promptName(li);
        const map = settings().collapsed;
        const key = presetKey();
        map[key] = map[key] || {};
        map[key][id] = !map[key][id];
        save();
        apply();
    }

    async function bulkToggle(sec, enable) {
        // Drive ST's own toggle buttons so all internal state stays correct.
        for (const li of sec.members) {
            if (isEnabled(li) !== enable) {
                li.querySelector('.prompt-manager-toggle-action')?.click();
                // ST re-renders on each toggle; yield so the DOM settles
                await new Promise(r => setTimeout(r, 10));
            }
        }
        // The list was re-rendered; lis are stale. Final re-apply happens via
        // the observer, but force one in case mutations coalesced.
        setTimeout(apply, 50);
    }

    function setAll(collapsed) {
        const map = settings().collapsed;
        const key = presetKey();
        map[key] = {};
        if (collapsed) {
            for (const sec of scanSections()) map[key][sec.id] = true;
        }
        save();
        apply();
    }

    /* ------------------------------------------------------------------ */
    /* Search                                                              */
    /* ------------------------------------------------------------------ */

    let query = '';

    /** Highlight the query inside a prompt's name anchor (reversible). */
    function highlight(li, q) {
        const a = li.querySelector('.completion_prompt_manager_prompt_name a');
        if (!a) return;
        if (!a.dataset.porgName) a.dataset.porgName = a.textContent;
        const name = a.dataset.porgName;
        if (!q) { a.textContent = name; return; }
        const i = name.toLowerCase().indexOf(q);
        if (i < 0) { a.textContent = name; return; }
        a.textContent = '';
        a.append(
            document.createTextNode(name.slice(0, i)),
            Object.assign(document.createElement('mark'), { className: 'porg-hl', textContent: name.slice(i, i + q.length) }),
            document.createTextNode(name.slice(i + q.length)),
        );
    }

    function applySearch() {
        const list = listEl();
        if (!list) return;
        const q = query.trim().toLowerCase();
        const items = [...list.querySelectorAll('li.completion_prompt_manager_prompt')];

        if (!q) {
            items.forEach(li => { li.classList.remove('porg-search-hide'); highlight(li, ''); });
            return;
        }
        // While searching: show matching prompts and any header whose section
        // contains a match; ignore collapse state (temporarily reveal).
        const sections = scanSections();
        const visible = new Set();
        for (const li of items) {
            const match = promptName(li).toLowerCase().includes(q);
            highlight(li, match ? q : '');
            if (match) visible.add(li);
        }
        for (const sec of sections) {
            if (sec.members.some(m => visible.has(m)) || visible.has(sec.headerLi)) {
                visible.add(sec.headerLi);
            }
        }
        for (const li of items) {
            li.classList.toggle('porg-search-hide', !visible.has(li));
            if (visible.has(li)) li.classList.remove('porg-collapsed-hide');
        }
    }

    /* ------------------------------------------------------------------ */
    /* Section quick-jump chips                                            */
    /* ------------------------------------------------------------------ */

    function renderChips(chips) {
        let row = document.getElementById('porg_chips');
        if (!row) {
            const bar = document.getElementById('porg_toolbar');
            if (!bar) return;
            row = document.createElement('div');
            row.id = 'porg_chips';
            bar.insertAdjacentElement('afterend', row);
        }
        row.innerHTML = '';
        row.classList.toggle('porg-hidden', chips.length === 0);
        for (const c of chips) {
            const chip = document.createElement('span');
            chip.className = 'porg-chip';
            chip.style.setProperty('--porg-accent', c.accent);
            chip.textContent = c.title;
            chip.title = `Jump to "${c.title}"`;
            chip.addEventListener('click', () => {
                // Expand if collapsed, then scroll to the header
                const map = settings().collapsed;
                const key = presetKey();
                if (map[key]?.[c.id]) {
                    map[key][c.id] = false;
                    save();
                    apply();
                }
                document.querySelector(`li.porg-header[data-pm-identifier="${CSS.escape(c.id)}"]`)
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
            row.appendChild(chip);
        }
    }

    /* ------------------------------------------------------------------ */
    /* Preset Navigator — visual browser for every preset dropdown          */
    /* ------------------------------------------------------------------ */

    /**
     * SillyTavern funnels all APIs into four preset selects:
     *  - settings_preset_openai: Chat Completion (OpenAI, Claude, Google,
     *    Mistral, Cohere, Scale, AI21, OpenRouter, …)
     *  - settings_preset: KoboldAI
     *  - settings_preset_novel: NovelAI
     *  - settings_preset_textgenerationwebui: Text Completion (WebUI, Tabby, …)
     */
    const PRESET_SELECTS = [
        { id: 'settings_preset_openai', label: 'Chat Completion' },
        { id: 'settings_preset', label: 'KoboldAI' },
        { id: 'settings_preset_novel', label: 'NovelAI' },
        { id: 'settings_preset_textgenerationwebui', label: 'Text Completion' },
    ];

    /** favorites are stored per preset-select so names can't collide. */
    function favBucket(selectId) {
        const s = settings();
        // migrate v1.1.0 flat array → keyed object
        if (Array.isArray(s.favorites)) s.favorites = { settings_preset_openai: s.favorites };
        s.favorites[selectId] = s.favorites[selectId] || [];
        return s.favorites[selectId];
    }

    function addNavButtons() {
        for (const { id, label } of PRESET_SELECTS) {
            const sel = document.getElementById(id);
            if (!sel || document.getElementById(`porg_nav_btn_${id}`)) continue;
            const btn = document.createElement('i');
            btn.id = `porg_nav_btn_${id}`;
            btn.className = 'fa-solid fa-table-cells-large porg-nav-btn interactable';
            btn.title = `Browse ${label} presets visually`;
            btn.tabIndex = 0;
            sel.insertAdjacentElement('afterend', btn);
            btn.addEventListener('click', () => openNavigator(sel, label, id));
        }
    }

    function closeNavigator() {
        document.getElementById('porg_nav')?.remove();
        document.removeEventListener('keydown', navEsc);
    }

    function navEsc(e) { if (e.key === 'Escape') closeNavigator(); }

    function openNavigator(sel, label, selectId) {
        closeNavigator();
        if (!sel) return;
        const current = sel.selectedOptions[0]?.textContent.trim();

        const overlay = document.createElement('div');
        overlay.id = 'porg_nav';
        overlay.innerHTML = `
            <div class="porg-nav-modal">
                <div class="porg-nav-head">
                    <i class="fa-solid fa-table-cells-large"></i>
                    <b>${label} presets</b>
                    <input id="porg_nav_search" class="text_pole" type="text"
                           placeholder="Search presets…" autocomplete="off">
                    <span class="porg-nav-close" title="Close">×</span>
                </div>
                <div class="porg-nav-grid"></div>
            </div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) closeNavigator(); });
        overlay.querySelector('.porg-nav-close').addEventListener('click', closeNavigator);
        document.addEventListener('keydown', navEsc);

        const grid = overlay.querySelector('.porg-nav-grid');

        function renderGrid(filter = '') {
            const favs = new Set(favBucket(selectId));
            const q = filter.trim().toLowerCase();
            const names = [...sel.options].map(o => o.textContent.trim())
                .filter(n => !q || n.toLowerCase().includes(q))
                .sort((a, b) => (favs.has(b) - favs.has(a)) || a.localeCompare(b));

            grid.innerHTML = names.length ? '' : '<div class="porg-nav-empty">No presets match.</div>';
            names.forEach((name, i) => {
                const accent = PALETTE[i % PALETTE.length];
                const card = document.createElement('div');
                card.className = 'porg-nav-card' + (name === current ? ' porg-nav-current' : '');
                card.style.setProperty('--porg-accent', accent);
                card.innerHTML = `
                    <span class="porg-nav-mono">${name.slice(0, 1).toUpperCase()}</span>
                    <span class="porg-nav-name"></span>
                    <i class="porg-nav-fav fa-star ${favs.has(name) ? 'fa-solid porg-faved' : 'fa-regular'}"
                       title="Favorite"></i>`;
                card.querySelector('.porg-nav-name').textContent = name;
                card.title = name === current ? `${name} (current)` : `Switch to "${name}"`;

                card.querySelector('.porg-nav-fav').addEventListener('click', (e) => {
                    e.stopPropagation();
                    const f = favBucket(selectId);
                    const idx = f.indexOf(name);
                    idx >= 0 ? f.splice(idx, 1) : f.push(name);
                    save();
                    renderGrid(filter);
                });

                card.addEventListener('click', () => {
                    const opt = [...sel.options].find(o => o.textContent.trim() === name);
                    if (opt) {
                        sel.value = opt.value;
                        if (window.jQuery) jQuery(sel).trigger('change');
                        else sel.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                    closeNavigator();
                });
                grid.appendChild(card);
            });
        }

        renderGrid();
        const search = overlay.querySelector('#porg_nav_search');
        search.addEventListener('input', () => renderGrid(search.value));
        search.focus();
    }

    /* ------------------------------------------------------------------ */
    /* Toolbar (search box + collapse/expand all)                          */
    /* ------------------------------------------------------------------ */

    function ensureToolbar() {
        const list = listEl();
        if (!list || document.getElementById('porg_toolbar')) return;
        const bar = document.createElement('div');
        bar.id = 'porg_toolbar';
        bar.innerHTML = `
            <i class="fa-solid fa-magnifying-glass porg-tb-icon"></i>
            <input id="porg_search" class="text_pole" type="text"
                   placeholder="Search prompts…" autocomplete="off">
            <i id="porg_collapse_all" class="fa-solid fa-angles-up porg-tb-btn"
               title="Collapse all sections"></i>
            <i id="porg_expand_all" class="fa-solid fa-angles-down porg-tb-btn"
               title="Expand all sections"></i>`;
        list.parentElement.insertBefore(bar, list);

        bar.querySelector('#porg_search').addEventListener('input', (e) => {
            query = e.target.value;
            applySearch();
        });
        bar.querySelector('#porg_collapse_all').addEventListener('click', () => setAll(true));
        bar.querySelector('#porg_expand_all').addEventListener('click', () => setAll(false));
    }

    /* ------------------------------------------------------------------ */
    /* Settings drawer (divider pattern)                                   */
    /* ------------------------------------------------------------------ */

    function addSettingsDrawer() {
        const host = document.getElementById('extensions_settings');
        if (!host || document.getElementById('porg_settings')) return;
        const wrap = document.createElement('div');
        wrap.id = 'porg_settings';
        wrap.innerHTML = `
            <div class="inline-drawer">
                <div class="inline-drawer-toggle inline-drawer-header">
                    <b>Preset Organizer</b>
                    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                </div>
                <div class="inline-drawer-content">
                    <label for="porg_pattern">Divider name pattern (regex)</label>
                    <input id="porg_pattern" class="text_pole" type="text">
                    <small>A prompt whose name matches this pattern becomes a
                    collapsible section header. Default:
                    <code>${DEFAULT_PATTERN.replace(/</g, '&lt;')}</code></small>
                    <div class="flex-container marginTop5">
                        <div id="porg_pattern_reset" class="menu_button">Reset to default</div>
                    </div>
                </div>
            </div>`;
        host.appendChild(wrap);

        const input = wrap.querySelector('#porg_pattern');
        input.value = settings().pattern;
        input.addEventListener('input', () => {
            settings().pattern = input.value || DEFAULT_PATTERN;
            save();
            apply();
        });
        wrap.querySelector('#porg_pattern_reset').addEventListener('click', () => {
            input.value = DEFAULT_PATTERN;
            settings().pattern = DEFAULT_PATTERN;
            save();
            apply();
        });
    }

    /* ------------------------------------------------------------------ */
    /* Wiring                                                              */
    /* ------------------------------------------------------------------ */

    function watch() {
        const target = document.getElementById('completion_prompt_manager') || document.body;
        observer = new MutationObserver(() => {
            if (applying) return;
            // ST re-rendered the prompt list → re-decorate (debounced)
            clearTimeout(watch._t);
            watch._t = setTimeout(() => { apply(); addNavButtons(); }, 60);
        });
        observer.observe(target, { childList: true, subtree: true });
    }

    function init() {
        const { eventSource, event_types } = ctx();
        addSettingsDrawer();
        watch();
        apply();
        addNavButtons();
        // Preset switches and settings updates can rebuild the manager wholesale
        for (const ev of [event_types.OAI_PRESET_CHANGED_AFTER, event_types.SETTINGS_UPDATED, event_types.CHAT_CHANGED]) {
            if (ev) eventSource.on(ev, () => setTimeout(() => { apply(); addNavButtons(); }, 100));
        }
        console.log('[Preset Organizer] ready');
    }

    if (window.SillyTavern?.getContext) {
        const { eventSource, event_types } = ctx();
        eventSource.once(event_types.APP_READY, init);
        if (document.getElementById('extensionsMenu')) init();
    }
})();
