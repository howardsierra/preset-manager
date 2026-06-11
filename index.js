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
                    <hr>
                    <label class="checkbox_label">
                        <input id="porg_organize_ext" type="checkbox">
                        <span>Organize the Extensions panel (Context Lens style)</span>
                    </label>
                    <small>Categories, pinning, and search for extension drawers.
                    Refresh the page after turning this off.</small>
                    <label class="checkbox_label">
                        <input id="porg_organize_conn" type="checkbox">
                        <span>Connection panel overhaul (provider chips + model navigator)</span>
                    </label>
                    <small>Replaces the source dropdown with tappable chips and adds
                    a visual model browser. Toggle takes effect immediately.</small>
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

        const orgExt = wrap.querySelector('#porg_organize_ext');
        orgExt.checked = settings().organizeExtensions !== false;
        orgExt.addEventListener('change', () => {
            settings().organizeExtensions = orgExt.checked;
            save();
            if (typeof toastr !== 'undefined' && !orgExt.checked) {
                toastr.info('Refresh the page to restore the vanilla Extensions panel', 'Preset Organizer');
            }
        });

        const orgConn = wrap.querySelector('#porg_organize_conn');
        orgConn.checked = settings().organizeConnection !== false;
        orgConn.addEventListener('change', () => {
            settings().organizeConnection = orgConn.checked;
            save();
            if (!orgConn.checked) {
                // tear down immediately; the module rebuilds when re-enabled
                document.getElementById('porgc_chips')?.remove();
                document.getElementById('chat_completion_source')?.classList.remove('porgc-hide-native');
            }
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

/* ====================================================================== */
/* Extensions Panel Organizer (integrated, v1.3.0)                         */
/*                                                                         */
/* NemoPresetExt-style overhaul of the Extensions settings panel, styled   */
/* like Context Lens: solid navy category cards, gradient accent headers,  */
/* monogram tiles, count chips, sticky search toolbar.                     */
/*                                                                         */
/* Shares its saved data (pins/categories) with the standalone             */
/* "Extension Organizer" extension, and automatically stands down if the   */
/* standalone is detected, so running both never causes a fight.           */
/* ====================================================================== */

(() => {
    'use strict';

    const DATA = 'extensionOrganizer';     // shared with the standalone on purpose
    const HOST = 'presetOrganizer';        // master toggle lives with Preset Organizer

    const PALETTE = ['#6FB8FF', '#FF6B9D', '#FFB347', '#4ECDC4', '#A8E05F', '#8B7CFF', '#FF8C66', '#E07BE0'];
    const PINNED = '⭐ Pinned';
    const OTHER = 'Other';
    const HOSTS = ['extensions_settings', 'extensions_settings2'];

    const ctx = () => SillyTavern.getContext();

    function data() {
        const es = ctx().extensionSettings;
        es[DATA] = es[DATA] || {
            grouping: true, sortAlpha: false, pinned: [], cats: {},
            customCats: ['Roleplay', 'UI', 'Memory', 'Tools'], collapsed: {},
        };
        return es[DATA];
    }

    function hostEnabled() {
        const es = ctx().extensionSettings;
        es[HOST] = es[HOST] || {};
        return es[HOST].organizeExtensions !== false;
    }

    function save() { ctx().saveSettingsDebounced(); }

    function standaloneActive() {
        return !!document.getElementById('extorg_toolbar');
    }

    /* ---------------- drawer discovery ---------------- */

    const originalOrder = new Map();
    let orderCounter = 0;

    function drawerName(el) {
        return el.querySelector('.inline-drawer-header b, .inline-drawer-header')
            ?.textContent?.trim() ?? '';
    }

    function collectDrawers() {
        const found = [];
        const seen = new Set();
        const take = (child) => {
            if (child.id?.startsWith('porgx_')) return;
            if (!child.querySelector?.('.inline-drawer-header')) return;
            const name = drawerName(child);
            if (!name || seen.has(name)) return;
            seen.add(name);
            if (!originalOrder.has(name)) originalOrder.set(name, orderCounter++);
            found.push({ el: child, name });
        };
        for (const id of HOSTS) {
            const host = document.getElementById(id);
            if (host) [...host.children].forEach(take);
        }
        document.querySelectorAll('#porgx_shelf .porgx-cat-body > *').forEach(take);
        return found;
    }

    /* ---------------- category model ---------------- */

    const categoryOf = (name) => data().pinned.includes(name) ? PINNED : (data().cats[name] || OTHER);
    const categoryList = () => [PINNED, ...data().customCats, OTHER];
    function catColor(cat) {
        if (cat === PINNED) return '#FFD700';
        if (cat === OTHER) return '#7E8799';
        const i = data().customCats.indexOf(cat);
        return PALETTE[(i >= 0 ? i : 0) % PALETTE.length];
    }

    /* ---------------- apply ---------------- */

    let applying = false;
    let organizeMode = false;
    let query = '';

    function apply() {
        if (applying || !hostEnabled() || standaloneActive()) return;
        const host = document.getElementById(HOSTS[0]);
        if (!host) return;
        applying = true;
        try {
            ensureToolbar();
            let sh = document.getElementById('porgx_shelf');
            if (!sh) {
                sh = document.createElement('div');
                sh.id = 'porgx_shelf';
                host.appendChild(sh);
            }
            sh.classList.toggle('porgx-organize', organizeMode);

            const drawers = collectDrawers();
            const groups = new Map();
            for (const d of drawers) {
                const cat = categoryOf(d.name);
                if (!groups.has(cat)) groups.set(cat, []);
                groups.get(cat).push(d);
            }

            const s = data();
            for (const cat of categoryList()) {
                const members = groups.get(cat) || [];
                let section = sh.querySelector(`[data-porgx-cat="${CSS.escape(cat)}"]`);
                if (!members.length) { section?.remove(); continue; }

                if (!section) {
                    section = document.createElement('div');
                    section.className = 'porgx-cat';
                    section.dataset.porgxCat = cat;
                    section.innerHTML = `
                        <div class="porgx-cat-head">
                            <span class="porgx-mono"></span>
                            <span class="porgx-cat-name"></span>
                            <span class="porgx-cat-count"></span>
                            <span class="porgx-cat-caret fa-solid fa-chevron-down"></span>
                        </div>
                        <div class="porgx-cat-body"></div>`;
                    section.querySelector('.porgx-cat-head').addEventListener('click', () => {
                        data().collapsed[cat] = !data().collapsed[cat];
                        save();
                        apply();
                    });
                    sh.appendChild(section);
                }
                sh.appendChild(section);

                const accent = catColor(cat);
                section.style.setProperty('--porgx-accent', accent);
                section.querySelector('.porgx-mono').textContent =
                    cat === PINNED ? '⭐' : cat.slice(0, 1).toUpperCase();
                section.querySelector('.porgx-cat-name').textContent = cat;
                section.querySelector('.porgx-cat-count').textContent = members.length;
                const collapsed = !!s.collapsed[cat];
                section.classList.toggle('porgx-collapsed', collapsed);
                section.querySelector('.porgx-cat-caret').classList.toggle('porgx-rot', collapsed);

                members.sort((a, b) => s.sortAlpha
                    ? a.name.localeCompare(b.name)
                    : (originalOrder.get(a.name) ?? 0) - (originalOrder.get(b.name) ?? 0));

                const body = section.querySelector('.porgx-cat-body');
                for (const d of members) {
                    decorate(d);
                    body.appendChild(d.el);
                }
            }

            sh.querySelectorAll('.porgx-cat').forEach(sec => {
                if (!sec.querySelector('.porgx-cat-body > *')) sec.remove();
            });

            applySearch();
        } finally {
            requestAnimationFrame(() => { applying = false; });
        }
    }

    function decorate(d) {
        const header = d.el.querySelector('.inline-drawer-header');
        if (!header) return;
        let pin = header.querySelector('.porgx-pin');
        if (pin) {
            pin.classList.toggle('porgx-pinned', data().pinned.includes(d.name));
            const sel = header.querySelector('.porgx-cat-select');
            if (sel) sel.value = data().cats[d.name] || OTHER;
            return;
        }

        pin = document.createElement('span');
        pin.className = 'porgx-pin fa-solid fa-star';
        pin.title = 'Pin to top';
        pin.classList.toggle('porgx-pinned', data().pinned.includes(d.name));
        pin.addEventListener('click', (e) => {
            e.stopPropagation();
            const p = data().pinned;
            const i = p.indexOf(d.name);
            i >= 0 ? p.splice(i, 1) : p.push(d.name);
            save();
            apply();
        });

        const sel = document.createElement('select');
        sel.className = 'porgx-cat-select text_pole';
        sel.title = 'Assign category';
        rebuildSelect(sel, d.name);
        sel.addEventListener('click', e => e.stopPropagation());
        sel.addEventListener('change', (e) => {
            e.stopPropagation();
            const s = data();
            if (sel.value === '__new__') {
                const name = prompt('New category name:')?.trim();
                if (name && !s.customCats.includes(name) && name !== PINNED && name !== OTHER) {
                    s.customCats.push(name);
                    s.cats[d.name] = name;
                }
                rebuildSelect(sel, d.name);
            } else if (sel.value === OTHER) {
                delete s.cats[d.name];
            } else {
                s.cats[d.name] = sel.value;
            }
            save();
            apply();
        });

        header.appendChild(sel);
        header.appendChild(pin);
    }

    function rebuildSelect(sel, name) {
        const s = data();
        sel.innerHTML = [
            ...[...s.customCats, OTHER].map(c => `<option value="${c}">${c}</option>`),
            `<option value="__new__">+ New category…</option>`,
        ].join('');
        sel.value = s.cats[name] || OTHER;
    }

    /* ---------------- search ---------------- */

    function applySearch() {
        const sh = document.getElementById('porgx_shelf');
        if (!sh) return;
        const q = query.trim().toLowerCase();
        sh.querySelectorAll('.porgx-cat').forEach(sec => {
            let visible = 0;
            sec.querySelectorAll('.porgx-cat-body > *').forEach(el => {
                const match = !q || drawerName(el).toLowerCase().includes(q);
                el.classList.toggle('porgx-hide', !match);
                if (match) visible++;
            });
            sec.classList.toggle('porgx-hide', visible === 0);
            if (q && visible > 0) sec.classList.remove('porgx-collapsed');
            else if (!q) sec.classList.toggle('porgx-collapsed', !!data().collapsed[sec.dataset.porgxCat]);
        });
    }

    /* ---------------- toolbar ---------------- */

    function ensureToolbar() {
        const host = document.getElementById(HOSTS[0]);
        if (!host || document.getElementById('porgx_toolbar')) return;
        const bar = document.createElement('div');
        bar.id = 'porgx_toolbar';
        bar.innerHTML = `
            <i class="fa-solid fa-magnifying-glass porgx-tb-icon"></i>
            <input id="porgx_search" class="text_pole" type="text"
                   placeholder="Search extensions…" autocomplete="off">
            <i id="porgx_sort" class="fa-solid fa-arrow-down-a-z porgx-tb-btn"
               title="Toggle A–Z sorting"></i>
            <i id="porgx_mode" class="fa-solid fa-sliders porgx-tb-btn"
               title="Organize mode: show pin and category controls"></i>`;
        host.prepend(bar);

        const sortBtn = bar.querySelector('#porgx_sort');
        sortBtn.classList.toggle('porgx-on', data().sortAlpha);

        bar.querySelector('#porgx_search').addEventListener('input', (e) => {
            query = e.target.value;
            applySearch();
        });
        sortBtn.addEventListener('click', () => {
            data().sortAlpha = !data().sortAlpha;
            sortBtn.classList.toggle('porgx-on', data().sortAlpha);
            save();
            apply();
        });
        bar.querySelector('#porgx_mode').addEventListener('click', (e) => {
            organizeMode = !organizeMode;
            e.target.classList.toggle('porgx-on', organizeMode);
            document.getElementById('porgx_shelf')?.classList.toggle('porgx-organize', organizeMode);
        });
    }

    /* ---------------- wiring ---------------- */

    function watch() {
        for (const id of HOSTS) {
            const host = document.getElementById(id);
            if (!host) continue;
            new MutationObserver(() => {
                if (applying) return;
                clearTimeout(watch._t);
                watch._t = setTimeout(apply, 150);
            }).observe(host, { childList: true });
        }
    }

    function init() {
        // Delay past the standalone Extension Organizer's init (~800ms) so
        // detection is reliable, and past most extensions registering drawers.
        setTimeout(() => {
            if (standaloneActive()) {
                console.log('[Preset Organizer] standalone Extension Organizer detected — integrated panel organizer standing down');
                return;
            }
            apply();
            watch();
        }, 1300);
    }

    if (window.SillyTavern?.getContext) {
        const { eventSource, event_types } = ctx();
        eventSource.once(event_types.APP_READY, init);
        if (document.getElementById('extensionsMenu')) init();
    }
})();

/* ====================================================================== */
/* Quick Lorebook Access (v1.4.0)                                          */
/*                                                                         */
/* A compact, mobile-friendly lorebook bar inside the prompt manager:      */
/* tap chips to toggle global lorebooks without leaving the panel.         */
/* If LoreLink is installed, shows the current character's profile status  */
/* (match / mismatch) with a one-tap Sync button.                          */
/* ====================================================================== */

(() => {
    'use strict';

    const HOST = 'presetOrganizer';
    const ctx = () => SillyTavern.getContext();

    function hostSettings() {
        const es = ctx().extensionSettings;
        es[HOST] = es[HOST] || {};
        if (typeof es[HOST].quickLoreOpen !== 'boolean') es[HOST].quickLoreOpen = false;
        return es[HOST];
    }

    function save() { ctx().saveSettingsDebounced(); }

    /* ---------------- world info plumbing (same canonical path LoreLink uses) */

    const worldSelect = () => document.getElementById('world_info');

    function allWorlds() {
        const sel = worldSelect();
        return sel ? [...sel.options].map(o => o.textContent.trim()).filter(Boolean) : [];
    }

    function activeWorlds() {
        const sel = worldSelect();
        return sel ? [...sel.selectedOptions].map(o => o.textContent.trim()) : [];
    }

    function setActiveWorlds(names) {
        const sel = worldSelect();
        if (!sel) return;
        const want = new Set(names);
        for (const o of sel.options) o.selected = want.has(o.textContent.trim());
        if (window.jQuery) jQuery(sel).trigger('change');
        else sel.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function toggleWorld(name) {
        const act = activeWorlds();
        const i = act.indexOf(name);
        i >= 0 ? act.splice(i, 1) : act.push(name);
        setActiveWorlds(act);
    }

    /* ---------------- LoreLink integration (soft dependency) */

    function charKey() {
        const c = ctx();
        if (c.groupId) return `group:${c.groupId}`;
        const ch = c.characters?.[c.characterId];
        return ch ? `char:${ch.avatar || ch.name}` : null;
    }

    /** @returns {null | {books: string[], mismatch: boolean, mode: string}} */
    function loreLinkProfile() {
        const ll = ctx().extensionSettings?.loreLink;
        if (!ll?.profiles) return null;              // LoreLink not installed
        const key = charKey();
        const profile = key ? ll.profiles[key] : null;
        if (!Array.isArray(profile)) return null;    // no profile for this character
        const existing = new Set(allWorlds());
        const books = profile.filter(w => existing.has(w));
        const active = activeWorlds();
        const mode = ll.mode === 'additive' ? 'additive' : 'strict';
        const mismatch = mode === 'additive'
            ? books.some(w => !active.includes(w))
            : (books.length !== active.length || books.some(w => !active.includes(w)));
        return { books, mismatch, mode };
    }

    function syncToProfile() {
        const p = loreLinkProfile();
        if (!p) return;
        setActiveWorlds(p.mode === 'additive'
            ? [...new Set([...activeWorlds(), ...p.books])]
            : p.books);
        render();
    }

    /* ---------------- UI */

    function ensureBar() {
        const list = document.getElementById('completion_prompt_manager_list');
        if (!list || document.getElementById('porgl_bar')) return;
        const bar = document.createElement('div');
        bar.id = 'porgl_bar';
        bar.innerHTML = `
            <div class="porgl-head">
                <i class="fa-solid fa-book-atlas porgl-icon"></i>
                <span class="porgl-title">Lorebooks</span>
                <span class="porgl-count"></span>
                <span class="porgl-status"></span>
                <span class="porgl-sync menu_button porgl-hidden">
                    <i class="fa-solid fa-rotate"></i> Sync
                </span>
                <span class="porgl-caret fa-solid fa-chevron-down"></span>
            </div>
            <div class="porgl-chips"></div>`;
        list.parentElement.insertBefore(bar, list);

        bar.querySelector('.porgl-head').addEventListener('click', (e) => {
            if (e.target.closest('.porgl-sync')) return;
            const s = hostSettings();
            s.quickLoreOpen = !s.quickLoreOpen;
            save();
            render();
        });
        bar.querySelector('.porgl-sync').addEventListener('click', (e) => {
            e.stopPropagation();
            syncToProfile();
        });

        render();
    }

    function render() {
        const bar = document.getElementById('porgl_bar');
        if (!bar) return;
        const open = hostSettings().quickLoreOpen;
        const active = new Set(activeWorlds());
        const profile = loreLinkProfile();

        bar.classList.toggle('porgl-open', open);
        bar.querySelector('.porgl-caret').classList.toggle('porgl-rot', !open);
        bar.querySelector('.porgl-count').textContent = `${active.size} active`;

        /* LoreLink status pill */
        const status = bar.querySelector('.porgl-status');
        const sync = bar.querySelector('.porgl-sync');
        if (profile) {
            status.textContent = profile.mismatch ? 'profile mismatch' : 'profile ✓';
            status.className = `porgl-status ${profile.mismatch ? 'warn' : 'ok'}`;
            sync.classList.toggle('porgl-hidden', !profile.mismatch);
        } else {
            status.textContent = '';
            status.className = 'porgl-status';
            sync.classList.add('porgl-hidden');
        }

        /* chips */
        const chips = bar.querySelector('.porgl-chips');
        chips.innerHTML = '';
        if (!open) return;
        const worlds = allWorlds();
        if (!worlds.length) {
            chips.innerHTML = '<span class="porgl-empty">No lorebooks yet.</span>';
            return;
        }
        const inProfile = new Set(profile?.books ?? []);
        for (const w of worlds) {
            const chip = document.createElement('span');
            chip.className = 'porgl-chip'
                + (active.has(w) ? ' porgl-on' : '')
                + (inProfile.has(w) ? ' porgl-profiled' : '');
            chip.textContent = w;
            chip.title = (active.has(w) ? 'Active — tap to disable' : 'Inactive — tap to enable')
                + (inProfile.has(w) ? ' · in this character\'s LoreLink profile' : '');
            chip.addEventListener('click', () => { toggleWorld(w); render(); });
            chips.appendChild(chip);
        }
    }

    /* ---------------- wiring */

    function init() {
        const { eventSource, event_types } = ctx();

        // The prompt manager re-renders constantly; recreate/refresh the bar
        const target = document.getElementById('completion_prompt_manager') || document.body;
        new MutationObserver(() => {
            clearTimeout(init._t);
            init._t = setTimeout(() => { ensureBar(); render(); }, 100);
        }).observe(target, { childList: true, subtree: true });

        const sel = worldSelect();
        if (sel) sel.addEventListener('change', () => setTimeout(render, 50));

        eventSource.on(event_types.CHAT_CHANGED, () => setTimeout(render, 250));

        ensureBar();
    }

    if (window.SillyTavern?.getContext) {
        const { eventSource, event_types } = ctx();
        eventSource.once(event_types.APP_READY, init);
        if (document.getElementById('extensionsMenu')) init();
    }
})();

/* ====================================================================== */
/* Connection Panel Overhaul (v1.5.0)                                      */
/*                                                                         */
/* NemoPresetExt-style connection UI, mobile-first:                        */
/*  - Provider chips: a horizontally-scrollable chip row replaces the      */
/*    Chat Completion Source dropdown (tap to switch; ⤺ restores native)   */
/*  - Model Navigator: a grid icon next to every model dropdown opens a    */
/*    searchable card grid with per-source favorites — same modal as the   */
/*    Preset Navigator                                                     */
/* ====================================================================== */

(() => {
    'use strict';

    const HOST = 'presetOrganizer';
    const PALETTE = ['#8B7CFF', '#FF6B9D', '#FFB347', '#4ECDC4', '#A8E05F', '#FF8C66', '#6FB8FF', '#E07BE0'];

    const ctx = () => SillyTavern.getContext();

    function hs() {
        const es = ctx().extensionSettings;
        es[HOST] = es[HOST] || {};
        if (!es[HOST].modelFavs) es[HOST].modelFavs = {};
        return es[HOST];
    }

    const save = () => ctx().saveSettingsDebounced();
    const enabled = () => hs().organizeConnection !== false;

    const sourceSelect = () => document.getElementById('chat_completion_source');

    function fire(sel) {
        if (window.jQuery) jQuery(sel).trigger('change');
        else sel.dispatchEvent(new Event('change', { bubbles: true }));
    }

    /* ---------------- provider chips ---------------- */

    function buildChips() {
        const sel = sourceSelect();
        if (!sel) return;

        if (!enabled()) {
            document.getElementById('porgc_chips')?.remove();
            sel.classList.remove('porgc-hide-native');
            return;
        }

        let row = document.getElementById('porgc_chips');
        if (!row) {
            row = document.createElement('div');
            row.id = 'porgc_chips';
            sel.insertAdjacentElement('beforebegin', row);
        }
        sel.classList.add('porgc-hide-native');

        const current = sel.value;
        row.innerHTML = '';
        [...sel.options].forEach((o, i) => {
            const chip = document.createElement('span');
            chip.className = 'porgc-chip' + (o.value === current ? ' porgc-active' : '');
            chip.style.setProperty('--porg-accent', PALETTE[i % PALETTE.length]);
            chip.textContent = o.textContent.trim();
            chip.title = `Switch source to ${o.textContent.trim()}`;
            chip.addEventListener('click', () => {
                if (sel.value === o.value) return;
                sel.value = o.value;
                fire(sel);
                buildChips();
            });
            row.appendChild(chip);
        });

        const revert = document.createElement('span');
        revert.className = 'porgc-chip porgc-revert fa-solid fa-arrow-rotate-left';
        revert.title = 'Restore the native dropdown';
        revert.addEventListener('click', () => {
            hs().organizeConnection = false;
            save();
            buildChips();
            const cb = document.getElementById('porg_organize_conn');
            if (cb) cb.checked = false;
        });
        row.appendChild(revert);

        // keep the active chip in view on narrow screens
        row.querySelector('.porgc-active')?.scrollIntoView?.({ inline: 'center', block: 'nearest' });
    }

    /* ---------------- model navigator ---------------- */

    function favBucket(selectId) {
        const f = hs().modelFavs;
        f[selectId] = f[selectId] || [];
        return f[selectId];
    }

    function addModelButtons() {
        if (!enabled()) return;
        document.querySelectorAll('select[id^="model_"]').forEach(sel => {
            if (document.getElementById(`porgc_btn_${sel.id}`)) return;
            const btn = document.createElement('i');
            btn.id = `porgc_btn_${sel.id}`;
            btn.className = 'fa-solid fa-table-cells-large porg-nav-btn interactable';
            btn.title = 'Browse models visually';
            btn.tabIndex = 0;
            sel.insertAdjacentElement('afterend', btn);
            btn.addEventListener('click', () => openModelNav(sel));
        });
    }

    function closeNav() {
        document.getElementById('porg_nav')?.remove();
        document.removeEventListener('keydown', esc);
    }
    function esc(e) { if (e.key === 'Escape') closeNav(); }

    function openModelNav(sel) {
        closeNav();
        const current = sel.selectedOptions[0]?.textContent.trim();
        const overlay = document.createElement('div');
        overlay.id = 'porg_nav';
        overlay.innerHTML = `
            <div class="porg-nav-modal">
                <div class="porg-nav-head">
                    <i class="fa-solid fa-microchip"></i>
                    <b>Models</b>
                    <input id="porg_nav_search" class="text_pole" type="text"
                           placeholder="Search models…" autocomplete="off">
                    <span class="porg-nav-close" title="Close">×</span>
                </div>
                <div class="porg-nav-grid"></div>
            </div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) closeNav(); });
        overlay.querySelector('.porg-nav-close').addEventListener('click', closeNav);
        document.addEventListener('keydown', esc);

        const grid = overlay.querySelector('.porg-nav-grid');

        function renderGrid(filter = '') {
            const favs = new Set(favBucket(sel.id));
            const q = filter.trim().toLowerCase();
            const names = [...sel.options].map(o => o.textContent.trim())
                .filter(n => n && (!q || n.toLowerCase().includes(q)))
                .sort((a, b) => (favs.has(b) - favs.has(a)) || a.localeCompare(b));

            grid.innerHTML = names.length ? '' : '<div class="porg-nav-empty">No models match.</div>';
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
                card.title = name === current ? `${name} (current)` : `Switch to ${name}`;

                card.querySelector('.porg-nav-fav').addEventListener('click', (e) => {
                    e.stopPropagation();
                    const f = favBucket(sel.id);
                    const idx = f.indexOf(name);
                    idx >= 0 ? f.splice(idx, 1) : f.push(name);
                    save();
                    renderGrid(filter);
                });

                card.addEventListener('click', () => {
                    const opt = [...sel.options].find(o => o.textContent.trim() === name);
                    if (opt) { sel.value = opt.value; fire(sel); }
                    closeNav();
                });
                grid.appendChild(card);
            });
        }

        renderGrid();
        const search = overlay.querySelector('#porg_nav_search');
        search.addEventListener('input', () => renderGrid(search.value));
        search.focus();
    }

    /* ---------------- wiring ---------------- */

    function syncAll() {
        try { buildChips(); } catch (e) { console.error('[Preset Organizer] provider chips:', e); }
        try { addModelButtons(); } catch (e) { console.error('[Preset Organizer] model navigator:', e); }
    }

    function init() {
        const { eventSource, event_types } = ctx();
        syncAll();
        eventSource.on(event_types.SETTINGS_UPDATED, () => setTimeout(syncAll, 100));
        // Model selects get repopulated when sources/keys change
        const target = sourceSelect()?.closest('form') || document.body;
        new MutationObserver(() => {
            clearTimeout(init._t);
            init._t = setTimeout(syncAll, 200);
        }).observe(target, { childList: true, subtree: true });
    }

    if (window.SillyTavern?.getContext) {
        const { eventSource, event_types } = ctx();
        eventSource.once(event_types.APP_READY, init);
        if (document.getElementById('extensionsMenu')) init();
    }
})();

/* ====================================================================== */
/* Custom Proxy Manager (v1.6.0)                                           */
/*                                                                         */
/* Save multiple custom OpenAI-compatible endpoints and switch with a tap. */
/* A horizontal card row appears under the source selector whenever the    */
/* "custom" chat completion source is active. Applying a card fills the    */
/* endpoint URL + API key and auto-clicks Connect to fetch its models      */
/* (same mechanism NemoPresetExt uses).                                    */
/*                                                                         */
/* ⚠ Keys are stored in SillyTavern's settings in plaintext — identical    */
/* to NemoPresetExt and ST's own reverse-proxy presets. Don't use this on  */
/* a shared/hosted ST instance you don't trust.                            */
/* ====================================================================== */

(() => {
    'use strict';

    const HOST = 'presetOrganizer';
    const ctx = () => SillyTavern.getContext();

    function hs() {
        const es = ctx().extensionSettings;
        es[HOST] = es[HOST] || {};
        if (!Array.isArray(es[HOST].customProxies)) es[HOST].customProxies = [];
        return es[HOST];
    }

    const proxies = () => hs().customProxies;
    const save = () => ctx().saveSettingsDebounced();
    const uid = () => 'pxy_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

    const sourceSelect = () => document.getElementById('chat_completion_source');
    const isCustom = () => sourceSelect()?.value === 'custom';

    /* ---------------- applying a proxy ---------------- */

    function fireInput(el) {
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function applyProxy(p) {
        const url = document.getElementById('custom_api_url_text');
        if (url) { url.value = p.url; fireInput(url); }

        const key = document.getElementById('api_key_custom');
        if (key && p.key) { key.value = p.key; fireInput(key); }

        for (const q of proxies()) q.active = (q.id === p.id);
        save();
        render();

        // let ST persist the fields, then connect to fetch this endpoint's models
        setTimeout(() => document.getElementById('api_button_openai')?.click?.(), 300);
        if (typeof toastr !== 'undefined') toastr.info(p.url, `Connecting: ${p.name}`, { timeOut: 3000 });
    }

    /* ---------------- UI ---------------- */

    let formOpenFor = null; // null = closed, '' = new, id = editing

    function ensureRow() {
        const sel = sourceSelect();
        if (!sel) return null;
        let wrap = document.getElementById('porgp_wrap');
        if (!wrap) {
            wrap = document.createElement('div');
            wrap.id = 'porgp_wrap';
            wrap.innerHTML = `
                <div class="porgp-label"><i class="fa-solid fa-server"></i> Saved proxies</div>
                <div class="porgp-row" id="porgp_row"></div>
                <div class="porgp-form porgp-hidden" id="porgp_form">
                    <input id="porgp_name" class="text_pole" type="text" placeholder="Name (e.g. My proxy)">
                    <input id="porgp_url" class="text_pole" type="text" placeholder="Endpoint URL (…/v1)">
                    <input id="porgp_key" class="text_pole" type="password" placeholder="API key (optional, stored in plaintext)">
                    <div class="porgp-form-btns">
                        <div class="menu_button" id="porgp_save"><i class="fa-solid fa-check"></i> Save</div>
                        <div class="menu_button" id="porgp_cancel">Cancel</div>
                    </div>
                </div>`;
            // place right after the provider chips row when present, else after the select
            const anchor = document.getElementById('porgc_chips') || sel;
            anchor.insertAdjacentElement('afterend', wrap);

            wrap.querySelector('#porgp_save').addEventListener('click', () => {
                const name = wrap.querySelector('#porgp_name').value.trim();
                const url = wrap.querySelector('#porgp_url').value.trim();
                const key = wrap.querySelector('#porgp_key').value;
                if (!name || !url) {
                    if (typeof toastr !== 'undefined') toastr.warning('Name and URL are required', 'Proxy Manager');
                    return;
                }
                if (formOpenFor) {
                    const p = proxies().find(p => p.id === formOpenFor);
                    if (p) Object.assign(p, { name, url, key });
                } else {
                    proxies().push({ id: uid(), name, url, key, active: false });
                }
                formOpenFor = null;
                save();
                render();
            });
            wrap.querySelector('#porgp_cancel').addEventListener('click', () => {
                formOpenFor = null;
                render();
            });
        }
        return wrap;
    }

    function openForm(id) {
        formOpenFor = id ?? '';
        const wrap = document.getElementById('porgp_wrap');
        const p = id ? proxies().find(p => p.id === id) : null;
        wrap.querySelector('#porgp_name').value = p?.name ?? '';
        wrap.querySelector('#porgp_url').value = p?.url ?? '';
        wrap.querySelector('#porgp_key').value = p?.key ?? '';
        wrap.querySelector('#porgp_form').classList.remove('porgp-hidden');
        wrap.querySelector('#porgp_name').focus();
    }

    function render() {
        const wrap = ensureRow();
        if (!wrap) return;
        wrap.classList.toggle('porgp-hidden', !isCustom());
        if (!isCustom()) return;

        wrap.querySelector('#porgp_form').classList.toggle('porgp-hidden', formOpenFor === null);

        const row = wrap.querySelector('#porgp_row');
        row.innerHTML = '';
        for (const p of proxies()) {
            const card = document.createElement('div');
            card.className = 'porgp-card' + (p.active ? ' porgp-active' : '');
            card.innerHTML = `
                <span class="porgp-dot"></span>
                <span class="porgp-name"></span>
                <span class="porgp-url"></span>
                <span class="porgp-actions">
                    <i class="fa-solid fa-pencil porgp-edit" title="Edit"></i>
                    <i class="fa-solid fa-trash-can porgp-del" title="Delete"></i>
                </span>`;
            card.querySelector('.porgp-name').textContent = p.name;
            card.querySelector('.porgp-url').textContent = p.url.replace(/^https?:\/\//, '');
            card.title = p.active ? `${p.name} (connected)` : `Tap to connect to ${p.name}`;

            card.addEventListener('click', () => applyProxy(p));
            card.querySelector('.porgp-edit').addEventListener('click', (e) => {
                e.stopPropagation();
                openForm(p.id);
            });
            card.querySelector('.porgp-del').addEventListener('click', (e) => {
                e.stopPropagation();
                if (typeof window.confirm === 'function' && !window.confirm(`Delete proxy "${p.name}"?`)) return;
                hs().customProxies = proxies().filter(q => q.id !== p.id);
                save();
                render();
            });
            row.appendChild(card);
        }

        /* add-new card */
        const add = document.createElement('div');
        add.className = 'porgp-card porgp-add';
        add.innerHTML = `<i class="fa-solid fa-plus"></i><span>Add proxy</span>`;
        add.addEventListener('click', () => openForm(null));
        row.appendChild(add);
    }

    /* ---------------- wiring ---------------- */

    function init() {
        const { eventSource, event_types } = ctx();
        render();
        const sel = sourceSelect();
        if (sel) sel.addEventListener('change', () => setTimeout(render, 100));
        eventSource.on(event_types.SETTINGS_UPDATED, () => setTimeout(render, 150));
        const target = sel?.closest('form') || document.body;
        new MutationObserver(() => {
            clearTimeout(init._t);
            init._t = setTimeout(render, 250);
        }).observe(target, { childList: true, subtree: true });
    }

    if (window.SillyTavern?.getContext) {
        const { eventSource, event_types } = ctx();
        eventSource.once(event_types.APP_READY, init);
        if (document.getElementById('extensionsMenu')) init();
    }
})();
