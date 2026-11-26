/**
 * Hokkaido + Tokyo 2027 — Rate Research & Audit Dashboard Module
 * Self-contained View 2 renderer (KPIs, Furano Chart.js Seasonality,
 * Channel Savings Benchmarks, Searchable/Sortable Explorer & CSV Export).
 */
(function (global) {
  'use strict';

  const EXCLUDED_FLAGS = new Set([
    'eco_no_clean',
    'non_refundable',
    'barrier_free',
    'bunk_bed',
    'annex',
    'smoking_room',
  ]);

  const FURANO_AUDIT_DATES = [
    '2027-04-10',
    '2027-05-08',
    '2027-05-15',
    '2027-05-22',
    '2027-06-12',
    '2027-09-11',
    '2027-10-16',
  ];

  const AUDIT_HTML_TEMPLATE = `
    <section id="audit-fx-bar" class="rounded-2xl bg-sand/70 border border-stoneLine p-4 sm:p-5 scroll-mt-20">
      <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <p class="text-[11px] uppercase tracking-[0.14em] text-maple font-semibold">2027 Hotel Pricing Audit · Full Dataset</p>
          <h2 class="font-serif text-2xl sm:text-3xl font-medium text-ink mt-0.5 leading-snug">Rate Research &amp; Channel Audit</h2>
          <p id="audit-meta-subtitle" class="text-xs sm:text-[13px] text-inkSoft mt-1 leading-relaxed">
            Every scraped quote across official hotel sites and OTAs, displayed neutrally by room, occupancy, and channel.
          </p>
        </div>

        <div class="flex flex-col sm:flex-row sm:items-center gap-2.5 shrink-0">
          <div class="inline-flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-stoneLine self-start sm:self-auto">
            <label for="audit-fx-input" class="text-xs font-medium text-inkSoft whitespace-nowrap">Live FX · 1 SGD =</label>
            <input type="text" id="audit-fx-input" value="123.92" inputmode="decimal" autocomplete="off" class="w-20 text-sm font-semibold text-ink text-right bg-transparent focus:outline-none tabular-nums" />
            <span class="text-xs font-medium text-inkMuted whitespace-nowrap">JPY</span>
          </div>
          <div class="flex flex-wrap items-center gap-1.5">
            <button type="button" data-fx="110" class="audit-fx-preset-btn px-2.5 py-1 rounded-lg text-xs font-medium border bg-white text-inkSoft border-stoneLine transition-colors cursor-pointer tabular-nums whitespace-nowrap">¥110</button>
            <button type="button" data-fx="115" class="audit-fx-preset-btn px-2.5 py-1 rounded-lg text-xs font-medium border bg-white text-inkSoft border-stoneLine transition-colors cursor-pointer tabular-nums whitespace-nowrap">¥115</button>
            <button type="button" data-fx="123.92" class="audit-fx-preset-btn px-2.5 py-1 rounded-lg text-xs font-semibold border bg-pine text-white border-pine transition-colors cursor-pointer tabular-nums whitespace-nowrap">¥123.92</button>
            <button type="button" data-fx="130" class="audit-fx-preset-btn px-2.5 py-1 rounded-lg text-xs font-medium border bg-white text-inkSoft border-stoneLine transition-colors cursor-pointer tabular-nums whitespace-nowrap">¥130</button>
          </div>
        </div>
      </div>
    </section>

    <div id="audit-loading" class="rounded-2xl bg-white border border-stoneLine p-10 text-center space-y-3">
      <div class="inline-flex items-center justify-center w-10 h-10 rounded-full bg-sand border border-stoneLine">
        <svg class="w-5 h-5 text-pine animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3"></circle>
          <path class="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
        </svg>
      </div>
      <h3 class="font-serif text-xl font-medium text-ink">Fetching 2027 rate audit database…</h3>
      <p class="text-xs text-inkSoft max-w-md mx-auto">Loading all scraped quotes, seasonality benchmarks, and channel comparisons automatically.</p>
    </div>

    <div id="audit-error" class="hidden rounded-2xl bg-amberWarm-light/70 border border-amberWarm-border p-6 sm:p-8 text-center space-y-3">
      <p class="text-[11px] uppercase tracking-[0.14em] font-semibold text-amberWarm">Unable to Fetch Rate Dataset</p>
      <h3 class="font-serif text-xl font-medium text-ink">Could not reach the audit JSON right now</h3>
      <p id="audit-error-detail" class="text-xs text-inkSoft max-w-lg mx-auto"></p>
      <div class="pt-1">
        <button type="button" id="audit-retry-btn" class="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-pine hover:bg-pine-dark text-white transition-colors cursor-pointer">↻ Retry Fetch</button>
      </div>
    </div>

    <div id="audit-content" class="hidden space-y-8">
      <section aria-labelledby="audit-kpi-heading" class="space-y-4">
        <h3 id="audit-kpi-heading" class="sr-only">Audit Overview KPIs</h3>
        <div id="audit-kpi-grid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5"></div>
        <div class="rounded-2xl bg-white border border-stoneLine p-5 sm:p-6 shadow-[0_1px_10px_rgba(30,33,31,0.03)]">
          <div class="text-[11px] uppercase tracking-[0.14em] font-semibold text-maple mb-3">Booking Playbook &amp; Scarcity Notes</div>
          <div id="audit-playbook-grid" class="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs text-inkSoft leading-relaxed"></div>
        </div>
      </section>

      <section aria-labelledby="furano-chart-heading" class="rounded-2xl bg-white border border-stoneLine p-5 sm:p-6 shadow-[0_1px_12px_rgba(30,33,31,0.04)]">
        <div class="flex flex-col md:flex-row md:items-end justify-between gap-3 mb-4">
          <div>
            <p class="text-[11px] uppercase tracking-[0.14em] text-maple font-semibold">Section 2 · Stop 2 Seasonality Check</p>
            <h3 id="furano-chart-heading" class="font-serif text-xl sm:text-2xl font-medium text-ink mt-0.5 leading-snug">Furano 2027 Seasonality: La Vista vs. Natulux</h3>
            <p class="text-xs text-inkSoft mt-1 leading-relaxed">Lowest valid 2-night room total across 2027 check-in dates (excludes eco/no-clean, barrier-free, annex &amp; sold-out rows). Falls back to JAPANiCAN when Official dates aren’t open yet.</p>
          </div>
          <div class="inline-flex p-1 rounded-xl bg-sand border border-stoneLine self-start md:self-auto shrink-0" role="tablist" aria-label="Furano chart room view">
            <button type="button" data-furano-view="3p_BF" class="furano-view-btn px-3 py-1.5 rounded-lg text-xs font-semibold bg-white text-ink shadow-xs transition-colors cursor-pointer whitespace-nowrap">3-Pax Room (BF)</button>
            <button type="button" data-furano-view="2p_BF" class="furano-view-btn px-3 py-1.5 rounded-lg text-xs font-medium text-inkSoft hover:text-ink transition-colors cursor-pointer whitespace-nowrap">2-Pax Twin (BF)</button>
            <button type="button" data-furano-view="2p_RO" class="furano-view-btn px-3 py-1.5 rounded-lg text-xs font-medium text-inkSoft hover:text-ink transition-colors cursor-pointer whitespace-nowrap">2-Pax Twin (RO)</button>
          </div>
        </div>
        <div class="relative w-full h-[290px] sm:h-[350px] bg-paper/60 rounded-xl border border-stoneLine/70 p-3 sm:p-4">
          <canvas id="furano-seasonality-canvas" aria-label="Furano 2027 Seasonality Comparison Chart"></canvas>
        </div>
        <div id="furano-chart-summary" class="mt-3.5 grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs"></div>
      </section>

      <section aria-labelledby="channel-savings-heading" class="rounded-2xl bg-white border border-stoneLine p-5 sm:p-6 shadow-[0_1px_12px_rgba(30,33,31,0.04)]">
        <div class="mb-4">
          <p class="text-[11px] uppercase tracking-[0.14em] text-maple font-semibold">Section 3 · Direct vs. OTA Benchmarks</p>
          <h3 id="channel-savings-heading" class="font-serif text-xl sm:text-2xl font-medium text-ink mt-0.5 leading-snug">Channel &amp; Free-Member Savings</h3>
          <p class="text-xs text-inkSoft mt-1 leading-relaxed">Comparing Official Free Member vs. Official Public Regular vs. JAPANiCAN vs. Booking.com for representative active rooms (total room stay in live SGD).</p>
        </div>
        <div id="channel-savings-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5"></div>
      </section>

      <section aria-labelledby="explorer-heading" class="rounded-2xl bg-white border border-stoneLine shadow-[0_1px_12px_rgba(30,33,31,0.04)] overflow-hidden">
        <div class="p-5 sm:p-6 border-b border-stoneLine bg-paper/60 space-y-4">
          <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div>
              <p class="text-[11px] uppercase tracking-[0.14em] text-maple font-semibold">Section 4 · Full Rate Explorer</p>
              <h3 id="explorer-heading" class="font-serif text-xl sm:text-2xl font-medium text-ink mt-0.5 leading-snug">All Audited Quotes</h3>
              <p class="text-xs text-inkSoft mt-0.5">Click any column header to sort. All SGD figures recalculate live with the exchange rate above.</p>
            </div>
            <button type="button" id="audit-export-csv-btn" class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium bg-pine hover:bg-pine-dark text-white transition-colors self-start sm:self-auto shrink-0 cursor-pointer">
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span>Export Filtered CSV</span>
            </button>
          </div>

          <div class="space-y-2.5">
            <div class="relative">
              <input type="search" id="audit-search-input" placeholder="Search hotel, room name, plan name, or notes…" class="w-full pl-9 pr-3.5 py-2 rounded-xl bg-white border border-stoneLine text-xs sm:text-[13px] text-ink placeholder:text-inkMuted focus:outline-none focus:ring-2 focus:ring-pine" />
              <svg class="w-4 h-4 text-inkMuted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
              </svg>
            </div>

            <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              <select id="audit-filter-stop" aria-label="Filter by stop" class="px-2.5 py-2 rounded-xl bg-white border border-stoneLine text-xs text-ink focus:outline-none focus:ring-2 focus:ring-pine"><option value="ALL">All Stops (1–7)</option></select>
              <select id="audit-filter-hotel" aria-label="Filter by hotel" class="px-2.5 py-2 rounded-xl bg-white border border-stoneLine text-xs text-ink focus:outline-none focus:ring-2 focus:ring-pine"><option value="ALL">All Hotels</option></select>
              <select id="audit-filter-pax" aria-label="Filter by occupancy" class="px-2.5 py-2 rounded-xl bg-white border border-stoneLine text-xs text-ink focus:outline-none focus:ring-2 focus:ring-pine"><option value="ALL">All Occupancy</option></select>
              <select id="audit-filter-meal" aria-label="Filter by meal plan" class="px-2.5 py-2 rounded-xl bg-white border border-stoneLine text-xs text-ink focus:outline-none focus:ring-2 focus:ring-pine"><option value="ALL">All Meals</option></select>
              <select id="audit-filter-channel" aria-label="Filter by booking channel" class="px-2.5 py-2 rounded-xl bg-white border border-stoneLine text-xs text-ink focus:outline-none focus:ring-2 focus:ring-pine"><option value="ALL">All Channels</option></select>
              <select id="audit-filter-checkin" aria-label="Filter by check-in date" class="px-2.5 py-2 rounded-xl bg-white border border-stoneLine text-xs text-ink focus:outline-none focus:ring-2 focus:ring-pine"><option value="ALL">All Check-ins</option></select>
            </div>

            <div class="flex flex-wrap items-center gap-2 pt-0.5">
              <button type="button" id="chip-active-only" class="px-3 py-1.5 rounded-full text-xs font-medium border bg-white text-inkSoft border-stoneLine transition-colors cursor-pointer">Active in Picker Only</button>
              <button type="button" id="chip-live-oct" class="px-3 py-1.5 rounded-full text-xs font-medium border bg-white text-inkSoft border-stoneLine transition-colors cursor-pointer">Live Oct 2027 Only</button>
              <button type="button" id="chip-hide-excluded" class="px-3 py-1.5 rounded-full text-xs font-semibold border bg-pine text-white border-pine transition-colors cursor-pointer">Hide Excluded &amp; Sold Out</button>
              <button type="button" id="audit-reset-filters-btn" class="ml-auto px-3 py-1.5 rounded-full text-xs font-medium text-inkSoft hover:text-ink hover:bg-white border border-transparent hover:border-stoneLine transition-colors cursor-pointer">Reset Filters</button>
            </div>
          </div>
        </div>

        <div class="px-5 sm:px-6 py-2.5 bg-sand/45 border-b border-stoneLine flex flex-wrap items-center justify-between gap-2 text-xs text-inkSoft">
          <span id="audit-match-count" class="font-medium text-ink tabular-nums">Showing 0 quotes</span>
          <span class="text-[11px] text-inkMuted">Total room prices shown neutrally · no parents’ room labels</span>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse min-w-[980px]">
            <thead>
              <tr class="bg-paper border-b border-stoneLine text-[10.5px] uppercase tracking-[0.1em] text-inkMuted font-semibold select-none">
                <th data-sort-key="stop_id" class="audit-sort-th px-4 py-3 cursor-pointer hover:text-ink whitespace-nowrap">Stop &amp; Hotel <span class="sort-ind"></span></th>
                <th data-sort-key="room_name" class="audit-sort-th px-3 py-3 cursor-pointer hover:text-ink whitespace-nowrap">Room &amp; Size <span class="sort-ind"></span></th>
                <th data-sort-key="occupancy_pax" class="audit-sort-th px-3 py-3 cursor-pointer hover:text-ink whitespace-nowrap">Pax <span class="sort-ind"></span></th>
                <th data-sort-key="checkin" class="audit-sort-th px-3 py-3 cursor-pointer hover:text-ink whitespace-nowrap">Check-in <span class="sort-ind"></span></th>
                <th data-sort-key="channel" class="audit-sort-th px-3 py-3 cursor-pointer hover:text-ink whitespace-nowrap">Channel &amp; Tier <span class="sort-ind"></span></th>
                <th data-sort-key="meal_plan" class="audit-sort-th px-3 py-3 cursor-pointer hover:text-ink whitespace-nowrap">Meal <span class="sort-ind"></span></th>
                <th data-sort-key="total_room_jpy" class="audit-sort-th px-3 py-3 cursor-pointer hover:text-ink text-right whitespace-nowrap">Room Total <span class="sort-ind"></span></th>
                <th data-sort-key="per_night_jpy" class="audit-sort-th px-3 py-3 cursor-pointer hover:text-ink text-right whitespace-nowrap">Per Night <span class="sort-ind"></span></th>
                <th data-sort-key="flags" class="audit-sort-th px-3 py-3 cursor-pointer hover:text-ink whitespace-nowrap">Flags &amp; Status <span class="sort-ind"></span></th>
                <th class="px-4 py-3 text-right whitespace-nowrap">Link</th>
              </tr>
            </thead>
            <tbody id="audit-table-body" class="divide-y divide-stoneLine/70 text-xs"></tbody>
          </table>
        </div>

        <div class="px-5 sm:px-6 py-3.5 bg-paper/70 border-t border-stoneLine flex flex-wrap items-center justify-between gap-3 text-xs">
          <span id="audit-page-info" class="text-inkSoft tabular-nums">Page 1 of 1</span>
          <div class="flex items-center gap-2">
            <button type="button" id="audit-prev-page" class="px-3.5 py-1.5 rounded-xl font-medium bg-white hover:bg-sand text-ink border border-stoneLine disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer">← Previous</button>
            <button type="button" id="audit-next-page" class="px-3.5 py-1.5 rounded-xl font-medium bg-white hover:bg-sand text-ink border border-stoneLine disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer">Next →</button>
          </div>
        </div>
      </section>
    </div>
  `;

  let cfg = null;
  let furanoChartInstance = null;

  const auditState = {
    status: 'loading', // 'loading' | 'ready' | 'error'
    errorMsg: '',
    metadata: null,
    rates: [],
    furanoView: '3p_BF',
    filters: {
      search: '',
      stop: 'ALL',
      hotel: 'ALL',
      pax: 'ALL',
      meal: 'ALL',
      channel: 'ALL',
      checkin: 'ALL',
      activeOnly: false,
      liveOctOnly: false,
      hideExcluded: true,
    },
    sort: { key: 'stop_id', dir: 'asc' },
    page: 1,
    pageSize: 50,
  };

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatAuditDateLabel(iso) {
    if (!iso) return '—';
    const parts = iso.split('-');
    if (parts.length !== 3) return iso;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const mIdx = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    return `${months[mIdx] || parts[1]} ${day}`;
  }

  function fxRate() {
    return cfg ? cfg.getFxRate() : 123.92;
  }

  function jpyToSgd(jpy) {
    return Math.round(jpy / fxRate());
  }

  function formatSgd(amount) {
    return `S$${Math.round(amount).toLocaleString('en-US')}`;
  }

  function formatJpy(amount) {
    return `¥${Math.round(amount).toLocaleString('en-US')}`;
  }

  function formatFx(rate) {
    return Number(rate).toFixed(2).replace(/\.00$/, '');
  }

  function isOfficialChannel(channel) {
    const c = String(channel || '').toLowerCase();
    if (!c) return false;
    if (c.includes('japanican') || c.includes('booking') || c.includes('agoda') || c.includes('expedia') || c.includes('rakuten') || c.includes('ikyu')) {
      return false;
    }
    return c.includes('official') || c.includes('direct') || c.includes('dormy') || c.includes('tokyu') || c.includes('natulux') || c.includes('nonokaze') || c.includes('noguchi') || c.includes('gate') || c.includes('mitsui') || c.includes('super hotel') || c.includes('takinoya');
  }

  function isExcludedRow(row) {
    if (!row) return true;
    if (row.availability === 'SOLD_OUT' || row.total_room_jpy === null || row.total_room_jpy === undefined) {
      return true;
    }
    const flags = Array.isArray(row.flags) ? row.flags : [];
    return flags.some((f) => EXCLUDED_FLAGS.has(f));
  }

  function updateStatusUI() {
    const loadingEl = document.getElementById('audit-loading');
    const errorEl = document.getElementById('audit-error');
    const contentEl = document.getElementById('audit-content');
    const detailEl = document.getElementById('audit-error-detail');
    if (!loadingEl || !errorEl || !contentEl) return;

    loadingEl.classList.toggle('hidden', auditState.status !== 'loading');
    errorEl.classList.toggle('hidden', auditState.status !== 'error');
    contentEl.classList.toggle('hidden', auditState.status !== 'ready');
    if (detailEl && auditState.errorMsg) {
      detailEl.textContent = `${auditState.errorMsg} Please check your connection and try again.`;
    }
  }

  function syncFx() {
    const rate = fxRate();
    const defaultRate = cfg ? cfg.defaultFxRate : 123.92;
    const isDefaultFx = Math.abs(rate - defaultRate) < 0.005;

    const auditFxInput = document.getElementById('audit-fx-input');
    if (auditFxInput && document.activeElement !== auditFxInput) {
      auditFxInput.value = formatFx(rate);
    }

    const mobileAuditFx = document.getElementById('mobile-audit-fx-pill');
    if (mobileAuditFx) {
      mobileAuditFx.textContent = `¥${formatFx(rate)}`;
      mobileAuditFx.className = !isDefaultFx
        ? 'inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amberWarm-light text-amberWarm border border-amberWarm-border whitespace-nowrap tabular-nums'
        : 'inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium bg-sand text-inkSoft border border-stoneLine whitespace-nowrap tabular-nums';
    }

    document.querySelectorAll('.audit-fx-preset-btn').forEach((btn) => {
      const val = parseFloat(btn.dataset.fx);
      const isMatch = Math.abs(rate - val) < 0.005;
      btn.className = isMatch
        ? 'audit-fx-preset-btn px-2.5 py-1 rounded-lg text-xs font-semibold bg-pine text-white border border-pine transition-colors cursor-pointer tabular-nums whitespace-nowrap'
        : 'audit-fx-preset-btn px-2.5 py-1 rounded-lg text-xs font-medium bg-white text-inkSoft hover:text-ink border border-stoneLine transition-colors cursor-pointer tabular-nums whitespace-nowrap';
    });
  }

  function renderOverview() {
    const meta = auditState.metadata || {};
    const rates = auditState.rates || [];
    const totalUnique = meta.total_unique_records || rates.length;
    const totalRaw = meta.total_raw_records_extracted || totalUnique;
    const activeCount = meta.active_in_picker_records || rates.filter((r) => r.is_active_in_picker).length;

    const sourceFileSet = new Set();
    rates.forEach((r) => {
      if (Array.isArray(r.source_files)) r.source_files.forEach((f) => sourceFileSet.add(f));
      else if (r.source_files) sourceFileSet.add(String(r.source_files));
    });
    const fileCount = sourceFileSet.size || 13;

    const channelMap = meta.counts_by_channel || {};
    const channelKeys = Object.keys(channelMap);
    const channelCount = channelKeys.length;
    const officialChannelsCount = channelKeys.filter((k) => isOfficialChannel(k)).length;
    const otaChannels = channelKeys.filter((k) => !isOfficialChannel(k));
    const channelSub = otaChannels.length > 0
      ? `${officialChannelsCount} Official Sites + ${otaChannels.join(' + ')}`
      : `${channelCount} direct & OTA channels audited`;

    const flagMap = meta.counts_by_flag || {};
    const availMap = meta.counts_by_availability || {};
    const soldOutCount = availMap.SOLD_OUT || rates.filter((r) => r.availability === 'SOLD_OUT').length;
    const trapFlagKeys = ['eco_no_clean', 'non_refundable', 'barrier_free', 'price_trap', 'bunk_bed', 'annex', 'smoking_room'];
    const totalCaught = trapFlagKeys.reduce((acc, k) => acc + (flagMap[k] || 0), 0) + soldOutCount;

    const trapParts = [];
    if (flagMap.eco_no_clean) trapParts.push(`${flagMap.eco_no_clean} no-clean`);
    if (flagMap.non_refundable) trapParts.push(`${flagMap.non_refundable} non-refund`);
    if (flagMap.barrier_free) trapParts.push(`${flagMap.barrier_free} barrier-free`);
    if (flagMap.price_trap) trapParts.push(`${flagMap.price_trap} traps`);
    if (flagMap.bunk_bed) trapParts.push(`${flagMap.bunk_bed} bunks`);
    if (flagMap.annex) trapParts.push(`${flagMap.annex} annex`);
    if (soldOutCount) trapParts.push(`${soldOutCount} sold-out`);

    document.getElementById('audit-kpi-grid').innerHTML = `
      <div class="rounded-2xl bg-white border border-stoneLine p-4 sm:p-5">
        <div class="text-[10.5px] uppercase tracking-[0.12em] font-semibold text-inkMuted">Unique Quotes Audited</div>
        <div class="font-serif text-3xl sm:text-4xl font-semibold text-ink mt-1.5 tabular-nums leading-none">${Number(totalUnique).toLocaleString('en-US')}</div>
        <div class="text-[11.5px] text-inkSoft mt-2 leading-snug">from ${Number(totalRaw).toLocaleString('en-US')} raw across ${fileCount} audit files</div>
      </div>
      <div class="rounded-2xl bg-white border border-stoneLine p-4 sm:p-5">
        <div class="text-[10.5px] uppercase tracking-[0.12em] font-semibold text-inkMuted">Booking Channels Checked</div>
        <div class="font-serif text-3xl sm:text-4xl font-semibold text-ink mt-1.5 tabular-nums leading-none">${channelCount}</div>
        <div class="text-[11.5px] text-inkSoft mt-2 leading-snug">${escapeHtml(channelSub)}</div>
      </div>
      <div class="rounded-2xl bg-pine-light/60 border border-pine-border p-4 sm:p-5">
        <div class="text-[10.5px] uppercase tracking-[0.12em] font-semibold text-pine">Active Picker Rates</div>
        <div class="font-serif text-3xl sm:text-4xl font-semibold text-pine mt-1.5 tabular-nums leading-none">${Number(activeCount).toLocaleString('en-US')}</div>
        <div class="text-[11.5px] text-inkSoft mt-2 leading-snug">Free-cancel &amp; daily cleaning verified</div>
      </div>
      <div class="rounded-2xl bg-amberWarm-light/55 border border-amberWarm-border p-4 sm:p-5">
        <div class="text-[10.5px] uppercase tracking-[0.12em] font-semibold text-amberWarm">Traps &amp; Exclusions Caught</div>
        <div class="font-serif text-3xl sm:text-4xl font-semibold text-amberWarm mt-1.5 tabular-nums leading-none">${Number(totalCaught).toLocaleString('en-US')}</div>
        <div class="text-[11px] text-inkSoft mt-2 leading-snug">${escapeHtml(trapParts.join(' · ') || 'Eco, non-refundable & sold-out checks')}</div>
      </div>
    `;

    const subEl = document.getElementById('audit-meta-subtitle');
    if (subEl && meta.generated_at_utc) {
      const genDate = String(meta.generated_at_utc).slice(0, 10);
      subEl.textContent = `${Number(totalUnique).toLocaleString('en-US')} verified room quotes audited across 11 hotels (snapshot ${genDate}). Every SGD figure updates live with your FX rate.`;
    }

    const oneOfOneCount = flagMap['1_of_1_room'] || rates.filter((r) => (r.flags || []).includes('1_of_1_room')).length;
    const limitedLeftCount = availMap.LIMITED_1_LEFT || flagMap.limited_1_left || rates.filter((r) => r.availability === 'LIMITED_1_LEFT' || (r.flags || []).includes('limited_1_left')).length;
    const liveOctCount = rates.filter((r) => r.is_actual_trip_date).length;

    document.getElementById('audit-playbook-grid').innerHTML = `
      <div class="space-y-2">
        <h4 class="font-serif text-base font-medium text-ink">Free Memberships That Beat OTAs</h4>
        <ul class="space-y-1.5">
          <li class="flex items-start gap-2"><span class="text-pine font-bold">•</span><span><strong class="text-ink font-medium">Tokyu Stay Member (−10%)</strong> &amp; <strong class="text-ink font-medium">Haneda TCM (−10%):</strong> Beat public &amp; OTA rates on Stops 1 &amp; 5 with free cancellation.</span></li>
          <li class="flex items-start gap-2"><span class="text-pine font-bold">•</span><span><strong class="text-ink font-medium">MGH Rewards (−5% · 45d EB)</strong> &amp; <strong class="text-ink font-medium">Nonokaze N Point (−5%):</strong> Consistently undercut JAPANiCAN and Booking.com on Stops 4 &amp; 7A.</span></li>
          <li class="flex items-start gap-2"><span class="text-pine font-bold">•</span><span><strong class="text-ink font-medium">Gate Hotel Member (−3% · 90d EB)</strong> &amp; <strong class="text-ink font-medium">Natulux DirectIn:</strong> Unlock lowest direct inventory with daily room cleaning preserved.</span></li>
        </ul>
      </div>
      <div class="space-y-2">
        <h4 class="font-serif text-base font-medium text-ink">Scarcity &amp; Booking-Window Flags</h4>
        <ul class="space-y-1.5">
          <li class="flex items-start gap-2"><span class="text-amberWarm font-bold">•</span><span><strong class="text-ink font-medium">1-of-1 Room Alert (${oneOfOneCount} quotes):</strong> Furano Natulux’s 39 m² 7F Supreme Twin is the only room of its kind — requires day-one DirectIn booking (~Mar 2027) if using 3+2.</span></li>
          <li class="flex items-start gap-2"><span class="text-amberWarm font-bold">•</span><span><strong class="text-ink font-medium">Limited Inventory (${limitedLeftCount} scarce alerts):</strong> Tamanoyu has only 3 en-suite rooms total; Dormy Inn Asakusa has only 4 Jap-West rooms; Gate Hotel 26 m² Twin sold out on Official (use JAPANiCAN).</span></li>
          <li class="flex items-start gap-2"><span class="text-maple font-bold">•</span><span><strong class="text-ink font-medium">Live Oct 2027 Checks (${liveOctCount} quotes):</strong> La Vista Furano &amp; select OTAs are already open for actual Oct 16–18 dates — confirming autumn pricing stays ~1.7×–1.9× above Natulux.</span></li>
        </ul>
      </div>
    `;
  }

  function pickFuranoPoint(hotelQuery, checkin, pax, meal) {
    const blocked = new Set(['eco_no_clean', 'barrier_free', 'annex', 'smoking_room']);
    const candidates = auditState.rates.filter((r) => {
      if (Number(r.stop_id) !== 2) return false;
      if (!String(r.hotel || '').toLowerCase().includes(hotelQuery)) return false;
      if (r.checkin !== checkin) return false;
      if (Number(r.occupancy_pax) !== pax) return false;
      if (r.meal_plan !== meal) return false;
      if (r.availability === 'SOLD_OUT' || r.total_room_jpy === null || r.total_room_jpy <= 0) return false;
      const flags = Array.isArray(r.flags) ? r.flags : [];
      if (flags.some((f) => blocked.has(f))) return false;
      return true;
    });

    if (candidates.length === 0) return null;

    let pool = candidates;
    if (pax === 2) {
      const twins = candidates.filter((r) => String(r.room_name || '').toLowerCase().includes('twin'));
      if (twins.length > 0) pool = twins;
    }

    const freeCancelPool = pool.filter((r) => r.free_cancel !== false && !(r.flags || []).includes('non_refundable'));
    if (freeCancelPool.length > 0) pool = freeCancelPool;

    const officialRows = pool.filter((r) => isOfficialChannel(r.channel));
    if (officialRows.length > 0) {
      officialRows.sort((a, b) => a.total_room_jpy - b.total_room_jpy);
      return { row: officialRows[0], isFallback: false };
    }

    const jpcRows = pool.filter((r) => String(r.channel || '').toLowerCase().includes('japanican'));
    const fallbackPool = jpcRows.length > 0 ? jpcRows : pool;
    fallbackPool.sort((a, b) => a.total_room_jpy - b.total_room_jpy);
    return { row: fallbackPool[0], isFallback: true };
  }

  function renderFuranoSeasonalityChart() {
    const canvas = document.getElementById('furano-seasonality-canvas');
    if (!canvas || typeof Chart === 'undefined') return;

    document.querySelectorAll('.furano-view-btn').forEach((btn) => {
      const active = btn.dataset.furanoView === auditState.furanoView;
      btn.className = active
        ? 'furano-view-btn px-3 py-1.5 rounded-lg text-xs font-semibold bg-white text-ink shadow-xs transition-colors cursor-pointer whitespace-nowrap'
        : 'furano-view-btn px-3 py-1.5 rounded-lg text-xs font-medium text-inkSoft hover:text-ink transition-colors cursor-pointer whitespace-nowrap';
    });

    const viewConfig = {
      '3p_BF': { pax: 3, meal: 'BF', label: '3-Pax Room · Breakfast Incl.' },
      '2p_BF': { pax: 2, meal: 'BF', label: '2-Pax Twin · Breakfast Incl.' },
      '2p_RO': { pax: 2, meal: 'RO', label: '2-Pax Twin · Room Only' },
    }[auditState.furanoView];

    const labels = FURANO_AUDIT_DATES.map((d) => (d === '2027-10-16' ? 'Oct 16 ★' : formatAuditDateLabel(d)));
    const lvPoints = FURANO_AUDIT_DATES.map((d) => pickFuranoPoint('la vista', d, viewConfig.pax, viewConfig.meal));
    const ntPoints = FURANO_AUDIT_DATES.map((d) => pickFuranoPoint('natulux', d, viewConfig.pax, viewConfig.meal));

    const lvData = lvPoints.map((p) => (p ? jpyToSgd(p.row.total_room_jpy) : null));
    const ntData = ntPoints.map((p) => (p ? jpyToSgd(p.row.total_room_jpy) : null));

    if (furanoChartInstance) {
      furanoChartInstance.destroy();
      furanoChartInstance = null;
    }

    furanoChartInstance = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'La Vista Furano Hills (2N Room)',
            data: lvData,
            borderColor: '#9E4A35',
            backgroundColor: 'rgba(158, 74, 53, 0.08)',
            borderWidth: 2.5,
            tension: 0.25,
            spanGaps: true,
            pointRadius: lvPoints.map((p) => (p && p.isFallback ? 6 : 5)),
            pointHoverRadius: 7,
            pointStyle: lvPoints.map((p) => (p && p.isFallback ? 'triangle' : 'circle')),
            pointBackgroundColor: lvPoints.map((p) => (p && p.isFallback ? '#FAF8F4' : '#9E4A35')),
            pointBorderColor: '#9E4A35',
            pointBorderWidth: 2,
          },
          {
            label: 'Furano Natulux Hotel (2N Room)',
            data: ntData,
            borderColor: '#2E5A47',
            backgroundColor: 'rgba(46, 90, 71, 0.08)',
            borderWidth: 2.5,
            tension: 0.25,
            spanGaps: true,
            pointRadius: ntPoints.map((p) => (p && p.isFallback ? 6 : 5)),
            pointHoverRadius: 7,
            pointStyle: ntPoints.map((p) => (p && p.isFallback ? 'triangle' : 'circle')),
            pointBackgroundColor: ntPoints.map((p) => (p && p.isFallback ? '#FAF8F4' : '#2E5A47')),
            pointBorderColor: '#2E5A47',
            pointBorderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'top',
            align: 'start',
            labels: {
              usePointStyle: true,
              boxWidth: 8,
              padding: 16,
              color: '#1E211F',
              font: { family: 'Inter, system-ui, sans-serif', size: 12, weight: '500' },
            },
          },
          tooltip: {
            backgroundColor: '#1E211F',
            titleColor: '#FAF8F4',
            bodyColor: '#F2EFE9',
            padding: 12,
            cornerRadius: 10,
            titleFont: { family: 'Newsreader, Georgia, serif', size: 14, weight: '600' },
            bodyFont: { family: 'Inter, system-ui, sans-serif', size: 11.5 },
            callbacks: {
              title(items) {
                const idx = items[0].dataIndex;
                const iso = FURANO_AUDIT_DATES[idx];
                return `${formatAuditDateLabel(iso)}, 2027 (2 nights)${iso === '2027-10-16' ? ' · Actual Trip Dates' : ''}`;
              },
              label(ctx) {
                const idx = ctx.dataIndex;
                const pt = ctx.datasetIndex === 0 ? lvPoints[idx] : ntPoints[idx];
                if (!pt) return `${ctx.dataset.label}: No valid quote`;
                const r = pt.row;
                const sgd = jpyToSgd(r.total_room_jpy);
                const fb = pt.isFallback ? ' [JAPANiCAN fallback — Official not open]' : '';
                return ` ${ctx.datasetIndex === 0 ? 'La Vista' : 'Natulux'}: ${formatSgd(sgd)} (${formatJpy(r.total_room_jpy)}) · ${r.channel}${fb}`;
              },
              afterLabel(ctx) {
                const idx = ctx.dataIndex;
                const pt = ctx.datasetIndex === 0 ? lvPoints[idx] : ntPoints[idx];
                if (!pt) return '';
                const r = pt.row;
                return `   Room: ${r.room_name}${r.size_m2 ? ` (${r.size_m2} m²)` : ''}`;
              },
              footer(items) {
                const idx = items[0].dataIndex;
                const lv = lvPoints[idx];
                const nt = ntPoints[idx];
                if (lv && nt && nt.row.total_room_jpy > 0) {
                  const ratio = (lv.row.total_room_jpy / nt.row.total_room_jpy).toFixed(2);
                  const diff = jpyToSgd(lv.row.total_room_jpy) - jpyToSgd(nt.row.total_room_jpy);
                  return `La Vista is ${ratio}× Natulux (+${formatSgd(diff)} room total)`;
                }
                return '';
              },
            },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#575B57', font: { family: 'Inter, system-ui, sans-serif', size: 11 } } },
          y: {
            beginAtZero: true,
            grid: { color: '#E4DFD5' },
            ticks: { color: '#575B57', font: { family: 'Inter, system-ui, sans-serif', size: 11 }, callback: (val) => `S$${val}` },
          },
        },
      },
    });

    const paired = FURANO_AUDIT_DATES.map((d, i) => ({ date: d, lv: lvPoints[i], nt: ntPoints[i] })).filter((x) => x.lv && x.nt);
    const ratios = paired.map((x) => x.lv.row.total_room_jpy / x.nt.row.total_room_jpy);
    const minRatio = ratios.length ? Math.min(...ratios).toFixed(2) : '—';
    const maxRatio = ratios.length ? Math.max(...ratios).toFixed(2) : '—';
    const octIdx = FURANO_AUDIT_DATES.indexOf('2027-10-16');
    const octLv = lvPoints[octIdx];
    const octNt = ntPoints[octIdx];
    const aprLv = lvPoints[0];
    const aprNt = ntPoints[0];

    document.getElementById('furano-chart-summary').innerHTML = `
      <div class="p-3 rounded-xl bg-paper border border-stoneLine">
        <div class="text-[10.5px] uppercase tracking-[0.1em] font-semibold text-inkMuted">Price Multiplier (${viewConfig.label})</div>
        <div class="font-serif text-lg font-semibold text-pine mt-0.5 tabular-nums">${minRatio}× – ${maxRatio}×</div>
        <div class="text-[11px] text-inkSoft">La Vista vs. Natulux across ${paired.length} matched 2027 dates</div>
      </div>
      <div class="p-3 rounded-xl bg-paper border border-stoneLine">
        <div class="text-[10.5px] uppercase tracking-[0.1em] font-semibold text-inkMuted">Apr 10 Proxy Snapshot</div>
        <div class="font-serif text-lg font-semibold text-ink mt-0.5 tabular-nums">
          ${aprLv ? formatSgd(jpyToSgd(aprLv.row.total_room_jpy)) : '—'} <span class="text-xs font-sans font-normal text-inkMuted">vs.</span> ${aprNt ? formatSgd(jpyToSgd(aprNt.row.total_room_jpy)) : '—'}
        </div>
        <div class="text-[11px] text-inkSoft">La Vista vs. Natulux (2-night room total)</div>
      </div>
      <div class="p-3 rounded-xl bg-paper border border-stoneLine">
        <div class="text-[10.5px] uppercase tracking-[0.1em] font-semibold text-maple">Actual Oct 16–18 Check</div>
        <div class="font-serif text-lg font-semibold text-ink mt-0.5 tabular-nums">
          ${octLv ? formatSgd(jpyToSgd(octLv.row.total_room_jpy)) : '—'} <span class="text-xs font-sans font-normal text-inkMuted">vs.</span> ${octNt ? formatSgd(jpyToSgd(octNt.row.total_room_jpy)) : '—'}
        </div>
        <div class="text-[11px] text-inkSoft">${octNt && octNt.isFallback ? 'Natulux uses JAPANiCAN fallback (▲)' : 'Direct official comparison'}</div>
      </div>
    `;
  }

  function classifyChannelBucket(row) {
    const ch = String(row.channel || '').toLowerCase();
    const tier = String(row.rate_tier || '').toLowerCase();
    const plan = String(row.plan_name || '').toLowerCase();

    if (ch.includes('japanican')) return 'JAPANiCAN';
    if (ch.includes('booking')) return 'Booking.com';
    if (isOfficialChannel(row.channel)) {
      const looksRegular =
        tier.includes('regular') ||
        tier.includes('public') ||
        tier.includes('non-member') ||
        tier.includes('non_member') ||
        (tier.includes('standard') && !tier.includes('member') && !tier.includes('eb') && !tier.includes('directin') && !tier.includes('tcm') && !tier.includes('rewards'));
      const looksMember =
        tier.includes('member') ||
        tier.includes('tcm') ||
        tier.includes('directin') ||
        tier.includes('n point') ||
        tier.includes('rewards') ||
        tier.includes('eb') ||
        plan.includes('member') ||
        row.is_active_in_picker;

      if (looksRegular && !row.is_active_in_picker) return 'Official Regular';
      if (looksMember) return 'Official Member';
      return 'Official Regular';
    }
    return null;
  }

  function buildChannelComparisonForHotel(spec) {
    const validRows = auditState.rates.filter((r) => {
      if (Number(r.stop_id) !== spec.stopId) return false;
      if (!String(r.hotel || '').toLowerCase().includes(spec.hotelQuery)) return false;
      if (isExcludedRow(r)) return false;
      return true;
    });

    if (validRows.length === 0) return null;

    const cohorts = new Map();
    validRows.forEach((r) => {
      const key = `${r.checkin}|${r.occupancy_pax}|${r.meal_plan}`;
      if (!cohorts.has(key)) cohorts.set(key, []);
      cohorts.get(key).push(r);
    });

    let bestCohort = null;
    let bestScore = -1;
    cohorts.forEach((rows) => {
      const hasActive = rows.some((r) => r.is_active_in_picker);
      const buckets = new Set(rows.map(classifyChannelBucket).filter(Boolean));
      const score = (hasActive ? 100 : 0) + buckets.size * 15 + (rows.some((r) => String(r.channel || '').toLowerCase().includes('booking')) ? 5 : 0);
      if (score > bestScore) {
        bestScore = score;
        bestCohort = rows;
      }
    });

    if (!bestCohort || bestCohort.length === 0) return null;

    const anchor = bestCohort.find((r) => r.is_active_in_picker) || bestCohort.slice().sort((a, b) => a.total_room_jpy - b.total_room_jpy)[0];
    const anchorRoomNorm = String(anchor.room_name || '').toLowerCase().split(/[(\-–]/)[0].trim();

    const bucketOrder = ['Official Member', 'Official Regular', 'JAPANiCAN', 'Booking.com'];
    const bars = [];

    bucketOrder.forEach((bucketName) => {
      let matches = bestCohort.filter((r) => classifyChannelBucket(r) === bucketName);
      if (matches.length === 0) return;

      const exactRoom = matches.filter((r) => String(r.room_name || '').toLowerCase().includes(anchorRoomNorm) || (anchor.size_m2 && r.size_m2 && Math.abs(r.size_m2 - anchor.size_m2) <= 3));
      if (exactRoom.length > 0) matches = exactRoom;

      matches.sort((a, b) => a.total_room_jpy - b.total_room_jpy);
      bars.push({ bucket: bucketName, row: matches[0], sgd: jpyToSgd(matches[0].total_room_jpy) });
    });

    if (!bars.some((b) => b.bucket === 'Official Regular')) {
      const officialSameRoom = bestCohort
        .filter((r) => isOfficialChannel(r.channel) && r.total_room_jpy > anchor.total_room_jpy && (String(r.room_name || '').toLowerCase().includes(anchorRoomNorm) || (anchor.size_m2 && r.size_m2 && Math.abs(r.size_m2 - anchor.size_m2) <= 2)))
        .sort((a, b) => a.total_room_jpy - b.total_room_jpy);
      if (officialSameRoom.length > 0) {
        bars.splice(1, 0, { bucket: 'Official Regular', row: officialSameRoom[0], sgd: jpyToSgd(officialSameRoom[0].total_room_jpy) });
      }
    }

    const minBar = bars.reduce((best, cur) => (cur.row.total_room_jpy < best.row.total_room_jpy ? cur : best), bars[0]);
    const maxBar = bars.reduce((high, cur) => (cur.row.total_room_jpy > high.row.total_room_jpy ? cur : high), bars[0]);
    const directBar = bars.find((b) => b.bucket === 'Official Member') || minBar;
    const savingsSgd = Math.max(0, maxBar.sgd - directBar.sgd);

    return { title: spec.title, stopLabel: spec.stopLabel, anchor, bars, minBar, maxBar, directBar, savingsSgd };
  }

  function renderChannelSavings() {
    const specs = [
      { stopId: 1, hotelQuery: 'haneda', stopLabel: 'Stop 1 · Haneda', title: 'Haneda Excel Hotel Tokyu' },
      { stopId: 2, hotelQuery: 'la vista', stopLabel: 'Stop 2A · Furano', title: 'La Vista Furano Hills' },
      { stopId: 2, hotelQuery: 'natulux', stopLabel: 'Stop 2B · Furano', title: 'Furano Natulux Hotel' },
      { stopId: 5, hotelQuery: 'hakodate', stopLabel: 'Stop 5 · Hakodate', title: 'TOKYU STAY Hakodate' },
      { stopId: 6, hotelQuery: 'gate', stopLabel: 'Stop 6 · Sapporo', title: 'THE GATE HOTEL Sapporo' },
      { stopId: 7, hotelQuery: 'mitsui', stopLabel: 'Stop 7A · Tokyo Ueno', title: 'Mitsui Garden Hotel Ueno' },
    ];

    const cards = specs.map(buildChannelComparisonForHotel).filter(Boolean);
    document.getElementById('channel-savings-grid').innerHTML = cards.map((card) => {
      const maxJpy = Math.max(...card.bars.map((b) => b.row.total_room_jpy), 1);
      const metaLine = `${card.anchor.room_name}${card.anchor.size_m2 ? ` (${card.anchor.size_m2} m²)` : ''} · ${card.anchor.occupancy_pax}p · ${card.anchor.meal_plan} · ${formatAuditDateLabel(card.anchor.checkin)} (${card.anchor.nights}N)`;

      const savingsBadge = card.savingsSgd > 0 && card.directBar.bucket === card.minBar.bucket
        ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-pine-light text-pine border border-pine-border whitespace-nowrap">Saves ${formatSgd(card.savingsSgd)} vs. ${escapeHtml(card.maxBar.bucket)}</span>`
        : card.minBar.bucket !== 'Official Member'
          ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-amberWarm-light text-amberWarm border border-amberWarm-border whitespace-nowrap">Best: ${escapeHtml(card.minBar.bucket)}</span>`
          : `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-sand text-inkSoft border border-stoneLine whitespace-nowrap">Direct Best Rate</span>`;

      const barsHtml = card.bars.map((bar) => {
        const pct = Math.max(18, Math.round((bar.row.total_room_jpy / maxJpy) * 100));
        const isBest = bar.bucket === card.minBar.bucket;
        const barColor = bar.bucket === 'Official Member' ? 'bg-pine' : bar.bucket === 'Official Regular' ? 'bg-inkSoft/70' : bar.bucket === 'JAPANiCAN' ? 'bg-amberWarm' : 'bg-maple/85';
        return `
          <div class="space-y-1">
            <div class="flex items-center justify-between gap-2 text-[11px]">
              <span class="${isBest ? 'font-semibold text-pine' : 'text-inkSoft'} truncate">${escapeHtml(bar.bucket)}</span>
              <span class="font-semibold ${isBest ? 'text-pine' : 'text-ink'} tabular-nums shrink-0">${formatSgd(bar.sgd)} <span class="text-[10px] font-normal text-inkMuted">(${formatJpy(bar.row.total_room_jpy)})</span></span>
            </div>
            <div class="w-full h-2 rounded-full bg-sand overflow-hidden">
              <div class="h-full rounded-full ${barColor} transition-all duration-300" style="width:${pct}%"></div>
            </div>
          </div>
        `;
      }).join('');

      return `
        <div class="rounded-2xl bg-paper/75 border border-stoneLine p-4 flex flex-col justify-between gap-3">
          <div>
            <div class="flex flex-wrap items-center justify-between gap-1.5 mb-1.5">
              <span class="text-[10px] uppercase tracking-[0.12em] font-semibold text-maple">${escapeHtml(card.stopLabel)}</span>
              ${savingsBadge}
            </div>
            <h4 class="font-serif text-base font-semibold text-ink leading-snug">${escapeHtml(card.title)}</h4>
            <p class="text-[11px] text-inkMuted mt-0.5 leading-snug">${escapeHtml(metaLine)}</p>
          </div>
          <div class="space-y-2 pt-2 border-t border-stoneLine/70">${barsHtml}</div>
        </div>
      `;
    }).join('');
  }

  function populateFilterOptions() {
    const rates = auditState.rates || [];
    const stops = Array.from(new Set(rates.map((r) => r.stop_id).filter((v) => v !== null && v !== undefined))).sort((a, b) => a - b);
    const hotels = Array.from(new Set(rates.map((r) => r.hotel).filter(Boolean))).sort((a, b) => a.localeCompare(b));
    const paxes = Array.from(new Set(rates.map((r) => r.occupancy_pax).filter((v) => v !== null && v !== undefined))).sort((a, b) => a - b);
    const meals = Array.from(new Set(rates.map((r) => r.meal_plan).filter(Boolean))).sort();
    const channels = Array.from(new Set(rates.map((r) => r.channel).filter(Boolean))).sort((a, b) => a.localeCompare(b));
    const checkins = Array.from(new Set(rates.map((r) => r.checkin).filter(Boolean))).sort();

    const stopCityMap = {};
    rates.forEach((r) => {
      if (r.stop_id && r.city && !stopCityMap[r.stop_id]) stopCityMap[r.stop_id] = r.city;
    });

    const fillSelect = (id, defaultLabel, items) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.innerHTML = `<option value="ALL">${defaultLabel}</option>` + items.map((it) => `<option value="${escapeHtml(it.value)}">${escapeHtml(it.label)}</option>`).join('');
    };

    fillSelect('audit-filter-stop', 'All Stops (1–7)', stops.map((s) => ({ value: String(s), label: `Stop ${s} · ${stopCityMap[s] || ''}` })));
    fillSelect('audit-filter-hotel', `All Hotels (${hotels.length})`, hotels.map((h) => ({ value: h, label: h })));
    fillSelect('audit-filter-pax', 'All Occupancy', paxes.map((p) => ({ value: String(p), label: `${p}p (${p} ${p === 1 ? 'guest' : 'guests'})` })));
    fillSelect('audit-filter-meal', 'All Meals', meals.map((m) => ({ value: m, label: m === 'HB_WAGYU' ? 'HB Wagyu' : m })));
    fillSelect('audit-filter-channel', `All Channels (${channels.length})`, channels.map((c) => ({ value: c, label: c })));
    fillSelect('audit-filter-checkin', 'All Check-ins', checkins.map((d) => {
      const isActual = rates.some((r) => r.checkin === d && r.is_actual_trip_date);
      return { value: d, label: `${d}${isActual ? ' ★ Live Oct' : ''}` };
    }));
  }

  function getFilteredAndSortedRates() {
    const f = auditState.filters;
    const q = f.search.trim().toLowerCase();

    const filtered = auditState.rates.filter((r) => {
      if (f.stop !== 'ALL' && String(r.stop_id) !== f.stop) return false;
      if (f.hotel !== 'ALL' && r.hotel !== f.hotel) return false;
      if (f.pax !== 'ALL' && String(r.occupancy_pax) !== f.pax) return false;
      if (f.meal !== 'ALL' && r.meal_plan !== f.meal) return false;
      if (f.channel !== 'ALL' && r.channel !== f.channel) return false;
      if (f.checkin !== 'ALL' && r.checkin !== f.checkin) return false;
      if (f.activeOnly && !r.is_active_in_picker) return false;
      if (f.liveOctOnly && !r.is_actual_trip_date) return false;
      if (f.hideExcluded && isExcludedRow(r)) return false;

      if (q) {
        const hay = `${r.hotel || ''} ${r.room_name || ''} ${r.plan_name || ''} ${r.notes || ''} ${r.city || ''} ${r.channel || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const { key, dir } = auditState.sort;
    const mult = dir === 'asc' ? 1 : -1;

    filtered.sort((a, b) => {
      if (key === 'total_room_jpy' || key === 'per_night_jpy') {
        const aNull = a[key] === null || a[key] === undefined;
        const bNull = b[key] === null || b[key] === undefined;
        if (aNull && bNull) return 0;
        if (aNull) return 1;
        if (bNull) return -1;
        return (a[key] - b[key]) * mult;
      }

      if (key === 'stop_id' || key === 'occupancy_pax') {
        const va = Number(a[key] || 0);
        const vb = Number(b[key] || 0);
        if (va !== vb) return (va - vb) * mult;
        const hCmp = String(a.hotel || '').localeCompare(String(b.hotel || ''));
        if (hCmp !== 0) return hCmp;
        return (a.total_room_jpy || 1e9) - (b.total_room_jpy || 1e9);
      }

      if (key === 'flags') {
        const va = (a.is_active_in_picker ? '0' : '1') + (Array.isArray(a.flags) ? a.flags.join(',') : '');
        const vb = (b.is_active_in_picker ? '0' : '1') + (Array.isArray(b.flags) ? b.flags.join(',') : '');
        return va.localeCompare(vb) * mult;
      }

      return String(a[key] || '').toLowerCase().localeCompare(String(b[key] || '').toLowerCase()) * mult;
    });

    return filtered;
  }

  function renderFlagPillsHtml(row) {
    const pills = [];
    const seen = new Set();

    if (row.is_active_in_picker) {
      pills.push('<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-pine-light text-pine border border-pine-border">Active</span>');
    }
    if (row.is_actual_trip_date) {
      pills.push('<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-maple/10 text-maple border border-maple/25">Live Oct</span>');
    }
    if (row.availability === 'SOLD_OUT' || row.total_room_jpy === null) {
      pills.push('<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sand text-inkMuted border border-stoneLine">Sold Out</span>');
    } else if (row.availability === 'LIMITED_1_LEFT') {
      pills.push('<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amberWarm-light text-amberWarm border border-amberWarm-border">1 Left</span>');
      seen.add('1 Left');
    }

    const flagLabels = {
      '1_of_1_room': { label: '1-of-1', cls: 'bg-amberWarm-light text-amberWarm border-amberWarm-border' },
      limited_1_left: { label: '1 Left', cls: 'bg-amberWarm-light text-amberWarm border-amberWarm-border' },
      price_trap: { label: 'Price Trap', cls: 'bg-maple/10 text-maple border-maple/25' },
      eco_no_clean: { label: 'No Clean', cls: 'bg-sand text-inkSoft border-stoneLine' },
      non_refundable: { label: 'Non-Refundable', cls: 'bg-amberWarm-light text-amberWarm border-amberWarm-border' },
      barrier_free: { label: 'Barrier-Free', cls: 'bg-sand text-inkSoft border-stoneLine' },
      bunk_bed: { label: 'Bunk Bed', cls: 'bg-sand text-inkSoft border-stoneLine' },
      annex: { label: 'Annex', cls: 'bg-sand text-inkSoft border-stoneLine' },
      smoking_room: { label: 'Smoking', cls: 'bg-sand text-inkSoft border-stoneLine' },
    };

    (Array.isArray(row.flags) ? row.flags : []).forEach((flag) => {
      const cfgItem = flagLabels[flag];
      const text = cfgItem ? cfgItem.label : flag.replace(/_/g, ' ');
      if (seen.has(text)) return;
      seen.add(text);
      const cls = cfgItem ? cfgItem.cls : 'bg-paper text-inkSoft border-stoneLine';
      pills.push(`<span class="px-2 py-0.5 rounded-full text-[10px] font-medium border ${cls}">${escapeHtml(text)}</span>`);
    });

    return pills.length > 0 ? `<div class="flex flex-wrap gap-1">${pills.join('')}</div>` : '<span class="text-[11px] text-inkMuted">—</span>';
  }

  function renderTable() {
    const chipStyles = (el, active) => {
      if (!el) return;
      el.className = active
        ? 'px-3 py-1.5 rounded-full text-xs font-semibold bg-pine text-white border border-pine transition-colors cursor-pointer'
        : 'px-3 py-1.5 rounded-full text-xs font-medium bg-white text-inkSoft hover:text-ink border border-stoneLine transition-colors cursor-pointer';
    };
    chipStyles(document.getElementById('chip-active-only'), auditState.filters.activeOnly);
    chipStyles(document.getElementById('chip-live-oct'), auditState.filters.liveOctOnly);
    chipStyles(document.getElementById('chip-hide-excluded'), auditState.filters.hideExcluded);

    document.querySelectorAll('.audit-sort-th').forEach((th) => {
      const ind = th.querySelector('.sort-ind');
      if (!ind) return;
      if (th.dataset.sortKey === auditState.sort.key) {
        ind.textContent = auditState.sort.dir === 'asc' ? '▲' : '▼';
        th.classList.add('text-ink');
      } else {
        ind.textContent = '';
        th.classList.remove('text-ink');
      }
    });

    const rows = getFilteredAndSortedRates();
    const total = rows.length;
    const totalPages = Math.max(1, Math.ceil(total / auditState.pageSize));
    if (auditState.page > totalPages) auditState.page = totalPages;

    const startIdx = (auditState.page - 1) * auditState.pageSize;
    const pageRows = rows.slice(startIdx, startIdx + auditState.pageSize);
    const endNum = Math.min(total, startIdx + pageRows.length);

    document.getElementById('audit-match-count').textContent = total === 0
      ? 'Showing 0 matching quotes'
      : `Showing ${startIdx + 1}–${endNum} of ${total.toLocaleString('en-US')} matching quotes`;
    document.getElementById('audit-page-info').textContent = `Page ${auditState.page} of ${totalPages}`;
    document.getElementById('audit-prev-page').disabled = auditState.page <= 1;
    document.getElementById('audit-next-page').disabled = auditState.page >= totalPages;

    const tbody = document.getElementById('audit-table-body');
    if (pageRows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="10" class="px-6 py-10 text-center text-inkSoft">No quotes match your current filters. Try clearing the search or toggling off <strong>Hide Excluded &amp; Sold Out</strong>.</td></tr>';
      return;
    }

    tbody.innerHTML = pageRows.map((r) => {
      const soldOut = r.availability === 'SOLD_OUT' || r.total_room_jpy === null || r.total_room_jpy === undefined;
      const totalSgd = soldOut ? null : jpyToSgd(r.total_room_jpy);
      const perNightSgd = !soldOut && r.per_night_jpy ? jpyToSgd(r.per_night_jpy) : (!soldOut && r.nights ? jpyToSgd(r.total_room_jpy / r.nights) : null);

      const mealBadgeClass = r.meal_plan === 'HB_WAGYU'
        ? 'bg-plum-light text-plum border-plum-border'
        : r.meal_plan === 'HB'
          ? 'bg-pine-light text-pine border-pine-border'
          : r.meal_plan === 'BF'
            ? 'bg-amberWarm-light text-amberWarm border-amberWarm-border'
            : 'bg-sand text-inkSoft border-stoneLine';

      return `
        <tr class="${r.is_active_in_picker ? 'bg-pine-light/25 hover:bg-pine-light/45' : 'hover:bg-paper/80'} transition-colors align-top">
          <td class="px-4 py-3">
            <div class="flex items-center gap-1.5">
              <span class="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-semibold bg-sand text-ink shrink-0">${escapeHtml(r.stop_id)}</span>
              <span class="font-medium text-ink leading-snug">${escapeHtml(r.hotel)}</span>
            </div>
            <div class="text-[11px] text-inkMuted pl-6 mt-0.5">${escapeHtml(r.city || '')}</div>
          </td>
          <td class="px-3 py-3 max-w-[240px]">
            <div class="font-medium text-ink leading-snug">${escapeHtml(r.room_name || '—')}${r.size_m2 ? ` <span class="text-inkMuted font-normal">(${escapeHtml(r.size_m2)} m²)</span>` : ''}</div>
            ${r.plan_name ? `<div class="text-[10.5px] text-inkMuted mt-0.5 line-clamp-2">${escapeHtml(r.plan_name)}</div>` : ''}
          </td>
          <td class="px-3 py-3 whitespace-nowrap"><span class="inline-flex items-center px-2 py-0.5 rounded-md bg-sand text-ink font-medium text-[11px] tabular-nums">${escapeHtml(r.occupancy_pax)}p</span></td>
          <td class="px-3 py-3 whitespace-nowrap">
            <div class="font-medium text-ink tabular-nums">${escapeHtml(r.checkin || '—')}</div>
            <div class="text-[10.5px] text-inkMuted mt-0.5">${escapeHtml(r.nights)}N${r.is_actual_trip_date ? ' · <span class="text-maple font-semibold">Trip dates</span>' : ''}</div>
          </td>
          <td class="px-3 py-3">
            <div class="font-medium text-ink whitespace-nowrap">${escapeHtml(r.channel || '—')}</div>
            ${r.rate_tier ? `<span class="inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-paper text-inkSoft border border-stoneLine whitespace-nowrap">${escapeHtml(r.rate_tier)}</span>` : ''}
          </td>
          <td class="px-3 py-3 whitespace-nowrap"><span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-semibold border ${mealBadgeClass}">${escapeHtml(r.meal_plan === 'HB_WAGYU' ? 'HB Wagyu' : (r.meal_plan || '—'))}</span></td>
          <td class="px-3 py-3 text-right whitespace-nowrap">
            ${soldOut ? '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-sand text-inkMuted border border-stoneLine">Sold Out</span>' : `<div class="font-serif text-base font-semibold text-ink tabular-nums leading-none">${formatSgd(totalSgd)}</div><div class="text-[10.5px] text-inkMuted tabular-nums mt-1">${formatJpy(r.total_room_jpy)}</div>`}
          </td>
          <td class="px-3 py-3 text-right whitespace-nowrap tabular-nums">
            ${perNightSgd !== null ? `<span class="font-medium text-ink">${formatSgd(perNightSgd)}</span><div class="text-[10px] text-inkMuted">/ night</div>` : '<span class="text-inkMuted">—</span>'}
          </td>
          <td class="px-3 py-3 max-w-[190px]">${renderFlagPillsHtml(r)}</td>
          <td class="px-4 py-3 text-right whitespace-nowrap">
            ${r.source_url ? `<a href="${escapeHtml(r.source_url)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-medium bg-paper hover:bg-pine-light text-pine border border-stoneLine transition-colors">Source ↗</a>` : '<span class="text-inkMuted">—</span>'}
          </td>
        </tr>
      `;
    }).join('');
  }

  function exportFilteredCsv() {
    const rows = getFilteredAndSortedRates();
    if (rows.length === 0) {
      if (cfg && cfg.showToast) cfg.showToast('No matching rows to export');
      return;
    }

    const csvCell = (val) => {
      const s = val === null || val === undefined ? '' : String(val);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const fxStr = formatFx(fxRate());
    const headers = [
      'record_id', 'stop_id', 'city', 'hotel', 'room_name', 'size_m2', 'occupancy_pax',
      'checkin', 'checkout', 'nights', 'is_actual_trip_date', 'channel', 'rate_tier',
      'plan_name', 'meal_plan', 'free_cancel', 'daily_cleaning', 'availability',
      'total_room_jpy', `total_room_sgd_at_${fxStr}`, `per_night_sgd_at_${fxStr}`,
      'is_active_in_picker', 'flags', 'source_url',
    ];

    const lines = [headers.map(csvCell).join(',')];
    rows.forEach((r) => {
      const soldOut = r.availability === 'SOLD_OUT' || r.total_room_jpy === null || r.total_room_jpy === undefined;
      const totalSgd = soldOut ? '' : jpyToSgd(r.total_room_jpy);
      const perNightSgd = !soldOut && r.per_night_jpy ? jpyToSgd(r.per_night_jpy) : (!soldOut && r.nights ? jpyToSgd(r.total_room_jpy / r.nights) : '');
      lines.push([
        r.record_id, r.stop_id, r.city, r.hotel, r.room_name, r.size_m2, r.occupancy_pax,
        r.checkin, r.checkout, r.nights, r.is_actual_trip_date, r.channel, r.rate_tier,
        r.plan_name, r.meal_plan, r.free_cancel, r.daily_cleaning, r.availability,
        r.total_room_jpy, totalSgd, perNightSgd, r.is_active_in_picker,
        Array.isArray(r.flags) ? r.flags.join('|') : '', r.source_url,
      ].map(csvCell).join(','));
    });

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Hokkaido-2027-Rate-Audit-${rows.length}-rows.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    if (cfg && cfg.showToast) cfg.showToast(`Exported ${rows.length.toLocaleString('en-US')} filtered quotes to CSV`);
  }

  function render() {
    syncFx();
    updateStatusUI();
    if (auditState.status !== 'ready') return;
    renderOverview();
    renderFuranoSeasonalityChart();
    renderChannelSavings();
    renderTable();
  }

  function bindEvents() {
    const auditFxInput = document.getElementById('audit-fx-input');
    auditFxInput.addEventListener('input', () => {
      const val = parseFloat(auditFxInput.value);
      if (!isNaN(val) && val >= 60 && val <= 220 && cfg) {
        cfg.setFxRate(val, false);
      }
    });
    auditFxInput.addEventListener('blur', () => {
      const val = parseFloat(auditFxInput.value);
      if (isNaN(val) || val < 60 || val > 220) {
        auditFxInput.value = formatFx(fxRate());
      }
    });

    document.querySelectorAll('.audit-fx-preset-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (cfg) cfg.setFxRate(parseFloat(btn.dataset.fx), true);
      });
    });

    document.getElementById('audit-retry-btn').addEventListener('click', fetchData);

    document.querySelectorAll('.furano-view-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        auditState.furanoView = btn.dataset.furanoView;
        renderFuranoSeasonalityChart();
      });
    });

    document.getElementById('audit-search-input').addEventListener('input', (e) => {
      auditState.filters.search = e.target.value;
      auditState.page = 1;
      renderTable();
    });

    [
      ['audit-filter-stop', 'stop'],
      ['audit-filter-hotel', 'hotel'],
      ['audit-filter-pax', 'pax'],
      ['audit-filter-meal', 'meal'],
      ['audit-filter-channel', 'channel'],
      ['audit-filter-checkin', 'checkin'],
    ].forEach(([elId, filterKey]) => {
      document.getElementById(elId).addEventListener('change', (e) => {
        auditState.filters[filterKey] = e.target.value;
        auditState.page = 1;
        renderTable();
      });
    });

    document.getElementById('chip-active-only').addEventListener('click', () => {
      auditState.filters.activeOnly = !auditState.filters.activeOnly;
      auditState.page = 1;
      renderTable();
    });
    document.getElementById('chip-live-oct').addEventListener('click', () => {
      auditState.filters.liveOctOnly = !auditState.filters.liveOctOnly;
      auditState.page = 1;
      renderTable();
    });
    document.getElementById('chip-hide-excluded').addEventListener('click', () => {
      auditState.filters.hideExcluded = !auditState.filters.hideExcluded;
      auditState.page = 1;
      renderTable();
    });

    document.getElementById('audit-reset-filters-btn').addEventListener('click', () => {
      auditState.filters = {
        search: '', stop: 'ALL', hotel: 'ALL', pax: 'ALL', meal: 'ALL',
        channel: 'ALL', checkin: 'ALL', activeOnly: false, liveOctOnly: false, hideExcluded: true,
      };
      auditState.page = 1;
      document.getElementById('audit-search-input').value = '';
      ['stop', 'hotel', 'pax', 'meal', 'channel', 'checkin'].forEach((k) => {
        document.getElementById(`audit-filter-${k}`).value = 'ALL';
      });
      renderTable();
    });

    document.querySelectorAll('.audit-sort-th').forEach((th) => {
      th.addEventListener('click', () => {
        const key = th.dataset.sortKey;
        if (auditState.sort.key === key) {
          auditState.sort.dir = auditState.sort.dir === 'asc' ? 'desc' : 'asc';
        } else {
          auditState.sort.key = key;
          auditState.sort.dir = 'asc';
        }
        auditState.page = 1;
        renderTable();
      });
    });

    document.getElementById('audit-prev-page').addEventListener('click', () => {
      if (auditState.page > 1) {
        auditState.page -= 1;
        renderTable();
      }
    });
    document.getElementById('audit-next-page').addEventListener('click', () => {
      auditState.page += 1;
      renderTable();
    });
    document.getElementById('audit-export-csv-btn').addEventListener('click', exportFilteredCsv);
  }

  async function fetchData() {
    if (!cfg || !cfg.auditDataUrl) return;
    auditState.status = 'loading';
    auditState.errorMsg = '';
    updateStatusUI();

    try {
      const response = await fetch(cfg.auditDataUrl, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      const json = await response.json();
      if (!json || !Array.isArray(json.rates)) throw new Error('Unexpected JSON structure (missing rates array).');

      auditState.metadata = json.metadata || {};
      auditState.rates = json.rates;
      auditState.status = 'ready';

      const totalUnique = auditState.metadata.total_unique_records || json.rates.length;
      if (cfg.onCountLoaded) {
        cfg.onCountLoaded(
          Number(totalUnique).toLocaleString('en-US'),
          `${Number(totalUnique).toLocaleString('en-US')} audited quotes · 11 hotels`
        );
      }

      populateFilterOptions();
      render();
    } catch (err) {
      auditState.status = 'error';
      auditState.errorMsg = err && err.message ? err.message : 'Network error while fetching audit data.';
      if (cfg.onCountLoaded) cfg.onCountLoaded('!', 'Audit data failed to load');
      updateStatusUI();
    }
  }

  global.HokkaidoAuditModule = {
    init(options) {
      cfg = options;
      if (cfg && cfg.mountEl) {
        cfg.mountEl.innerHTML = AUDIT_HTML_TEMPLATE;
        bindEvents();
        syncFx();
        fetchData();
      }
    },
    render,
    syncFx,
    fetchData,
  };
})(window);