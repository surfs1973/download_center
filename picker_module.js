/**
 * Hokkaido + Tokyo 2027 — Core Hotel Picker Module
 * Hosted on GitHub so hokkaido_tokyo_2027_hotel_picker.html stays a lightweight shell.
 * Loads trip_data_2027.json and audit_module.js, renders all 7 stops, Stop 7 Tokyo
 * configurator, Split-Screen Map Explorer (SVG + Google Maps), and Share/Load Picks.
 */
(function (global) {
  'use strict';

  // ===================================================================
  // GITHUB HOSTED MODULE & DATA ENDPOINTS
  // ===================================================================
  const TRIP_DATA_URL = 'https://raw.githubusercontent.com/surfs1973/download_center/refs/heads/main/trip_data_2027.json';
  const AUDIT_MODULE_URL = 'https://raw.githubusercontent.com/surfs1973/download_center/refs/heads/main/audit_module.js';

  // Runtime data hydrated from trip_data_2027.json
  let CONFIG = {
    defaultFxRate: 123.92,
    totalNights: 16,
    tripDays: 17,
    flightsEstSgd: 1400,
    dailySpendGrossSgd: 100,
    breakfastValueSgd: 12,
    halfBoardDinnerValueSgd: 25,
    auditDataUrl: 'https://raw.githubusercontent.com/surfs1973/download_center/refs/heads/main/all_scraped_rates_2027.json',
    hokkaidoDriveGmapsUrl: 'https://www.google.com/maps/dir/New+Chitose+Airport/La+Vista+Furano+Hills/Noboribetsu+Onsenkyo+Takinoya/The+Lake+View+Toya+Nonokaze+Resort/TOKYU+STAY+Hakodate-Asaichi+Akari+no+Yu',
  };
  let STOPS = [];
  let PRESETS = [];
  let DIRECTORY = [];

  // ===================================================================
  // APPLICATION STATE
  // ===================================================================
  const state = {
    dataLoaded: false,
    activeView: 'picker', // 'picker' | 'audit'
    mode: 'M1', // 'M1' (Hybrid) | 'M2' (All 3+2)
    fxRate: 123.92,
    stop7Beds: 'twin', // 'twin' | 'double'
    stop7Meal: 'ro', // 'ro' | 'bf'
    mapModalOpen: false,
    mapTab: 'tokyo', // 'tokyo' | 'route'
    mapPaneMode: window.innerWidth >= 1024 ? 'split' : 'svg', // 'split' | 'svg' | 'gmaps'
    mapZoom: 16, // 16 = Street View | 14 = Area Context
    mapFocusedStopId: 1,
    picks: { 1: '1A', 2: '2A_BF', 3: '3A', 4: '4A', 7: '7B' },
    openMathDrawers: {},
    openGuideDrawers: {},
    importWarning: null, // { summary, unmatchedStops: [{ stopId, hotelName }] }
  };

  let toastTimer = null;
  let initialized = false;

  // ===================================================================
  // VERIFIED GEOGRAPHIC COORDINATES FOR EDITORIAL SVG RELATIVE MAPS
  // ===================================================================
  const STOP_DEFAULT_COORDS = {
    1: [35.5512, 139.7888], // Haneda Terminal 2
    2: [43.3458, 142.3910], // Furano
    3: [42.4956, 141.1429], // Noboribetsu
    4: [42.5653, 140.8222], // Lake Toya
    5: [41.7717, 140.7254], // Hakodate
    6: [43.0663, 141.3516], // Sapporo
    7: [35.6712, 139.7650], // Central Tokyo
  };

  const TOKYO_HOTEL_COORD_PATTERNS = [
    { pattern: /gracery\s*ginza/i, coords: [35.6690, 139.7635] },
    { pattern: /super\s*hotel.*ginza/i, coords: [35.6709, 139.7689] },
    { pattern: /sotetsu.*(sanchome|3[\s-]*chome|ginza[\s-]*san)/i, coords: [35.6722, 139.7667] },
    { pattern: /sotetsu.*(nanachome|7[\s-]*chome|ginza[\s-]*nana)/i, coords: [35.6682, 139.7646] },
    { pattern: /sotetsu.*fresa.*ginza/i, coords: [35.6682, 139.7646] },
    { pattern: /remm.*kyobashi/i, coords: [35.6769, 139.7699] },
    { pattern: /remm.*hibiya/i, coords: [35.6731, 139.7595] },
    { pattern: /mitsui\s*garden.*ueno/i, coords: [35.7124, 139.7782] },
    { pattern: /super\s*hotel.*okachimachi/i, coords: [35.7069, 139.7757] },
    { pattern: /dormy\s*inn.*asakusa/i, coords: [35.7118, 139.7993] },
  ];

  const GINZA_SVG_CONTEXT = {
    label: 'Ginza · Hibiya · Kyobashi',
    anchors: [
      { name: 'JR Tokyo Stn', lat: 35.6812, lng: 139.7671, major: true },
      { name: 'JR Yurakucho', lat: 35.6750, lng: 139.7633, major: true },
      { name: 'Ginza Crossing', lat: 35.6712, lng: 139.7650, major: true },
      { name: 'Hibiya Stn', lat: 35.6745, lng: 139.7595, major: false },
      { name: 'Kyobashi Stn', lat: 35.6768, lng: 139.7704, major: false },
      { name: 'Higashi-Ginza', lat: 35.6695, lng: 139.7674, major: false },
      { name: 'JR Shimbashi', lat: 35.6664, lng: 139.7583, major: true },
    ],
    lines: [
      {
        name: 'JR Yamanote',
        color: '#6CA140',
        dash: '',
        pts: [[35.6832, 139.7681], [35.6812, 139.7671], [35.6750, 139.7633], [35.6664, 139.7583], [35.6645, 139.7573]],
      },
      {
        name: 'Ginza Line',
        color: '#E08A1E',
        dash: '',
        pts: [[35.6805, 139.7726], [35.6768, 139.7704], [35.6712, 139.7650], [35.6664, 139.7583]],
      },
      {
        name: 'Asakusa Line (Direct Haneda)',
        color: '#B84B5B',
        dash: '5 4',
        pts: [[35.6762, 139.7728], [35.6695, 139.7674], [35.6664, 139.7583]],
      },
      {
        name: 'Hibiya Line',
        color: '#8493A1',
        dash: '2 3',
        pts: [[35.6755, 139.7572], [35.6745, 139.7595], [35.6712, 139.7650], [35.6695, 139.7674], [35.6677, 139.7724]],
      },
    ],
  };

  const UENO_SVG_CONTEXT = {
    label: 'Ueno · Okachimachi · Asakusa',
    anchors: [
      { name: 'JR Ueno', lat: 35.7141, lng: 139.7774, major: true },
      { name: 'Okachimachi', lat: 35.7074, lng: 139.7747, major: false },
      { name: 'Akihabara', lat: 35.6984, lng: 139.7731, major: true },
      { name: 'Senso-ji', lat: 35.7148, lng: 139.7967, major: true },
      { name: 'Asakusa Stn', lat: 35.7119, lng: 139.7982, major: false },
      { name: 'Skytree', lat: 35.7101, lng: 139.8107, major: false },
    ],
    lines: [
      {
        name: 'JR Yamanote',
        color: '#6CA140',
        dash: '',
        pts: [[35.7205, 139.7758], [35.7141, 139.7774], [35.7074, 139.7747], [35.6984, 139.7731], [35.6935, 139.7715]],
      },
      {
        name: 'Ginza Line',
        color: '#E08A1E',
        dash: '',
        pts: [[35.7119, 139.7982], [35.7117, 139.7828], [35.7121, 139.7765], [35.7075, 139.7730], [35.6960, 139.7718]],
      },
      {
        name: 'Asakusa Line (Direct Haneda)',
        color: '#B84B5B',
        dash: '5 4',
        pts: [[35.7119, 139.7982], [35.7035, 139.7912], [35.6950, 139.7845]],
      },
    ],
  };

  // ===================================================================
  // GENERAL & FORMATTING HELPERS
  // ===================================================================
  function getTokyoHotelCoords(opt) {
    if (!opt) return [35.6712, 139.7650];
    if (Array.isArray(opt.coords) && opt.coords.length === 2) return opt.coords;
    if (typeof opt.lat === 'number' && typeof opt.lng === 'number') return [opt.lat, opt.lng];
    const hay = `${opt.name || ''} ${opt.shortName || ''} ${opt.mapsQuery || ''}`;
    for (const item of TOKYO_HOTEL_COORD_PATTERNS) {
      if (item.pattern.test(hay)) return item.coords;
    }
    return [35.6712, 139.7650];
  }

  function haversineMeters(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }

  function stripCodeFences(rawText) {
    return String(rawText || '')
      .replace(/^\s*```[a-zA-Z]*\r?\n/, '')
      .replace(/\r?\n```\s*$/, '');
  }

  function gmapsSearchUrl(query) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  }

  function gmapsEmbedUrl(query, zoom = 15) {
    return `https://maps.google.com/maps?q=${encodeURIComponent(query)}&t=&z=${zoom}&ie=UTF8&iwloc=&output=embed`;
  }

  function jpyToSgd(jpy, fx = state.fxRate) {
    return Math.round(jpy / fx);
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

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Evaluates {{sgd:JPY}} and {{diff:JPY_A-JPY_B}} placeholders inside trip_data_2027.json
   * so every dynamic price note recalculates automatically when the user adjusts FX.
   */
  function interpolateFxTokens(str) {
    if (typeof str !== 'string') return str;
    return str
      .replace(/\{\{sgd:(\d+(?:\.\d+)?)\}\}/g, (_, jpy) => formatSgd(jpyToSgd(Number(jpy))))
      .replace(/\{\{diff:(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)\}\}/g, (_, a, b) =>
        formatSgd(Math.abs(jpyToSgd(Number(a)) - jpyToSgd(Number(b))))
      );
  }

  function resolveField(val, mode = state.mode) {
    let raw = val;
    if (raw && typeof raw === 'object' && !Array.isArray(raw) && ('M1' in raw || 'M2' in raw)) {
      raw = raw[mode];
    }
    if (Array.isArray(raw)) return raw.map((item) => interpolateFxTokens(item));
    if (typeof raw === 'string') return interpolateFxTokens(raw);
    return raw;
  }

  function getOptionJpy(opt, mode = state.mode) {
    if (!opt || opt.jpy === undefined || opt.jpy === null) return 0;
    if (typeof opt.jpy === 'number') return opt.jpy;
    return opt.jpy[mode] !== undefined ? opt.jpy[mode] : (opt.jpy.M1 || 0);
  }

  /**
   * Resolves variant-backed options (Stop 7 Tokyo bed & breakfast permutations).
   * Stops 1–6 have no `variants` map and are returned untouched.
   */
  function resolveOptionData(stop, opt, bedsOverride = state.stop7Beds, mealOverride = state.stop7Meal) {
    if (!opt || !opt.variants) return opt;
    const beds = bedsOverride || state.stop7Beds;
    const meal = mealOverride || state.stop7Meal;
    const key = `${beds}_${meal}`;
    const variant = opt.variants[key] || opt.variants[`twin_${meal}`] || Object.values(opt.variants)[0];
    return variant ? { ...opt, ...variant } : opt;
  }

  function getStop7BedSavingsHint(stop) {
    const diffs = [];
    (stop.options || []).forEach((rawOpt) => {
      if (!rawOpt.variants) return;
      const tw = rawOpt.variants[`twin_${state.stop7Meal}`];
      const db = rawOpt.variants[`double_${state.stop7Meal}`];
      if (tw && db) {
        const diff = jpyToSgd(getOptionJpy(tw, state.mode)) - jpyToSgd(getOptionJpy(db, state.mode));
        if (diff > 0) diffs.push(diff);
      }
    });
    if (diffs.length > 0) {
      const min = Math.min(...diffs);
      const max = Math.max(...diffs);
      return min === max ? `Saves ${formatSgd(min)}/sib` : `Saves S$${min}–${max}/sib`;
    }
    return 'Saves S$33–66/sib';
  }

  // ===================================================================
  // CORE CALCULATION HELPERS
  // ===================================================================
  function isStopLockedForMode(stop, mode = state.mode) {
    return Boolean(stop && (stop.locked || (Array.isArray(stop.lockedModes) && stop.lockedModes.includes(mode))));
  }

  function getOption(stop, optId) {
    return stop.options.find((o) => o.id === optId) || stop.options[0];
  }

  function getSelectedOptionForStop(stop, mode = state.mode, picks = state.picks, bedsOverride = state.stop7Beds, mealOverride = state.stop7Meal) {
    const lockedNow = isStopLockedForMode(stop, mode);
    const pickedId = lockedNow ? stop.options[0].id : (picks[stop.id] || stop.baselineOptionId);
    return resolveOptionData(stop, getOption(stop, pickedId), bedsOverride, mealOverride);
  }

  function isOptionSolo(opt, mode = state.mode) {
    if (!opt || !opt.sisterSolo) return false;
    if (typeof opt.sisterSolo === 'boolean') return opt.sisterSolo;
    return Boolean(opt.sisterSolo[mode]);
  }

  function computeTotalsForPicks(picks, mode = state.mode, fx = state.fxRate, bedsOverride = state.stop7Beds, mealOverride = state.stop7Meal) {
    let totalJpy = 0;
    let breakfastMornings = 0;
    let halfBoardDinners = 0;
    let soloNights = 0;
    const soloStopNames = [];

    STOPS.forEach((stop) => {
      const opt = getSelectedOptionForStop(stop, mode, picks, bedsOverride, mealOverride);
      totalJpy += getOptionJpy(opt, mode);
      breakfastMornings += opt.breakfastMornings || 0;
      halfBoardDinners += opt.halfBoardDinners || 0;

      if (isOptionSolo(opt, mode)) {
        soloNights += stop.nights;
        const shortCity = stop.city.split(' ')[0];
        soloStopNames.push(stop.id === 7 ? (opt.shortName || 'Tokyo') : shortCity);
      }
    });

    const exactHotelSgd = totalJpy / fx;
    const hotelSgd = Math.round(exactHotelSgd);
    const perNightSgd = Math.round(exactHotelSgd / CONFIG.totalNights);
    const grossMealsSgd = CONFIG.dailySpendGrossSgd * CONFIG.tripDays;
    const bfDeductSgd = breakfastMornings * CONFIG.breakfastValueSgd;
    const hbDeductSgd = halfBoardDinners * CONFIG.halfBoardDinnerValueSgd;
    const mealsNetSgd = grossMealsSgd - bfDeductSgd - hbDeductSgd;
    const fullTripSgd = hotelSgd + CONFIG.flightsEstSgd + mealsNetSgd;

    return {
      totalJpy,
      hotelSgd,
      perNightSgd,
      breakfastMornings,
      halfBoardDinners,
      grossMealsSgd,
      bfDeductSgd,
      hbDeductSgd,
      mealsNetSgd,
      fullTripSgd,
      soloNights,
      soloStopNames,
    };
  }

  function getMatchingPreset() {
    return PRESETS.find((preset) => {
      if (preset.stop7Beds && preset.stop7Beds !== state.stop7Beds) return false;
      if (preset.stop7Meal && preset.stop7Meal !== state.stop7Meal) return false;
      return Object.keys(preset.picks).every((stopId) => {
        const sId = Number(stopId);
        const stop = STOPS.find((s) => s.id === sId);
        if (!stop || isStopLockedForMode(stop, state.mode)) return true;
        return state.picks[sId] === preset.picks[stopId];
      });
    }) || null;
  }

  // ===================================================================
  // REMOTE DATA & AUDIT MODULE LOADERS (GITHUB RAW FETCH)
  // ===================================================================
  async function loadTripData() {
    const loadingEl = document.getElementById('trip-data-loading');
    const errorEl = document.getElementById('trip-data-error');
    const pickerView = document.getElementById('picker-view');

    loadingEl.classList.remove('hidden');
    errorEl.classList.add('hidden');

    try {
      const res = await fetch(TRIP_DATA_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const rawText = stripCodeFences(await res.text());
      const data = JSON.parse(rawText);

      if (!data || !Array.isArray(data.stops) || !Array.isArray(data.presets)) {
        throw new Error('trip_data_2027.json is missing required stops or presets.');
      }

      CONFIG = { ...CONFIG, ...(data.config || {}) };
      STOPS = data.stops;
      PRESETS = data.presets;
      DIRECTORY = Array.isArray(data.directory) ? data.directory : [];
      state.fxRate = CONFIG.defaultFxRate;
      state.dataLoaded = true;

      // Initialize default picks and optional Stop 7 toggles from the first preset
      if (PRESETS[0] && PRESETS[0].picks) {
        const initPicks = {};
        Object.keys(PRESETS[0].picks).forEach((k) => {
          initPicks[Number(k)] = PRESETS[0].picks[k];
        });
        state.picks = initPicks;
        if (PRESETS[0].stop7Beds) state.stop7Beds = PRESETS[0].stop7Beds;
        if (PRESETS[0].stop7Meal) state.stop7Meal = PRESETS[0].stop7Meal;
      }

      loadingEl.classList.add('hidden');
      if (state.activeView === 'picker') {
        pickerView.classList.remove('hidden');
      }

      renderDirectory();
      renderAll(false);

      // Load external Audit Dashboard module in parallel after core config is ready
      loadAuditModule();
    } catch (err) {
      loadingEl.classList.add('hidden');
      errorEl.classList.remove('hidden');
      const titleEl = document.getElementById('trip-data-error-title');
      if (titleEl) titleEl.textContent = 'Could not fetch trip_data_2027.json';
      document.getElementById('trip-data-error-detail').textContent =
        `${err && err.message ? err.message : 'Network error'} — verify that trip_data_2027.json is live on your main branch.`;
    }
  }

  async function loadAuditModule() {
    const mountEl = document.getElementById('audit-view');
    if (!mountEl) return;

    if (global.HokkaidoAuditModule) {
      global.HokkaidoAuditModule.render();
      return;
    }

    try {
      const res = await fetch(AUDIT_MODULE_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const cleanedCode = stripCodeFences(await res.text());

      const script = document.createElement('script');
      script.textContent = cleanedCode;
      document.head.appendChild(script);

      if (!global.HokkaidoAuditModule || typeof global.HokkaidoAuditModule.init !== 'function') {
        throw new Error('audit_module.js loaded, but HokkaidoAuditModule was not found.');
      }

      global.HokkaidoAuditModule.init({
        mountEl,
        auditDataUrl: CONFIG.auditDataUrl,
        defaultFxRate: CONFIG.defaultFxRate,
        getFxRate: () => state.fxRate,
        setFxRate: (val, animate) => {
          state.fxRate = val;
          renderAll(animate);
        },
        showToast,
        onCountLoaded: (badgeText, mobileSubtitle) => {
          const badge = document.getElementById('audit-count-badge');
          if (badge) badge.textContent = badgeText;
          const mobileSub = document.getElementById('mobile-audit-sticky-sub');
          if (mobileSub) mobileSub.textContent = mobileSubtitle;
          setTimeout(() => {
            const stop7Opt = document.querySelector('#audit-filter-stop option[value="7"]');
            if (stop7Opt) stop7Opt.textContent = 'Stop 7 · Tokyo';
          }, 0);
        },
      });
    } catch (err) {
      const badge = document.getElementById('audit-count-badge');
      if (badge) badge.textContent = '!';
      const mobileSub = document.getElementById('mobile-audit-sticky-sub');
      if (mobileSub) mobileSub.textContent = 'Audit module unavailable';

      mountEl.innerHTML = `
        <div class="rounded-2xl bg-amberWarm-light/70 border border-amberWarm-border p-6 sm:p-8 text-center space-y-3">
          <p class="text-[11px] uppercase tracking-[0.14em] font-semibold text-amberWarm">Unable to Load Audit Module</p>
          <h3 class="font-serif text-xl font-medium text-ink">Could not fetch audit_module.js</h3>
          <p class="text-xs text-inkSoft max-w-lg mx-auto">${escapeHtml(err && err.message ? err.message : 'Network error')}</p>
          <button type="button" id="retry-audit-module-btn" class="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-pine hover:bg-pine-dark text-white transition-colors cursor-pointer">
            ↻ Retry Audit Module
          </button>
        </div>
      `;
      const retryBtn = document.getElementById('retry-audit-module-btn');
      if (retryBtn) retryBtn.addEventListener('click', loadAuditModule);
    }
  }

  // ===================================================================
  // TOP-LEVEL 2-VIEW SWITCHER (HOTELS <-> RATE RESEARCH & AUDIT)
  // ===================================================================
  function setActiveView(view) {
    const nextView = view === 'audit' ? 'audit' : 'picker';
    state.activeView = nextView;
    const isPicker = nextView === 'picker';

    const pickerView = document.getElementById('picker-view');
    const auditView = document.getElementById('audit-view');
    if (state.dataLoaded) {
      pickerView.classList.toggle('hidden', !isPicker);
    }
    auditView.classList.toggle('hidden', isPicker);
    document.getElementById('mobile-sticky-picker').classList.toggle('hidden', !isPicker);
    document.getElementById('mobile-sticky-audit').classList.toggle('hidden', isPicker);
    document.getElementById('hero-map-jump-btn').classList.toggle('hidden', !isPicker);

    const tabPicker = document.getElementById('view-tab-picker');
    const tabAudit = document.getElementById('view-tab-audit');
    const badge = document.getElementById('audit-count-badge');

    tabPicker.setAttribute('aria-selected', String(isPicker));
    tabAudit.setAttribute('aria-selected', String(!isPicker));

    tabPicker.className = isPicker
      ? 'view-switch-trigger inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs sm:text-[13px] font-semibold bg-ink text-paper shadow-xs transition-all cursor-pointer whitespace-nowrap'
      : 'view-switch-trigger inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs sm:text-[13px] font-medium text-inkSoft hover:text-ink transition-all cursor-pointer whitespace-nowrap';

    tabAudit.className = !isPicker
      ? 'view-switch-trigger inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs sm:text-[13px] font-semibold bg-ink text-paper shadow-xs transition-all cursor-pointer whitespace-nowrap'
      : 'view-switch-trigger inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs sm:text-[13px] font-medium text-inkSoft hover:text-ink transition-all cursor-pointer whitespace-nowrap';

    if (badge) {
      badge.className = !isPicker
        ? 'inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-paper/20 text-paper border border-paper/25 tabular-nums'
        : 'inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-white/90 text-inkSoft border border-stoneLine tabular-nums';
    }

    if (!isPicker && global.HokkaidoAuditModule) {
      global.HokkaidoAuditModule.render();
    }
  }

  // ===================================================================
  // SPLIT-SCREEN MAP EXPLORER MODAL (SVG RELATIVE MAP + GOOGLE MAPS)
  // ===================================================================
  function openMapModal(tab = 'tokyo', focusStopId = null) {
    state.mapTab = tab;
    if (focusStopId !== null) state.mapFocusedStopId = focusStopId;
    state.mapModalOpen = true;
    document.getElementById('map-modal').classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
    renderGoogleMapsPanel();
  }

  function closeMapModal() {
    state.mapModalOpen = false;
    document.getElementById('map-modal').classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
  }

  function openMapForStop(stopId) {
    if (stopId === 7) {
      openMapModal('tokyo', 7);
    } else {
      openMapModal('route', stopId);
    }
  }

  function renderTokyoSvgMap(stop7) {
    const stage = document.getElementById('svg-map-stage');
    const footer = document.getElementById('svg-map-footer');
    if (!stage || !footer) return;

    const hotels = stop7.options.map((rawOpt) => {
      const opt = resolveOptionData(stop7, rawOpt);
      const [lat, lng] = getTokyoHotelCoords(opt);
      return {
        opt,
        lat,
        lng,
        sgd: jpyToSgd(getOptionJpy(opt, state.mode)),
        isSelected: state.picks[7] === opt.id,
      };
    });

    const avgLat = hotels.reduce((sum, h) => sum + h.lat, 0) / Math.max(1, hotels.length);
    const ctx = avgLat > 35.69 ? UENO_SVG_CONTEXT : GINZA_SVG_CONTEXT;

    const allPts = [
      ...hotels.map((h) => [h.lat, h.lng]),
      ...ctx.anchors.map((a) => [a.lat, a.lng]),
    ];
    const lats = allPts.map((p) => p[0]);
    const lngs = allPts.map((p) => p[1]);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const midLat = (minLat + maxLat) / 2;
    const cosLat = Math.cos((midLat * Math.PI) / 180);

    const W = 760;
    const H = 370;
    const padL = 96;
    const padR = 96;
    const padT = 46;
    const padB = 46;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    const spanX = Math.max((maxLng - minLng) * cosLat, 0.004);
    const spanY = Math.max(maxLat - minLat, 0.004);
    const scale = Math.min(plotW / spanX, plotH / spanY);

    const offsetX = padL + (plotW - spanX * scale) / 2;
    const offsetY = padT + (plotH - spanY * scale) / 2;

    const project = (lat, lng) => [
      offsetX + (lng - minLng) * cosLat * scale,
      offsetY + (maxLat - lat) * scale,
    ];

    let scaleMeters = 500;
    let scalePx = (scaleMeters / 111132) * scale;
    if (scalePx > 190) { scaleMeters = 250; scalePx = (scaleMeters / 111132) * scale; }
    else if (scalePx < 55) { scaleMeters = 1000; scalePx = (scaleMeters / 111132) * scale; }
    const walkMins = Math.round(scaleMeters / 80);

    const gridLines = [];
    for (let gx = 95; gx < W; gx += 95) {
      gridLines.push(`<line x1="${gx}" y1="0" x2="${gx}" y2="${H}" stroke="#E8E3D9" stroke-width="1" />`);
    }
    for (let gy = 74; gy < H; gy += 74) {
      gridLines.push(`<line x1="0" y1="${gy}" x2="${W}" y2="${gy}" stroke="#E8E3D9" stroke-width="1" />`);
    }

    const railSvg = ctx.lines.map((line) => {
      const ptsStr = line.pts.map(([la, ln]) => project(la, ln).map((n) => n.toFixed(1)).join(',')).join(' ');
      return `<polyline points="${ptsStr}" fill="none" stroke="${line.color}" stroke-width="${line.dash ? 2.4 : 3.4}" stroke-linecap="round" stroke-linejoin="round" opacity="0.72" ${line.dash ? `stroke-dasharray="${line.dash}"` : ''} />`;
    }).join('');

    const anchorSvg = ctx.anchors.map((a) => {
      const [ax, ay] = project(a.lat, a.lng);
      const lblY = a.lat === maxLat ? ay - 11 : ay + 15;
      return `
        <g>
          <circle cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="${a.major ? 4.2 : 3.2}" fill="#FAF8F4" stroke="#575B57" stroke-width="1.6" />
          <text x="${ax.toFixed(1)}" y="${lblY.toFixed(1)}" text-anchor="middle" fill="${a.major ? '#3D413E' : '#747873'}" font-family="Inter, sans-serif" font-size="${a.major ? '10.5' : '9.5'}" font-weight="${a.major ? '600' : '500'}" style="paint-order:stroke;stroke:#FAF8F4;stroke-width:3.5px;stroke-linejoin:round;">${escapeHtml(a.name)}</text>
        </g>
      `;
    }).join('');

    const nodes = hotels.map((h) => {
      const [x, y] = project(h.lat, h.lng);
      const label = `${h.opt.id} · ${h.opt.shortName} · ${formatSgd(h.sgd)}`;
      const pillW = Math.max(122, Math.min(235, label.length * 6.0 + 20));
      const pillH = 24;
      const dxInit = x < W * 0.45 ? -16 : x > W * 0.55 ? 16 : 0;
      const dyInit = y < H * 0.45 ? -24 : 24;
      return { ...h, x, y, lx: x + dxInit, ly: y + dyInit, pillW, pillH, label };
    });

    for (let iter = 0; iter < 24; iter++) {
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const overlapX = (a.pillW + b.pillW) / 2 + 8 - Math.abs(a.lx - b.lx);
          const overlapY = (a.pillH + b.pillH) / 2 + 6 - Math.abs(a.ly - b.ly);
          if (overlapX > 0 && overlapY > 0) {
            if (overlapY <= overlapX) {
              const push = overlapY / 2 + 1;
              if (a.ly <= b.ly) { a.ly -= push; b.ly += push; }
              else { a.ly += push; b.ly -= push; }
            } else {
              const push = overlapX / 2 + 1;
              if (a.lx <= b.lx) { a.lx -= push; b.lx += push; }
              else { a.lx += push; b.lx -= push; }
            }
          }
        }
      }
      nodes.forEach((n) => {
        const halfW = n.pillW / 2 + 8;
        const halfH = n.pillH / 2 + 8;
        n.lx = Math.max(halfW, Math.min(W - halfW, n.lx));
        n.ly = Math.max(halfH, Math.min(H - halfH, n.ly));
      });
    }

    nodes.sort((a, b) => Number(a.isSelected) - Number(b.isSelected));

    const pinsSvg = nodes.map((n) => {
      const fill = n.isSelected ? '#2E5A47' : '#9E4A35';
      const rx = (n.lx - n.pillW / 2).toFixed(1);
      const ry = (n.ly - n.pillH / 2).toFixed(1);
      return `
        <g class="svg-tokyo-pin cursor-pointer" data-tokyo-opt="${escapeHtml(n.opt.id)}" role="button" tabindex="0" aria-label="Select ${escapeHtml(n.opt.name)}">
          <line x1="${n.x.toFixed(1)}" y1="${n.y.toFixed(1)}" x2="${n.lx.toFixed(1)}" y2="${n.ly.toFixed(1)}" stroke="${fill}" stroke-width="1.3" stroke-dasharray="2.5 2.5" opacity="0.7" />
          ${n.isSelected ? `<circle cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="12" fill="#2E5A47" opacity="0.18" />` : ''}
          <circle cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="${n.isSelected ? 6.5 : 5.2}" fill="${fill}" stroke="#FFFFFF" stroke-width="2" />
          <rect x="${rx}" y="${ry}" width="${n.pillW.toFixed(1)}" height="${n.pillH}" rx="12" fill="${fill}" stroke="#FFFFFF" stroke-width="1.6" />
          <text x="${n.lx.toFixed(1)}" y="${(n.ly + 3.6).toFixed(1)}" text-anchor="middle" fill="#FFFFFF" font-family="Inter, sans-serif" font-size="10.5" font-weight="600">${escapeHtml(n.label)}</text>
        </g>
      `;
    }).join('');

    stage.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" class="w-full h-full max-h-full select-none" role="img" aria-label="Relative position map of Tokyo hotel options">
        <rect x="0" y="0" width="${W}" height="${H}" fill="#FAF8F4" />
        ${gridLines.join('')}
        ${railSvg}
        ${anchorSvg}
        ${pinsSvg}
        <g transform="translate(${W - 34}, 28)">
          <circle cx="0" cy="0" r="14" fill="#FFFFFF" fill-opacity="0.9" stroke="#E4DFD5" stroke-width="1" />
          <path d="M0 -8 L3.2 2 L0 0 L-3.2 2 Z" fill="#9E4A35" />
          <text x="0" y="10" text-anchor="middle" fill="#575B57" font-family="Inter, sans-serif" font-size="7.5" font-weight="700">N</text>
        </g>
        <g transform="translate(18, ${H - 22})">
          <rect x="-6" y="-12" width="${Math.max(scalePx + 96, 150).toFixed(0)}" height="22" rx="8" fill="#FFFFFF" fill-opacity="0.92" stroke="#E4DFD5" stroke-width="1" />
          <line x1="2" y1="0" x2="${(2 + scalePx).toFixed(1)}" y2="0" stroke="#1E211F" stroke-width="2" />
          <line x1="2" y1="-4" x2="2" y2="4" stroke="#1E211F" stroke-width="1.5" />
          <line x1="${(2 + scalePx).toFixed(1)}" y1="-4" x2="${(2 + scalePx).toFixed(1)}" y2="4" stroke="#1E211F" stroke-width="1.5" />
          <text x="${(10 + scalePx).toFixed(1)}" y="3.5" fill="#575B57" font-family="Inter, sans-serif" font-size="9.5" font-weight="600">${scaleMeters >= 1000 ? '1 km' : `${scaleMeters} m`} (~${walkMins} min walk)</text>
        </g>
      </svg>
    `;

    stage.querySelectorAll('.svg-tokyo-pin').forEach((pin) => {
      const pick = () => {
        state.picks[7] = pin.dataset.tokyoOpt;
        renderAll(true);
      };
      pin.addEventListener('click', pick);
      pin.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); }
      });
    });

    const selectedNode = hotels.find((h) => h.isSelected) || hotels[0];
    const primaryAnchor = ctx.anchors[0];
    const distMeters = selectedNode && primaryAnchor
      ? haversineMeters(selectedNode.lat, selectedNode.lng, primaryAnchor.lat, primaryAnchor.lng)
      : null;

    const lineChips = ctx.lines.slice(0, 3).map((l) => `
      <span class="inline-flex items-center gap-1 whitespace-nowrap">
        <span class="w-3 h-0.5 rounded-full" style="background:${l.color}"></span>${l.name}
      </span>
    `).join('');

    footer.innerHTML = `
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span class="inline-flex items-center gap-1 font-semibold text-pine"><span class="w-2 h-2 rounded-full bg-pine"></span>Selected</span>
        <span class="inline-flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-maple"></span>Other Options</span>
        ${lineChips}
      </div>
      <span class="text-inkMuted whitespace-nowrap">
        ${distMeters !== null ? `${escapeHtml(selectedNode.opt.shortName)} is ~${distMeters >= 1000 ? `${(distMeters / 1000).toFixed(1)} km` : `${distMeters} m`} to ${primaryAnchor.name} · ` : ''}Tap any pin to switch
      </span>
    `;
  }

  function renderRouteSvgMap() {
    const stage = document.getElementById('svg-map-stage');
    const footer = document.getElementById('svg-map-footer');
    if (!stage || !footer) return;

    const W = 760;
    const H = 370;

    const hokkaidoStops = STOPS.filter((s) => s.id >= 2 && s.id <= 6);
    const minLat = 41.55;
    const maxLat = 43.55;
    const minLng = 140.45;
    const maxLng = 142.85;
    const cosLat = Math.cos((42.6 * Math.PI) / 180);

    const padL = 235;
    const padR = 56;
    const padT = 38;
    const padB = 42;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;
    const spanX = (maxLng - minLng) * cosLat;
    const spanY = maxLat - minLat;
    const scale = Math.min(plotW / spanX, plotH / spanY);
    const offX = padL + (plotW - spanX * scale) / 2;
    const offY = padT + (plotH - spanY * scale) / 2;

    const projHok = ([lat, lng]) => [
      offX + (lng - minLng) * cosLat * scale,
      offY + (maxLat - lat) * scale,
    ];

    const stopPos = { 1: [98, 255], 7: [98, 128] };
    hokkaidoStops.forEach((s) => { stopPos[s.id] = projHok(STOP_DEFAULT_COORDS[s.id]); });
    const ctsPos = projHok([42.7752, 141.6923]);

    const drivePts = [ctsPos, stopPos[2], stopPos[3], stopPos[4], stopPos[5]].map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' ');
    const trainPts = [stopPos[5], stopPos[6]].map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' ');

    const pinsSvg = STOPS.map((stop) => {
      const [x, y] = stopPos[stop.id];
      const isFocused = stop.id === state.mapFocusedStopId;
      const lockedNow = isStopLockedForMode(stop, state.mode);
      const fill = isFocused ? '#2E5A47' : (lockedNow ? '#1E211F' : '#9E4A35');
      const shortCity = stop.id === 1 ? 'Haneda' : stop.id === 7 ? 'Tokyo' : stop.city.split(' ')[0];
      const label = `${stop.id}. ${shortCity} (${stop.nights}N)`;
      const pillW = Math.max(96, label.length * 6.2 + 18);
      const lx = stop.id === 4 ? x - 62 : stop.id === 3 ? x + 64 : stop.id === 2 ? x - 18 : x;
      const ly = stop.id === 3 ? y + 18 : stop.id === 4 ? y - 16 : y - 22;
      return `
        <g class="svg-route-pin cursor-pointer" data-route-stop="${stop.id}" role="button" tabindex="0" aria-label="Focus Stop ${stop.id} ${escapeHtml(stop.city)}">
          <line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${lx.toFixed(1)}" y2="${ly.toFixed(1)}" stroke="${fill}" stroke-width="1.2" stroke-dasharray="2 2" opacity="0.65" />
          ${isFocused ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="12" fill="#2E5A47" opacity="0.18" />` : ''}
          <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${isFocused ? 6.5 : 5}" fill="${fill}" stroke="#FFFFFF" stroke-width="2" />
          <rect x="${(lx - pillW / 2).toFixed(1)}" y="${(ly - 11.5).toFixed(1)}" width="${pillW.toFixed(1)}" height="23" rx="11.5" fill="${fill}" stroke="#FFFFFF" stroke-width="1.5" />
          <text x="${lx.toFixed(1)}" y="${(ly + 3.5).toFixed(1)}" text-anchor="middle" fill="#FFFFFF" font-family="Inter, sans-serif" font-size="10.5" font-weight="600">${escapeHtml(label)}</text>
        </g>
      `;
    }).join('');

    stage.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" class="w-full h-full max-h-full select-none" role="img" aria-label="7-stop Hokkaido and Tokyo route map">
        <rect x="0" y="0" width="${W}" height="${H}" fill="#FAF8F4" />
        <rect x="18" y="24" width="166" height="${H - 48}" rx="16" fill="#F2EFE9" fill-opacity="0.7" stroke="#E4DFD5" stroke-width="1.2" />
        <text x="101" y="48" text-anchor="middle" fill="#838781" font-family="Inter, sans-serif" font-size="10" font-weight="700" letter-spacing="1.2">TOKYO REGION</text>
        <rect x="200" y="24" width="${W - 218}" height="${H - 48}" rx="16" fill="#FFFFFF" fill-opacity="0.65" stroke="#E4DFD5" stroke-width="1.2" />
        <text x="220" y="48" fill="#838781" font-family="Inter, sans-serif" font-size="10" font-weight="700" letter-spacing="1.2">HOKKAIDO ROAD TRIP &amp; RAIL LOOP</text>
        <path d="M ${stopPos[1][0]} ${stopPos[1][1]} Q 220 315 ${ctsPos[0].toFixed(1)} ${ctsPos[1].toFixed(1)}" fill="none" stroke="#838781" stroke-width="1.6" stroke-dasharray="4 4" />
        <path d="M ${stopPos[6][0].toFixed(1)} ${stopPos[6][1].toFixed(1)} Q 250 75 ${stopPos[7][0]} ${stopPos[7][1]}" fill="none" stroke="#838781" stroke-width="1.6" stroke-dasharray="4 4" />
        <polyline points="${drivePts}" fill="none" stroke="#2E5A47" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity="0.75" />
        <polyline points="${trainPts}" fill="none" stroke="#E08A1E" stroke-width="2.6" stroke-dasharray="6 4" stroke-linecap="round" opacity="0.85" />
        <circle cx="${ctsPos[0].toFixed(1)}" cy="${ctsPos[1].toFixed(1)}" r="4" fill="#FAF8F4" stroke="#575B57" stroke-width="1.6" />
        <text x="${(ctsPos[0] + 10).toFixed(1)}" y="${(ctsPos[1] + 4).toFixed(1)}" fill="#575B57" font-family="Inter, sans-serif" font-size="10" font-weight="600">✈ CTS Airport</text>
        ${pinsSvg}
      </svg>
    `;

    stage.querySelectorAll('.svg-route-pin').forEach((pin) => {
      const focus = () => {
        state.mapFocusedStopId = Number(pin.dataset.routeStop);
        renderGoogleMapsPanel();
      };
      pin.addEventListener('click', focus);
      pin.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); focus(); }
      });
    });

    footer.innerHTML = `
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span class="inline-flex items-center gap-1 font-semibold text-pine"><span class="w-2 h-2 rounded-full bg-pine"></span>Focused Stop</span>
        <span class="inline-flex items-center gap-1"><span class="w-3 h-0.5 bg-pine"></span>Rental Car Drive</span>
        <span class="inline-flex items-center gap-1"><span class="w-3 h-0.5 bg-[#E08A1E]"></span>JR Hokuto Train</span>
        <span class="inline-flex items-center gap-1"><span class="w-3 border-t border-dashed border-inkMuted"></span>Domestic Flights</span>
      </div>
      <span class="text-inkMuted whitespace-nowrap">Tap any stop to zoom Google Maps below</span>
    `;
  }

  function renderGoogleMapsPanel() {
    if (!state.dataLoaded || !state.mapModalOpen) return;
    const isTokyo = state.mapTab === 'tokyo';
    const tabTokyo = document.getElementById('tab-map-tokyo');
    const tabRoute = document.getElementById('tab-map-route');

    [
      { el: tabTokyo, active: isTokyo },
      { el: tabRoute, active: !isTokyo },
    ].forEach(({ el, active }) => {
      if (!el) return;
      el.setAttribute('aria-selected', String(active));
      el.className = active
        ? 'map-tab-btn px-3 py-1.5 rounded-lg text-xs font-semibold bg-ink text-paper transition-colors cursor-pointer whitespace-nowrap'
        : 'map-tab-btn px-3 py-1.5 rounded-lg text-xs font-medium text-inkSoft hover:text-ink transition-colors cursor-pointer whitespace-nowrap';
    });

    const svgWrap = document.getElementById('svg-map-wrap');
    const gmapsWrap = document.getElementById('gmaps-embed-wrap');
    const zoomGroup = document.getElementById('map-zoom-group');

    document.querySelectorAll('.map-pane-btn').forEach((btn) => {
      const active = btn.dataset.paneMode === state.mapPaneMode;
      btn.className = active
        ? 'map-pane-btn px-2.5 py-1.5 rounded-lg text-[11.5px] font-semibold bg-pine text-white transition-colors cursor-pointer whitespace-nowrap'
        : 'map-pane-btn px-2.5 py-1.5 rounded-lg text-[11.5px] font-medium text-inkSoft hover:text-ink transition-colors cursor-pointer whitespace-nowrap';
    });

    if (state.mapPaneMode === 'split') {
      svgWrap.className = 'relative flex-[46] min-h-[190px] bg-paper border-b border-stoneLine overflow-hidden flex flex-col';
      gmapsWrap.className = 'relative flex-[54] min-h-[205px] bg-sand/40';
    } else if (state.mapPaneMode === 'svg') {
      svgWrap.className = 'relative flex-1 min-h-0 bg-paper overflow-hidden flex flex-col';
      gmapsWrap.className = 'hidden';
    } else {
      svgWrap.className = 'hidden';
      gmapsWrap.className = 'relative flex-1 min-h-0 bg-sand/40';
    }

    if (zoomGroup) {
      zoomGroup.classList.toggle('sm:inline-flex', state.mapPaneMode !== 'svg');
      zoomGroup.classList.toggle('hidden', state.mapPaneMode === 'svg');
    }
    document.querySelectorAll('.map-zoom-btn').forEach((btn) => {
      const active = Number(btn.dataset.mapZoom) === state.mapZoom;
      btn.className = active
        ? 'map-zoom-btn px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-sand text-ink transition-colors cursor-pointer whitespace-nowrap'
        : 'map-zoom-btn px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-inkSoft hover:text-ink transition-colors cursor-pointer whitespace-nowrap';
    });

    const gmapsIframe = document.getElementById('gmaps-iframe');
    const legendEl = document.getElementById('map-legend');
    const selectorLabel = document.getElementById('map-selector-label');
    const quickConfigWrap = document.getElementById('map-tokyo-quick-config');
    const cardsWrap = document.getElementById('map-selector-cards');

    if (isTokyo) {
      const stop7 = STOPS.find((s) => s.id === 7);
      const pickedOpt = getSelectedOptionForStop(stop7, state.mode);
      const nextSrc = gmapsEmbedUrl(pickedOpt.mapsQuery, state.mapZoom);
      if (state.mapPaneMode !== 'svg' && gmapsIframe.getAttribute('src') !== nextSrc) {
        gmapsIframe.setAttribute('src', nextSrc);
      }

      renderTokyoSvgMap(stop7);

      legendEl.innerHTML = `
        <div class="min-w-0 flex items-center gap-2">
          <span class="px-2 py-0.5 rounded-md text-[10.5px] font-semibold bg-pine text-white shrink-0">${pickedOpt.id}</span>
          <span class="font-medium text-ink truncate">${escapeHtml(pickedOpt.name)}</span>
          <span class="hidden sm:inline text-inkMuted truncate">· ${escapeHtml(pickedOpt.mapArea || '')}</span>
        </div>
        <div class="flex items-center gap-3 shrink-0">
          <a href="${pickedOpt.link}" target="_blank" rel="noopener noreferrer" class="font-medium text-inkSoft hover:text-ink underline underline-offset-2 whitespace-nowrap">Hotel Site ↗</a>
          <a href="${gmapsSearchUrl(pickedOpt.mapsQuery)}" target="_blank" rel="noopener noreferrer" class="font-semibold text-pine hover:underline underline-offset-2 whitespace-nowrap">Open in Google Maps ↗</a>
        </div>
      `;

      selectorLabel.textContent = `Stop 7 · ${stop7.city} (${stop7.options.length} Options) · Tap to pin & select`;

      if (stop7.hasStopConfigurator) {
        quickConfigWrap.classList.remove('hidden');
        quickConfigWrap.innerHTML = `
          <div class="inline-flex p-0.5 rounded-lg bg-white border border-stoneLine text-[10.5px]">
            <button type="button" data-modal-beds="twin" class="modal-s7-beds px-2 py-1 rounded-md cursor-pointer ${state.stop7Beds === 'twin' ? 'bg-pine text-white font-semibold' : 'text-inkSoft'}">Twin</button>
            <button type="button" data-modal-beds="double" class="modal-s7-beds px-2 py-1 rounded-md cursor-pointer ${state.stop7Beds === 'double' ? 'bg-pine text-white font-semibold' : 'text-inkSoft'}">Double</button>
          </div>
          <div class="inline-flex p-0.5 rounded-lg bg-white border border-stoneLine text-[10.5px]">
            <button type="button" data-modal-meal="ro" class="modal-s7-meal px-2 py-1 rounded-md cursor-pointer ${state.stop7Meal === 'ro' ? 'bg-pine text-white font-semibold' : 'text-inkSoft'}">Room Only</button>
            <button type="button" data-modal-meal="bf" class="modal-s7-meal px-2 py-1 rounded-md cursor-pointer ${state.stop7Meal === 'bf' ? 'bg-pine text-white font-semibold' : 'text-inkSoft'}">Breakfast</button>
          </div>
        `;
        quickConfigWrap.querySelectorAll('.modal-s7-beds').forEach((b) => {
          b.addEventListener('click', () => {
            if (state.stop7Beds !== b.dataset.modalBeds) {
              state.stop7Beds = b.dataset.modalBeds;
              renderAll(true);
            }
          });
        });
        quickConfigWrap.querySelectorAll('.modal-s7-meal').forEach((b) => {
          b.addEventListener('click', () => {
            if (state.stop7Meal !== b.dataset.modalMeal) {
              state.stop7Meal = b.dataset.modalMeal;
              renderAll(true);
            }
          });
        });
      } else {
        quickConfigWrap.classList.add('hidden');
      }

      cardsWrap.innerHTML = stop7.options.map((rawOpt) => {
        const opt = resolveOptionData(stop7, rawOpt);
        const isSelected = state.picks[7] === opt.id;
        const sgd = jpyToSgd(getOptionJpy(opt, state.mode));
        return `
          <button type="button" data-tokyo-opt="${opt.id}" class="map-tokyo-card w-full text-left p-3 rounded-xl border transition-all cursor-pointer ${isSelected ? 'bg-pine-light/85 border-pine ring-1 ring-pine/30' : 'bg-white border-stoneLine hover:border-inkMuted'}">
            <div class="flex items-center justify-between gap-2">
              <span class="text-xs font-semibold text-ink truncate">${opt.id} · ${opt.shortName}</span>
              <span class="font-serif text-base font-semibold text-ink tabular-nums shrink-0">${formatSgd(sgd)}</span>
            </div>
            <div class="flex items-center justify-between gap-2 mt-0.5">
              <span class="text-[11px] font-medium ${isSelected ? 'text-pine' : 'text-maple'} truncate">${opt.mapArea}</span>
              ${isSelected ? '<span class="px-1.5 py-0.5 rounded-full text-[9.5px] font-semibold bg-pine text-white shrink-0">Selected</span>' : ''}
            </div>
            <div class="text-[10.5px] text-inkSoft mt-1 leading-snug">${opt.transitLine || ''}</div>
          </button>
        `;
      }).join('');

      cardsWrap.querySelectorAll('.map-tokyo-card').forEach((btn) => {
        btn.addEventListener('click', () => {
          state.picks[7] = btn.dataset.tokyoOpt;
          renderAll(true);
        });
      });
    } else {
      quickConfigWrap.classList.add('hidden');
      const focusedStop = STOPS.find((s) => s.id === state.mapFocusedStopId) || STOPS[0];
      const focusedOpt = getSelectedOptionForStop(focusedStop, state.mode);
      const zoomForStop = state.mapZoom === 16 ? (focusedStop.id === 1 ? 15 : 16) : 13;
      const nextSrc = gmapsEmbedUrl(focusedOpt.mapsQuery, zoomForStop);
      if (state.mapPaneMode !== 'svg' && gmapsIframe.getAttribute('src') !== nextSrc) {
        gmapsIframe.setAttribute('src', nextSrc);
      }

      renderRouteSvgMap();

      legendEl.innerHTML = `
        <div class="min-w-0 flex items-center gap-2">
          <span class="px-2 py-0.5 rounded-md text-[10.5px] font-semibold bg-pine text-white shrink-0">Stop ${focusedStop.id}</span>
          <span class="font-medium text-ink truncate">${escapeHtml(focusedOpt.name)}</span>
        </div>
        <div class="flex items-center gap-3 shrink-0">
          <a href="${gmapsSearchUrl(focusedOpt.mapsQuery)}" target="_blank" rel="noopener noreferrer" class="font-semibold text-pine hover:underline underline-offset-2 whitespace-nowrap">Open Pin ↗</a>
          <a href="${CONFIG.hokkaidoDriveGmapsUrl}" target="_blank" rel="noopener noreferrer" class="font-semibold text-maple hover:underline underline-offset-2 whitespace-nowrap">Hokkaido Drive ↗</a>
        </div>
      `;

      selectorLabel.textContent = 'All 7 Stops · Tap any stop to inspect your selected hotel';

      cardsWrap.innerHTML = STOPS.map((stop) => {
        const opt = getSelectedOptionForStop(stop, state.mode);
        const isFocused = stop.id === focusedStop.id;
        const sgd = jpyToSgd(getOptionJpy(opt, state.mode));
        return `
          <button type="button" data-route-stop="${stop.id}" class="map-route-card w-full text-left p-2.5 rounded-xl border transition-all cursor-pointer ${isFocused ? 'bg-pine-light/85 border-pine ring-1 ring-pine/30' : 'bg-white border-stoneLine hover:border-inkMuted'}">
            <div class="flex items-center justify-between gap-2">
              <span class="text-xs font-semibold text-ink truncate">Stop ${stop.id} · ${stop.city.split(' ')[0]} (${stop.nights}N)</span>
              <span class="font-serif text-sm font-semibold text-ink tabular-nums shrink-0">${formatSgd(sgd)}</span>
            </div>
            <div class="text-[11px] font-medium ${isFocused ? 'text-pine' : 'text-inkSoft'} mt-0.5 truncate">${opt.shortName}</div>
            <div class="text-[10.5px] text-inkMuted mt-0.5 truncate">${opt.mapArea || stop.dates}</div>
          </button>
        `;
      }).join('');

      cardsWrap.querySelectorAll('.map-route-card').forEach((btn) => {
        btn.addEventListener('click', () => {
          state.mapFocusedStopId = Number(btn.dataset.routeStop);
          renderGoogleMapsPanel();
        });
      });
    }
  }

  // ===================================================================
  // PICKER RENDERING FUNCTIONS
  // ===================================================================
  function renderImportWarningBanner() {
    const banner = document.getElementById('import-warning-banner');
    if (!banner) return;
    if (!state.importWarning || !state.importWarning.unmatchedStops.length) {
      banner.classList.add('hidden');
      banner.innerHTML = '';
      return;
    }

    const skippedList = state.importWarning.unmatchedStops
      .map((item) => `<strong>Stop ${item.stopId}</strong> (${escapeHtml(item.hotelName)})`)
      .join(', ');
    const firstStopId = state.importWarning.unmatchedStops[0].stopId;

    banner.classList.remove('hidden');
    banner.innerHTML = `
      <div class="space-y-0.5 min-w-0">
        <div class="font-semibold text-amberWarm">Shared picks loaded — ${state.importWarning.unmatchedStops.length === 1 ? '1 retired hotel was skipped' : `${state.importWarning.unmatchedStops.length} retired hotels were skipped`}</div>
        <p class="text-inkSoft leading-relaxed">
          ${skippedList} ${state.importWarning.unmatchedStops.length === 1 ? 'is no longer on the current shortlist, so your existing pick there was kept unchanged.' : 'are no longer on the current shortlist, so your existing picks there were kept unchanged.'} Please choose a current option below.
        </p>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <button type="button" id="import-warn-jump-btn" class="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white hover:bg-paper text-ink border border-amberWarm-border transition-colors cursor-pointer whitespace-nowrap">
          Jump to Stop ${firstStopId} ↓
        </button>
        <button type="button" id="import-warn-dismiss-btn" class="w-7 h-7 rounded-full hover:bg-white/80 text-inkSoft hover:text-ink flex items-center justify-center cursor-pointer" aria-label="Dismiss notice">✕</button>
      </div>
    `;

    const jumpBtn = document.getElementById('import-warn-jump-btn');
    if (jumpBtn) {
      jumpBtn.addEventListener('click', () => {
        const target = document.getElementById(`stop-card-${firstStopId}`);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
    const dismissBtn = document.getElementById('import-warn-dismiss-btn');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => {
        state.importWarning = null;
        renderImportWarningBanner();
      });
    }
  }

  function renderModeAndFx() {
    ['M1', 'M2'].forEach((m) => {
      const btn = document.getElementById(`mode-btn-${m}`);
      if (!btn) return;
      const active = state.mode === m;
      btn.setAttribute('aria-checked', String(active));
      const dot = btn.querySelector('.mode-radio-dot');

      if (active) {
        btn.className = 'mode-card text-left p-4 sm:p-5 rounded-2xl border-2 border-pine bg-pine-light/55 shadow-[0_2px_12px_rgba(46,90,71,0.08)] transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-pine';
        dot.className = 'mode-radio-dot w-5 h-5 rounded-full border-2 border-pine bg-pine flex items-center justify-center shrink-0 mt-1';
        dot.innerHTML = '<span class="w-2 h-2 rounded-full bg-white"></span>';
      } else {
        btn.className = 'mode-card text-left p-4 sm:p-5 rounded-2xl border-2 border-stoneLine bg-white hover:border-inkMuted transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-pine';
        dot.className = 'mode-radio-dot w-5 h-5 rounded-full border-2 border-stoneLine bg-white flex items-center justify-center shrink-0 mt-1';
        dot.innerHTML = '';
      }
    });

    const stop1 = STOPS.find((s) => s.id === 1);
    const soloDeltaHaneda = stop1 && stop1.options.length >= 2
      ? jpyToSgd(getOptionJpy(stop1.options[1], 'M1')) - jpyToSgd(getOptionJpy(stop1.options[0], 'M1'))
      : 46;
    const m1DescEl = document.getElementById('mode-M1-desc');
    if (m1DescEl) {
      m1DescEl.innerHTML = `Sister shares the 3-pax room with Parents (<strong class="font-medium text-ink">3+2</strong>) on most stops, and gets her <strong class="font-medium text-ink">own solo room (2+2+1)</strong> where cheaper or built-in: <strong class="font-medium text-ink">Natulux</strong>, <strong class="font-medium text-ink">Hakodate</strong>, and <strong class="font-medium text-ink">Tokyo solo hotels</strong> (Sotetsu Fresa &amp; remm in Ginza/Hibiya/Kyobashi) — plus an optional +${formatSgd(soloDeltaHaneda)}/sib solo upgrade at Haneda.`;
    }

    const basePreset = PRESETS[0];
    const basePicks = basePreset.picks;
    const baseBeds = basePreset.stop7Beds || state.stop7Beds;
    const baseMeal = basePreset.stop7Meal || state.stop7Meal;
    const m1Base = computeTotalsForPicks(basePicks, 'M1', state.fxRate, baseBeds, baseMeal).hotelSgd;
    const m2Base = computeTotalsForPicks(basePicks, 'M2', state.fxRate, baseBeds, baseMeal).hotelSgd;
    document.getElementById('mode-diff-pill').textContent = `Both modes are only ~${formatSgd(Math.abs(m1Base - m2Base))}/sibling apart on baseline`;

    const isDefaultFx = Math.abs(state.fxRate - CONFIG.defaultFxRate) < 0.005;
    const fxInput = document.getElementById('fx-input');
    if (document.activeElement !== fxInput) fxInput.value = formatFx(state.fxRate);

    document.getElementById('fx-status-note').textContent = isDefaultFx
      ? 'Reference rate'
      : `Custom rate (ref: ¥${CONFIG.defaultFxRate})`;

    document.querySelectorAll('.fx-preset-btn').forEach((btn) => {
      const val = parseFloat(btn.dataset.fx);
      const isMatch = Math.abs(state.fxRate - val) < 0.005;
      btn.className = isMatch
        ? 'fx-preset-btn px-2.5 py-1 rounded-lg text-xs font-semibold bg-pine text-white border border-pine transition-colors cursor-pointer tabular-nums whitespace-nowrap'
        : 'fx-preset-btn px-2.5 py-1 rounded-lg text-xs font-medium bg-white text-inkSoft hover:text-ink border border-stoneLine transition-colors cursor-pointer tabular-nums whitespace-nowrap';
    });

    const stickyFxPill = document.getElementById('sticky-fx-pill');
    if (stickyFxPill) {
      stickyFxPill.innerHTML = `<span>¥${formatFx(state.fxRate)}</span>`;
      stickyFxPill.className = !isDefaultFx
        ? 'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amberWarm-light text-amberWarm border border-amberWarm-border transition-colors whitespace-nowrap tabular-nums'
        : 'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-sand text-inkSoft hover:text-ink border border-stoneLine transition-colors whitespace-nowrap tabular-nums';
    }

    const railFxPill = document.getElementById('rail-fx-pill');
    if (railFxPill) {
      railFxPill.textContent = `1 SGD = ¥${formatFx(state.fxRate)}`;
      railFxPill.className = !isDefaultFx
        ? 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amberWarm-light text-amberWarm border border-amberWarm-border transition-colors tabular-nums'
        : 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-white text-inkSoft hover:text-ink border border-stoneLine transition-colors tabular-nums';
    }

    document.getElementById('footer-footnote').textContent =
      `All figures are per-sibling SGD estimates (FX: 1 SGD = ${formatFx(state.fxRate)} JPY) using free-member Official/JAPANiCAN 2027 proxy rates with free cancellation and standard daily cleaning. Excludes parents' rooms and onsite local/onsen taxes. Mid-Oct Hokkaido foliage may add ~10–15% when actual dates open.`;
  }

  function renderPresets() {
    const container = document.getElementById('presets-container');
    const activePreset = getMatchingPreset();
    document.getElementById('custom-mix-badge').classList.toggle('hidden', Boolean(activePreset));

    container.innerHTML = PRESETS.map((preset) => {
      const pBeds = preset.stop7Beds || state.stop7Beds;
      const pMeal = preset.stop7Meal || state.stop7Meal;
      const totals = computeTotalsForPicks(preset.picks, state.mode, state.fxRate, pBeds, pMeal);
      const isActive = activePreset && activePreset.id === preset.id;
      return `
        <button type="button" data-preset-id="${preset.id}" class="preset-btn text-left p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-pine ${isActive ? 'border-pine bg-pine-light/60 shadow-[0_2px_12px_rgba(46,90,71,0.08)]' : 'border-stoneLine bg-white hover:border-inkMuted'}">
          <div>
            <div class="flex items-center justify-between gap-2">
              <span class="text-[10.5px] uppercase tracking-[0.12em] font-semibold ${isActive ? 'text-pine' : 'text-maple'}">${preset.tag}</span>
              ${isActive ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-pine text-white">Active</span>' : ''}
            </div>
            <h3 class="font-serif text-lg font-medium text-ink mt-1 leading-snug">${preset.name}</h3>
            <p class="text-xs text-inkSoft mt-1 leading-relaxed">${preset.desc}</p>
          </div>
          <div class="pt-2.5 border-t border-stoneLine/80 flex items-baseline justify-between gap-2">
            <span class="font-serif text-xl font-semibold text-ink tabular-nums">${formatSgd(totals.hotelSgd)}<span class="font-sans text-[11px] font-normal text-inkMuted"> /sib</span></span>
            <span class="text-[11px] text-inkMuted tabular-nums">Full ~${formatSgd(totals.fullTripSgd)}</span>
          </div>
        </button>
      `;
    }).join('');

    container.querySelectorAll('.preset-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const preset = PRESETS.find((p) => p.id === btn.dataset.presetId);
        if (!preset) return;
        const nextPicks = {};
        Object.keys(preset.picks).forEach((k) => { nextPicks[Number(k)] = preset.picks[k]; });
        state.picks = nextPicks;
        if (preset.stop7Beds) state.stop7Beds = preset.stop7Beds;
        if (preset.stop7Meal) state.stop7Meal = preset.stop7Meal;
        if (state.mode === 'M2') state.picks[1] = '1A';
        state.importWarning = null;
        renderAll(true);
        showToast(`Applied "${preset.name}" preset`);
      });
    });
  }

  function renderGuideDrawerHtml(stop) {
    const isOpen = Boolean(state.openGuideDrawers[stop.id]);
    const verdictText = resolveField(stop.guide.verdict, state.mode);

    const hotelsHtml = stop.guide.hotels.map((h) => `
      <div class="p-3.5 rounded-xl bg-white border border-stoneLine/80 space-y-2">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h4 class="font-serif text-base font-semibold text-ink">${h.name}</h4>
          ${h.videoUrl ? `<a href="${h.videoUrl}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-maple/10 text-maple hover:bg-maple/20 transition-colors">▶ ${h.videoLabel || 'Watch Walkthrough'} ↗</a>` : ''}
        </div>
        <p class="text-xs text-inkSoft leading-relaxed">${h.summary}</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-[11.5px] text-inkSoft">
          <div><strong class="text-ink font-medium">Location:</strong> ${h.location}</div>
          <div><strong class="text-ink font-medium">Baths:</strong> ${h.baths}</div>
          <div><strong class="text-ink font-medium">Meals:</strong> ${h.meals}</div>
          <div><strong class="text-ink font-medium">Facilities:</strong> ${h.facilities}</div>
        </div>
      </div>
    `).join('');

    return `
      <div class="mt-3">
        <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
          <button type="button" data-guide-stop="${stop.id}" class="guide-toggle-btn inline-flex items-center gap-1.5 text-xs font-medium text-pine hover:text-pine-dark transition-colors cursor-pointer">
            <span>${isOpen ? 'Hide' : 'Hotel Guide'} · Baths, Meals &amp; Verdict</span>
            <span class="text-[10px]">${isOpen ? '▲' : '▼'}</span>
          </button>
          <button type="button" data-math-stop="${stop.id}" class="math-toggle-btn inline-flex items-center gap-1.5 text-xs font-medium text-inkMuted hover:text-ink transition-colors cursor-pointer">
            <span>${state.openMathDrawers[stop.id] ? 'Hide' : 'Show'} exact math &amp; notes</span>
            <span class="text-[10px]">${state.openMathDrawers[stop.id] ? '▲' : '▼'}</span>
          </button>
        </div>
        ${isOpen ? `<div class="mt-3 p-4 rounded-xl bg-sand/55 border border-stoneLine space-y-3">${hotelsHtml}<div class="p-3 rounded-xl bg-pine-light/70 border border-pine-border text-xs text-ink leading-relaxed"><span class="font-semibold text-pine">How to decide:</span> ${verdictText}</div></div>` : ''}
      </div>
    `;
  }

  function renderMathDrawerHtml(stop, visibleOptions) {
    if (!state.openMathDrawers[stop.id]) return '';
    const bedsTag = state.stop7Beds === 'double' ? 'Shared Double' : 'Twin Beds';
    const mealTag = state.stop7Meal === 'bf' ? 'Breakfast Incl.' : 'Room Only';
    const variantSuffix = stop.hasStopConfigurator ? ` · ${bedsTag}, ${mealTag}` : '';

    return `
      <div class="mt-3 p-4 rounded-xl bg-paper border border-stoneLine space-y-2.5 text-xs text-inkSoft">
        <div class="text-[10.5px] uppercase tracking-[0.12em] font-semibold text-inkMuted">
          Exact Per-Sibling JPY &amp; Pool Math (FX: 1 SGD = ¥${formatFx(state.fxRate)}${variantSuffix})
        </div>
        ${visibleOptions.map((rawOpt) => {
          const opt = resolveOptionData(stop, rawOpt);
          const optJpy = getOptionJpy(opt, state.mode);
          return `
            <div class="pb-2 last:pb-0 border-b last:border-b-0 border-stoneLine/70">
              <div class="font-semibold text-ink">${opt.id} · ${opt.name} — ${formatJpy(optJpy)}/sib (${formatSgd(jpyToSgd(optJpy))})</div>
              <div class="mt-0.5 leading-relaxed">${resolveField(opt.mathNote, state.mode)}</div>
              <div class="mt-0.5 text-[11px] text-inkMuted">${resolveField(opt.proxyFootnote, state.mode)}</div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function renderStop7ConfiguratorHtml(stop) {
    if (!stop.hasStopConfigurator) return '';
    const bedSavingsHint = getStop7BedSavingsHint(stop);
    const bfCreditTotal = CONFIG.breakfastValueSgd * (stop.nights || 3);

    return `
      <div class="mb-4 p-3.5 sm:p-4 rounded-2xl bg-sand/70 border border-stoneLine">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          <div>
            <div class="flex flex-wrap items-center justify-between gap-1.5 mb-1.5">
              <span class="text-[10.5px] uppercase tracking-[0.12em] font-semibold text-inkMuted">Brothers’ Beds</span>
              <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-pine-light text-pine border border-pine-border tabular-nums">${bedSavingsHint}</span>
            </div>
            <div class="grid grid-cols-2 gap-1 p-1 rounded-xl bg-white border border-stoneLine" role="radiogroup" aria-label="Brothers Beds in Tokyo">
              <button type="button" data-s7-beds="twin" role="radio" aria-checked="${state.stop7Beds === 'twin'}" class="s7-beds-btn px-2.5 py-2 rounded-lg text-xs transition-all cursor-pointer text-center leading-tight ${state.stop7Beds === 'twin' ? 'bg-pine text-white font-semibold shadow-xs' : 'text-inkSoft hover:text-ink font-medium'}">
                2 Separate Beds (Twin)
              </button>
              <button type="button" data-s7-beds="double" role="radio" aria-checked="${state.stop7Beds === 'double'}" class="s7-beds-btn px-2.5 py-2 rounded-lg text-xs transition-all cursor-pointer text-center leading-tight ${state.stop7Beds === 'double' ? 'bg-pine text-white font-semibold shadow-xs' : 'text-inkSoft hover:text-ink font-medium'}">
                Shared Double Bed
              </button>
            </div>
          </div>

          <div>
            <div class="flex flex-wrap items-center justify-between gap-1.5 mb-1.5">
              <span class="text-[10.5px] uppercase tracking-[0.12em] font-semibold text-inkMuted">Tokyo Breakfast</span>
              <span class="px-2 py-0.5 rounded-full text-[10px] font-medium bg-paper text-inkSoft border border-stoneLine tabular-nums">Net −S$${bfCreditTotal} meals credit</span>
            </div>
            <div class="grid grid-cols-2 gap-1 p-1 rounded-xl bg-white border border-stoneLine" role="radiogroup" aria-label="Tokyo Breakfast Option">
              <button type="button" data-s7-meal="ro" role="radio" aria-checked="${state.stop7Meal === 'ro'}" class="s7-meal-btn px-2.5 py-2 rounded-lg text-xs transition-all cursor-pointer text-center leading-tight ${state.stop7Meal === 'ro' ? 'bg-pine text-white font-semibold shadow-xs' : 'text-inkSoft hover:text-ink font-medium'}">
                Room Only
              </button>
              <button type="button" data-s7-meal="bf" role="radio" aria-checked="${state.stop7Meal === 'bf'}" class="s7-meal-btn px-2.5 py-2 rounded-lg text-xs transition-all cursor-pointer text-center leading-tight ${state.stop7Meal === 'bf' ? 'bg-pine text-white font-semibold shadow-xs' : 'text-inkSoft hover:text-ink font-medium'}">
                With Breakfast (3m)
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderStops() {
    const container = document.getElementById('stops-container');

    container.innerHTML = STOPS.map((stop) => {
      const lockedNow = isStopLockedForMode(stop, state.mode);
      const transitHtml = `
        <div class="mb-2.5 flex items-center gap-2.5 text-xs text-inkMuted pl-1">
          <span class="text-maple font-semibold">↓</span>
          <span>${stop.transit}</span>
        </div>
      `;

      if (lockedNow) {
        const opt = resolveOptionData(stop, stop.options[0]);
        const sgd = jpyToSgd(getOptionJpy(opt, state.mode));
        const solo = isOptionSolo(opt, state.mode);
        const badgeText = resolveField(opt.roomBadge, state.mode);
        const breakdownText = resolveField(opt.roomBreakdown, state.mode);
        const highlightText = opt.highlight ? resolveField(opt.highlight, state.mode) : resolveField(opt.tradeOffs, state.mode)[0];
        const lockNote = stop.mode2LockNote ? resolveField(stop.mode2LockNote, state.mode) : null;

        return `
          <article id="stop-card-${stop.id}" class="stop-block scroll-mt-24 lg:scroll-mt-6" data-stop-id="${stop.id}">
            ${transitHtml}
            <div class="rounded-2xl bg-sand/60 border border-stoneLine p-5 sm:p-6">
              <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-ink text-paper text-xs font-semibold">${stop.id}</span>
                    <span class="text-[11px] uppercase tracking-[0.12em] font-semibold text-inkMuted">${stop.city} · ${stop.dates} · ${stop.nights}N</span>
                    <span class="px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-white text-ink border border-stoneLine">Locked In</span>
                    <span class="px-2 py-0.5 rounded-full text-[10.5px] font-medium ${solo ? 'bg-plum-light text-plum border border-plum-border' : 'bg-white text-inkSoft border border-stoneLine'}">${badgeText}</span>
                  </div>
                  <h3 class="font-serif text-xl sm:text-2xl font-medium text-ink mt-2 leading-snug">${opt.name}</h3>
                  <p class="text-xs text-inkSoft mt-1 leading-relaxed">${highlightText}</p>
                </div>
                <div class="sm:text-right shrink-0">
                  <div class="font-serif text-2xl sm:text-3xl font-semibold text-ink tabular-nums leading-none">${formatSgd(sgd)}</div>
                  <div class="text-[11px] text-inkMuted mt-1">per sibling · ${opt.mealTag}</div>
                </div>
              </div>

              <div class="mt-3.5 p-3 rounded-xl bg-white/85 border border-stoneLine/80 text-xs text-inkSoft">
                <span class="font-semibold text-ink">Room Setup:</span> ${breakdownText}
              </div>

              ${lockNote ? `<div class="mt-3 flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-paper border border-stoneLine/80 text-xs text-inkSoft"><span>${lockNote}</span><button type="button" class="switch-hybrid-btn text-xs font-semibold text-pine hover:underline underline-offset-2 cursor-pointer whitespace-nowrap">Switch to Hybrid →</button></div>` : ''}

              <div class="mt-3.5 flex flex-wrap items-center justify-between gap-3">
                <div class="flex flex-wrap items-center gap-4">
                  <a href="${opt.link}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-xs font-medium text-pine hover:text-pine-dark underline underline-offset-2">View Hotel &amp; Rooms ↗</a>
                  <a href="${gmapsSearchUrl(opt.mapsQuery)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-xs font-medium text-maple hover:underline underline-offset-2">Google Maps ↗</a>
                </div>
                <button type="button" data-pin-stop="${stop.id}" class="jump-stop-map-btn inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-white hover:bg-pine-light text-ink border border-stoneLine transition-colors cursor-pointer">📍 Show in Map Panel</button>
              </div>

              ${renderGuideDrawerHtml(stop)}
              ${renderMathDrawerHtml(stop, [opt])}
            </div>
          </article>
        `;
      }

      const visibleOptions = stop.id === 7
        ? stop.options
        : stop.options.filter((opt) => !(state.mode === 'M2' && opt.hideInMode2));
      const pickedId = state.picks[stop.id] || stop.baselineOptionId;
      const selectedOpt = resolveOptionData(stop, getOption(stop, pickedId));
      const selectedSgd = jpyToSgd(getOptionJpy(selectedOpt, state.mode));

      const optionsHtml = visibleOptions.map((rawOpt) => {
        const opt = resolveOptionData(stop, rawOpt);
        const isSelected = pickedId === opt.id;
        const sgd = jpyToSgd(getOptionJpy(opt, state.mode));
        const diffVsSelected = sgd - selectedSgd;
        const solo = isOptionSolo(opt, state.mode);
        const badgeText = resolveField(opt.roomBadge, state.mode);
        const breakdownText = resolveField(opt.roomBreakdown, state.mode);
        const bullets = resolveField(opt.tradeOffs, state.mode) || [];
        const rawWarningBadge = opt.warningBadge ? resolveField(opt.warningBadge, state.mode) : '';
        // Suppress scarcity/urgency badges (e.g. "1 Twin room left") so they don't distort decisions
        const warningBadgeText = /\b(left|remaining|hurry|almost\s*gone|last\s*room)\b/i.test(rawWarningBadge)
          ? ''
          : rawWarningBadge;
        const isMode2SoloOnly = stop.id === 7 && state.mode === 'M2' && (
          Boolean(opt.only221) || (Boolean(stop.hasStopConfigurator) && (isOptionSolo(opt, 'M2') || ['7C', '7D', '7E'].includes(opt.id)))
        );

        let deltaHtml = '';
        if (isSelected) {
          deltaHtml = '<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-pine text-white">✓ Selected (Base)</span>';
        } else if (diffVsSelected < 0) {
          deltaHtml = `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-pine-light text-pine border border-pine-border">−${formatSgd(Math.abs(diffVsSelected))} vs. selected</span>`;
        } else if (diffVsSelected > 0) {
          deltaHtml = `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amberWarm-light text-amberWarm border border-amberWarm-border">+${formatSgd(diffVsSelected)} vs. selected</span>`;
        } else {
          deltaHtml = '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-sand text-inkSoft border border-stoneLine">Same price</span>';
        }

        let mealNetHint = '';
        if (!isSelected && opt.breakfastMornings !== selectedOpt.breakfastMornings) {
          const mealAdj = (selectedOpt.breakfastMornings - opt.breakfastMornings) * CONFIG.breakfastValueSgd;
          const netDiff = diffVsSelected + mealAdj;
          const sign = netDiff > 0 ? '+' : netDiff < 0 ? '−' : '';
          mealNetHint = `<div class="text-[10.5px] text-inkMuted mt-0.5">Net w/ meals budget: ${sign}${formatSgd(Math.abs(netDiff))}</div>`;
        }

        return `
          <div role="button" tabindex="0" data-stop-id="${stop.id}" data-opt-id="${opt.id}" class="option-card group rounded-2xl border-2 p-4 sm:p-5 transition-all cursor-pointer flex flex-col justify-between gap-3.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-pine ${isSelected ? 'border-pine bg-pine-light/45 shadow-[0_3px_14px_rgba(46,90,71,0.10)]' : 'border-stoneLine bg-white hover:border-inkMuted'}">
            <div>
              <div class="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                <div class="flex flex-wrap items-center gap-1.5">
                  <span class="px-2 py-0.5 rounded-md text-[10.5px] font-semibold bg-sand text-inkSoft">${opt.id}</span>
                  <span class="px-2 py-0.5 rounded-full text-[10.5px] font-medium ${solo ? 'bg-plum-light text-plum border border-plum-border' : 'bg-paper text-inkSoft border border-stoneLine'}">${badgeText}</span>
                  ${isMode2SoloOnly && String(badgeText || '').toLowerCase() !== '2+2+1 only' ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-plum-light text-plum border border-plum-border">2+2+1 Only</span>' : ''}
                </div>
                ${deltaHtml}
              </div>

              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <h4 class="font-serif text-lg sm:text-xl font-medium text-ink leading-snug">${opt.name}</h4>
                  <span class="inline-block mt-1 text-[11px] font-medium text-inkMuted">${opt.mealTag}</span>
                </div>
                <div class="text-right shrink-0">
                  <div class="font-serif text-2xl sm:text-3xl font-semibold text-ink tabular-nums leading-none">${formatSgd(sgd)}</div>
                  <div class="text-[11px] text-inkMuted mt-1 whitespace-nowrap">per sibling</div>
                  ${mealNetHint}
                </div>
              </div>

              ${warningBadgeText ? `<div class="mt-2"><span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-semibold bg-amberWarm-light text-amberWarm border border-amberWarm-border">⚠ ${escapeHtml(warningBadgeText)}</span></div>` : ''}

              <div class="mt-3 p-2.5 rounded-xl bg-paper/90 border border-stoneLine/80 text-[11.5px] text-inkSoft leading-relaxed">
                <span class="font-semibold text-ink">Rooms:</span> ${breakdownText}
              </div>

              <ul class="mt-3 space-y-1.5 text-xs text-inkSoft">
                ${bullets.map((b) => `<li class="flex items-start gap-2 leading-relaxed"><span class="text-maple mt-0.5 shrink-0">•</span><span>${b}</span></li>`).join('')}
              </ul>
            </div>

            <div class="pt-3 border-t border-stoneLine/70 flex flex-wrap items-center justify-between gap-2">
              <div class="flex flex-wrap items-center gap-3">
                <a href="${opt.link}" target="_blank" rel="noopener noreferrer" class="ext-link inline-flex items-center gap-1 text-xs font-medium text-pine hover:text-pine-dark underline underline-offset-2">View Hotel &amp; Rooms ↗</a>
                <a href="${gmapsSearchUrl(opt.mapsQuery)}" target="_blank" rel="noopener noreferrer" class="ext-link inline-flex items-center gap-1 text-xs font-medium text-maple hover:underline underline-offset-2">Google Maps ↗</a>
                ${opt.secondaryLink ? `<a href="${opt.secondaryLink}" target="_blank" rel="noopener noreferrer" class="ext-link inline-flex items-center gap-1 text-xs font-medium text-inkSoft hover:text-ink underline underline-offset-2">${opt.secondaryLinkLabel || 'More Photos ↗'}</a>` : ''}
              </div>
              <span class="text-[11px] font-medium ${isSelected ? 'text-pine' : 'text-inkMuted group-hover:text-ink'}">${isSelected ? 'Selected' : 'Tap to select'}</span>
            </div>
          </div>
        `;
      }).join('');

      return `
        <article id="stop-card-${stop.id}" class="stop-block scroll-mt-24 lg:scroll-mt-6" data-stop-id="${stop.id}">
          ${transitHtml}
          <div class="rounded-2xl bg-white/90 border border-stoneLine p-5 sm:p-6 shadow-[0_1px_10px_rgba(30,33,31,0.03)]">
            <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-2 mb-4">
              <div>
                <div class="flex flex-wrap items-center gap-2">
                  <span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-maple text-white text-xs font-semibold">${stop.id}</span>
                  <span class="text-[11px] uppercase tracking-[0.14em] font-semibold text-maple">Stop ${stop.id} · ${stop.dates} · ${stop.nights} ${stop.nights === 1 ? 'Night' : 'Nights'}</span>
                </div>
                <h3 class="font-serif text-2xl sm:text-[26px] font-medium text-ink mt-1.5 leading-snug">${stop.city}</h3>
                <p class="text-xs sm:text-[13px] text-inkSoft mt-1 leading-relaxed">${stop.routeNote}</p>
              </div>
              <button type="button" data-pin-stop="${stop.id}" class="jump-stop-map-btn inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-sand hover:bg-pine-light text-ink border border-stoneLine transition-colors self-start shrink-0 cursor-pointer">
                📍 ${stop.id === 7 ? 'Compare on Google Maps' : 'View on Google Maps'}
              </button>
            </div>

            ${renderStop7ConfiguratorHtml(stop)}

            <div class="grid grid-cols-1 ${stop.gridCols || 'md:grid-cols-2'} gap-3.5">${optionsHtml}</div>
            ${stop.subtleAreaNote ? `<p class="mt-3.5 text-xs italic text-inkMuted">${stop.subtleAreaNote}</p>` : ''}
            ${renderGuideDrawerHtml(stop)}
            ${renderMathDrawerHtml(stop, visibleOptions)}
          </div>
        </article>
      `;
    }).join('');

    // Bind Stop 7 Configurator toggle pills
    container.querySelectorAll('.s7-beds-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const nextBeds = btn.dataset.s7Beds;
        if (state.stop7Beds !== nextBeds) {
          state.stop7Beds = nextBeds;
          renderAll(true);
        }
      });
    });
    container.querySelectorAll('.s7-meal-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const nextMeal = btn.dataset.s7Meal;
        if (state.stop7Meal !== nextMeal) {
          state.stop7Meal = nextMeal;
          renderAll(true);
        }
      });
    });

    // Bind option card interactions
    container.querySelectorAll('.option-card').forEach((card) => {
      const selectCard = () => {
        const stopId = Number(card.dataset.stopId);
        const optId = card.dataset.optId;
        if (state.picks[stopId] !== optId) {
          state.picks[stopId] = optId;
          // Clear any retired-stop warning once the user picks a new option at that stop
          if (state.importWarning && state.importWarning.unmatchedStops.some((u) => u.stopId === stopId)) {
            state.importWarning.unmatchedStops = state.importWarning.unmatchedStops.filter((u) => u.stopId !== stopId);
            if (state.importWarning.unmatchedStops.length === 0) state.importWarning = null;
          }
          renderAll(true);
        }
      };
      card.addEventListener('click', selectCard);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectCard(); }
      });
    });

    container.querySelectorAll('.ext-link').forEach((link) => link.addEventListener('click', (e) => e.stopPropagation()));
    container.querySelectorAll('.guide-toggle-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.guideStop);
        state.openGuideDrawers[id] = !state.openGuideDrawers[id];
        renderStops();
      });
    });
    container.querySelectorAll('.math-toggle-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.mathStop);
        state.openMathDrawers[id] = !state.openMathDrawers[id];
        renderStops();
      });
    });
    container.querySelectorAll('.jump-stop-map-btn').forEach((btn) => {
      btn.addEventListener('click', () => openMapForStop(Number(btn.dataset.pinStop)));
    });
    container.querySelectorAll('.switch-hybrid-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.mode = 'M1';
        renderAll(true);
        showToast('Switched to Mode 1 (Hybrid)');
      });
    });
  }

  function renderTotalsAndSummary(animate = false) {
    const totals = computeTotalsForPicks(state.picks, state.mode);
    const basePreset = PRESETS[0];
    const baselineTotals = computeTotalsForPicks(
      basePreset.picks,
      state.mode,
      state.fxRate,
      basePreset.stop7Beds || state.stop7Beds,
      basePreset.stop7Meal || state.stop7Meal
    );
    const diffHotelsVsBase = totals.hotelSgd - baselineTotals.hotelSgd;
    const activePreset = getMatchingPreset();

    // Mobile Sticky Bar
    const stickyHotelEl = document.getElementById('sticky-hotel-total');
    if (stickyHotelEl) {
      stickyHotelEl.textContent = formatSgd(totals.hotelSgd);
      document.getElementById('sticky-per-night').textContent = `~S$${totals.perNightSgd} / night`;
      document.getElementById('sticky-full-trip').textContent = formatSgd(totals.fullTripSgd);
      document.getElementById('sticky-solo-text').textContent = `Sister solo: ${totals.soloNights}/${CONFIG.totalNights} nt`;
      if (animate) {
        stickyHotelEl.classList.remove('num-flash');
        void stickyHotelEl.offsetWidth;
        stickyHotelEl.classList.add('num-flash');
      }
    }

    // Bottom Summary Section
    document.getElementById('summary-mode-pill').textContent =
      state.mode === 'M1' ? 'Mode 1 · Hybrid (3+2 + Solo where cheaper)' : 'Mode 2 · All 3+2 (Sister Always Shares w/ Parents)';
    document.getElementById('summary-vibe-pill').textContent = activePreset ? activePreset.name : 'Custom Mix';

    const stopsList = totals.soloStopNames.length > 0 ? ` (${totals.soloStopNames.join(', ')})` : ' (always shares 3-pax room w/ Parents)';
    document.getElementById('summary-solo-breakdown').textContent = `Sister solo room: ${totals.soloNights} of ${CONFIG.totalNights} nights${stopsList}`;

    document.getElementById('summary-rows').innerHTML = STOPS.map((stop) => {
      const lockedNow = isStopLockedForMode(stop, state.mode);
      const opt = getSelectedOptionForStop(stop, state.mode);
      const sgd = jpyToSgd(getOptionJpy(opt, state.mode));
      const solo = isOptionSolo(opt, state.mode);
      const breakdown = resolveField(opt.roomBreakdown, state.mode);

      return `
        <div class="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2 text-[11px] text-inkMuted">
              <span class="font-semibold text-maple">Stop ${stop.id} · ${stop.city}</span>
              <span>·</span>
              <span>${stop.dates} (${stop.nights}N)</span>
              ${lockedNow ? '<span class="px-1.5 py-0.5 rounded bg-sand text-inkSoft font-medium">Locked</span>' : ''}
              ${solo ? '<span class="px-1.5 py-0.5 rounded bg-plum-light text-plum font-medium">Sister Solo</span>' : ''}
            </div>
            <div class="font-serif text-base sm:text-lg font-medium text-ink mt-0.5">${opt.name}</div>
            <div class="text-xs text-inkSoft mt-0.5">${breakdown}</div>
          </div>
          <div class="sm:text-right shrink-0">
            <div class="font-serif text-xl font-semibold text-ink tabular-nums">${formatSgd(sgd)}</div>
            <div class="text-[11px] text-inkMuted">${opt.mealTag}</div>
          </div>
        </div>
      `;
    }).join('');

    // Full Trip Breakdown Card
    document.getElementById('bd-hotel-val').textContent = formatSgd(totals.hotelSgd);
    document.getElementById('bd-hotel-sub').textContent = `Siblings’ room pool ÷ 3 siblings · ~S$${totals.perNightSgd}/night`;
    document.getElementById('bd-meals-val').textContent = formatSgd(totals.mealsNetSgd);
    document.getElementById('bd-bf-label').textContent = `Less hotel breakfasts covered (S$${CONFIG.breakfastValueSgd} × ${totals.breakfastMornings} mornings)`;
    document.getElementById('bd-bf-val').textContent = `−${formatSgd(totals.bfDeductSgd)}`;
    document.getElementById('bd-hb-label').textContent = `Less half-board dinners covered (S$${CONFIG.halfBoardDinnerValueSgd} × ${totals.halfBoardDinners} nights)`;
    document.getElementById('bd-hb-val').textContent = `−${formatSgd(totals.hbDeductSgd)}`;
    document.getElementById('bd-full-total').textContent = formatSgd(totals.fullTripSgd);
    document.getElementById('bd-fx-caption').textContent = `At 1 SGD = ¥${formatFx(state.fxRate)} JPY · excl. variable personal items`;

    // Desktop Sticky Companion Rail
    const railHotelEl = document.getElementById('rail-hotel-total');
    if (railHotelEl) {
      railHotelEl.textContent = formatSgd(totals.hotelSgd);
      document.getElementById('rail-per-night').textContent = `~S$${totals.perNightSgd} / night`;
      document.getElementById('rail-full-trip').textContent = formatSgd(totals.fullTripSgd);
      document.getElementById('rail-solo-text').textContent = `Solo: ${totals.soloNights}/${CONFIG.totalNights} nt`;

      if (animate) {
        railHotelEl.classList.remove('num-flash');
        void railHotelEl.offsetWidth;
        railHotelEl.classList.add('num-flash');
      }

      const railVsEl = document.getElementById('rail-vs-baseline');
      if (diffHotelsVsBase === 0) {
        railVsEl.className = 'mt-1.5 text-[11px] font-medium text-inkMuted';
        railVsEl.textContent = 'Matches Comfort Baseline hotel total';
      } else if (diffHotelsVsBase < 0) {
        railVsEl.className = 'mt-1.5 text-[11px] font-semibold text-pine';
        railVsEl.textContent = `Saves ${formatSgd(Math.abs(diffHotelsVsBase))}/sib vs. Comfort Baseline`;
      } else {
        railVsEl.className = 'mt-1.5 text-[11px] font-semibold text-amberWarm';
        railVsEl.textContent = `+${formatSgd(diffHotelsVsBase)}/sib vs. Comfort Baseline`;
      }

      document.getElementById('rail-mode-pill').textContent = state.mode === 'M1' ? 'Mode 1 · Hybrid' : 'Mode 2 · All 3+2';
      document.getElementById('rail-vibe-pill').textContent = activePreset ? activePreset.name : 'Custom Mix';

      const railStopList = document.getElementById('rail-stop-list');
      railStopList.innerHTML = STOPS.map((stop) => {
        const lockedNow = isStopLockedForMode(stop, state.mode);
        const opt = getSelectedOptionForStop(stop, state.mode);
        const sgd = jpyToSgd(getOptionJpy(opt, state.mode));
        const solo = isOptionSolo(opt, state.mode);
        const shortCity = stop.city.split(' ')[0];

        return `
          <button type="button" data-jump-stop="${stop.id}" class="rail-stop-jump w-full text-left px-3 py-2 hover:bg-white transition-colors flex items-center justify-between gap-2 cursor-pointer">
            <div class="min-w-0 flex items-center gap-2">
              <span class="w-4 h-4 rounded-full text-[10px] font-semibold flex items-center justify-center shrink-0 ${lockedNow ? 'bg-ink text-paper' : 'bg-maple/15 text-maple'}">${stop.id}</span>
              <div class="min-w-0">
                <div class="text-xs font-medium text-ink truncate">${opt.shortName}</div>
                <div class="text-[10.5px] text-inkMuted flex items-center gap-1.5">
                  <span>${shortCity} · ${stop.nights}N</span>
                  ${solo ? '<span class="inline-flex items-center gap-1 text-plum font-medium"><span class="w-1.5 h-1.5 rounded-full bg-plum"></span>Solo</span>' : ''}
                  ${lockedNow ? '<span class="text-pine">· Locked</span>' : ''}
                </div>
              </div>
            </div>
            <span class="font-serif text-sm font-semibold text-ink tabular-nums shrink-0">${formatSgd(sgd)}</span>
          </button>
        `;
      }).join('');

      railStopList.querySelectorAll('.rail-stop-jump').forEach((btn) => {
        btn.addEventListener('click', () => {
          const target = document.getElementById(`stop-card-${btn.dataset.jumpStop}`);
          if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });

      document.getElementById('rail-bd-hotels').textContent = formatSgd(totals.hotelSgd);
      document.getElementById('rail-bd-meals').textContent = formatSgd(totals.mealsNetSgd);
      document.getElementById('rail-bd-bf-label').textContent = `Hotel breakfasts (S$${CONFIG.breakfastValueSgd} × ${totals.breakfastMornings})`;
      document.getElementById('rail-bd-bf-val').textContent = `−${formatSgd(totals.bfDeductSgd)}`;
      document.getElementById('rail-bd-hb-label').textContent = `Half-board dinners (S$${CONFIG.halfBoardDinnerValueSgd} × ${totals.halfBoardDinners})`;
      document.getElementById('rail-bd-hb-val').textContent = `−${formatSgd(totals.hbDeductSgd)}`;
      document.getElementById('rail-bd-total').textContent = formatSgd(totals.fullTripSgd);
    }
  }

  function renderDirectory() {
    const count = DIRECTORY.length;
    const heroHotelCountEl = document.getElementById('hero-hotel-count');
    if (heroHotelCountEl) heroHotelCountEl.textContent = `${count} Hotels`;
    const dirHeadingEl = document.getElementById('directory-heading');
    if (dirHeadingEl) dirHeadingEl.textContent = `Explore All ${count} Hotels`;

    document.getElementById('directory-container').innerHTML = DIRECTORY.map((item) => `
      <div class="p-4 rounded-2xl bg-white border border-stoneLine flex flex-col justify-between gap-2.5">
        <div>
          <div class="text-[10.5px] uppercase tracking-[0.12em] font-semibold text-maple">${item.stop}</div>
          <h3 class="font-serif text-base sm:text-lg font-medium text-ink mt-1 leading-snug">${item.name}</h3>
          <p class="text-xs text-inkSoft mt-0.5">${item.note}</p>
        </div>
        <div class="pt-2 border-t border-stoneLine/70 flex flex-wrap items-center gap-3 text-xs">
          <a href="${item.url}" target="_blank" rel="noopener noreferrer" class="font-medium text-pine hover:text-pine-dark underline underline-offset-2">Official Page ↗</a>
          <a href="${gmapsSearchUrl(item.mapsQuery)}" target="_blank" rel="noopener noreferrer" class="font-medium text-maple hover:underline underline-offset-2">Google Maps ↗</a>
          ${item.extraUrl ? `<a href="${item.extraUrl}" target="_blank" rel="noopener noreferrer" class="font-medium text-inkSoft hover:text-ink underline underline-offset-2">${item.extraLabel}</a>` : ''}
        </div>
      </div>
    `).join('');
  }

  function renderAll(animate = false) {
    if (!state.dataLoaded) return;
    renderImportWarningBanner();
    renderModeAndFx();
    renderPresets();
    renderStops();
    renderTotalsAndSummary(animate);
    renderGoogleMapsPanel();

    if (global.HokkaidoAuditModule) {
      global.HokkaidoAuditModule.syncFx();
      if (state.activeView === 'audit') {
        global.HokkaidoAuditModule.render();
      }
    }
  }

  // ===================================================================
  // TOAST, CLIPBOARD, EXPORT & PASTE-TO-LOAD SHARED PICKS
  // ===================================================================
  function showToast(message, durationMs = 2800) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.remove('opacity-0', 'translate-y-2');
    toast.classList.add('opacity-100', 'translate-y-0');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('opacity-100', 'translate-y-0');
      toast.classList.add('opacity-0', 'translate-y-2');
    }, durationMs);
  }

  function copyTextToClipboard(text) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-9999px';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return Boolean(ok);
    } catch (err) {
      return false;
    }
  }

  function buildExportText() {
    const totals = computeTotalsForPicks(state.picks, state.mode);
    const activePreset = getMatchingPreset();
    const modeTitle = state.mode === 'M1'
      ? 'Mode 1 · Hybrid (Parents + Sister 3+2, or Solo Where Cheaper)'
      : 'Mode 2 · All 3+2 (Sister Always Shares w/ Parents)';
    const bedsLabel = state.stop7Beds === 'double' ? 'Shared Double Bed' : 'Twin Beds';
    const mealLabel = state.stop7Meal === 'bf' ? 'With Breakfast (3m)' : 'Room Only';
    const stop7Obj = STOPS.find((s) => s.id === 7);

    const lines = [
      'HOKKAIDO + TOKYO 2027 — HOTEL PICKS (Oct 15–31, 2027)',
      `Rooming Mode: ${modeTitle}`,
      `Preset / Mix: ${activePreset ? activePreset.name : 'Custom Mix'}`,
      ...(stop7Obj && stop7Obj.hasStopConfigurator ? [`Tokyo Setup: ${bedsLabel} · ${mealLabel}`] : []),
      `Exchange Rate: 1 SGD = ¥${formatFx(state.fxRate)} JPY`,
      '',
      '--- 7 STOPS (PER-SIBLING SGD) ---',
    ];

    STOPS.forEach((stop) => {
      const opt = getSelectedOptionForStop(stop, state.mode);
      const sgd = jpyToSgd(getOptionJpy(opt, state.mode));
      const breakdown = resolveField(opt.roomBreakdown, state.mode);
      lines.push(`Stop ${stop.id} · ${stop.city} (${stop.dates}, ${stop.nights}N): [${opt.id}] ${opt.name} — ${formatSgd(sgd)}/sib [${opt.mealTag}]`);
      lines.push(`   Rooms: ${breakdown}`);
    });

    const soloDetail = totals.soloStopNames.length > 0
      ? ` (${totals.soloStopNames.join(', ')})`
      : ' (shares 3-pax room w/ Parents on all stops)';

    lines.push(
      '',
      '--- ESTIMATED PER-SIBLING TOTALS ---',
      `16-Night Hotels: ${formatSgd(totals.hotelSgd)} / sibling (~S$${totals.perNightSgd} / night)`,
      `Sister Solo Room: ${totals.soloNights} of ${CONFIG.totalNights} nights${soloDetail}`,
      `Flights (est.): ${formatSgd(CONFIG.flightsEstSgd)}`,
      `Meals & Personal Spending (17d net): ${formatSgd(totals.mealsNetSgd)} (S$${totals.grossMealsSgd} gross − S$${totals.bfDeductSgd} for ${totals.breakfastMornings} hotel breakfasts − S$${totals.hbDeductSgd} for ${totals.halfBoardDinners} half-board dinners)`,
      'Rental Car: S$0',
      `Est. Full Trip Total: ${formatSgd(totals.fullTripSgd)} / sibling (excl. own attractions, insurance, SIM & personal transport)`
    );

    return lines.join('\n');
  }

  /**
   * Extracts the human-readable hotel name from a shared summary line like:
   * "Stop 7 · Tokyo (Ueno / Asakusa) (Oct 28–31, 3N): [7B] Super Hotel Ueno-Okachimachi — S$393/sib [Free Breakfast]"
   */
  function extractHotelNameFromStopLine(line) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) return line.trim();
    const afterColon = line.slice(colonIdx + 1).trim();
    return afterColon
      .replace(/^\[[^\]]+\]\s*/, '')
      .replace(/\s*[—–-]\s*S\$\d[\d,]*.*$/i, '')
      .replace(/\s*\[[^\]]+\]\s*$/, '')
      .trim() || afterColon;
  }

  /**
   * Parses a pasted share text blob and returns detected mode, FX rate, Stop 7 toggles,
   * matched stops, and any retired/unmatched stops (left unchanged rather than silently remapped).
   */
  function parseSharedPicksText(rawText) {
    const text = String(rawText || '').trim();
    if (!text) return { ok: false, reason: 'Please paste a shared summary first.' };

    let detectedMode = null;
    if (/mode\s*2|all\s*3\+2|always\s*shares/i.test(text)) detectedMode = 'M2';
    else if (/mode\s*1|hybrid/i.test(text)) detectedMode = 'M1';

    let detectedFx = null;
    const fxMatch = text.match(/1\s*SGD\s*=\s*[¥￥]?\s*(\d+(?:\.\d+)?)/i);
    if (fxMatch) {
      const parsedFx = parseFloat(fxMatch[1]);
      if (!isNaN(parsedFx) && parsedFx >= 60 && parsedFx <= 220) detectedFx = parsedFx;
    }

    let detectedStop7Beds = null;
    let detectedStop7Meal = null;
    const tokyoSetupMatch = text.match(/tokyo\s*setup\s*:\s*([^\r\n]+)/i);
    if (tokyoSetupMatch) {
      const setupLine = tokyoSetupMatch[1];
      if (/double/i.test(setupLine)) detectedStop7Beds = 'double';
      else if (/twin|separate\s*beds/i.test(setupLine)) detectedStop7Beds = 'twin';
      if (/breakfast|\bbf\b/i.test(setupLine)) detectedStop7Meal = 'bf';
      else if (/room\s*only|\bro\b/i.test(setupLine)) detectedStop7Meal = 'ro';
    }

    let matchedPreset = null;
    if (/smart\s*value/i.test(text) && PRESETS[1]) matchedPreset = PRESETS[1];
    else if (/budget[\s-]*friendly/i.test(text) && PRESETS[2]) matchedPreset = PRESETS[2];
    else if (/comfort\s*baseline/i.test(text) && PRESETS[0]) matchedPreset = PRESETS[0];
    const basePicks = matchedPreset ? { ...matchedPreset.picks } : {};

    const detectedPicks = {};
    const presentDecisionStops = new Set();
    const unmatchedStops = [];
    const lines = text.split(/\r?\n/);

    // Helper: finds an option in `stop.options` whose name/shortName matches `regex` (no blind fallback ID)
    function findOptionStrictly(stop, regex) {
      const found = stop.options.find((o) => regex.test(o.name) || regex.test(o.shortName || ''));
      return found ? found.id : null;
    }

    // Detects retired Tokyo hotels (e.g. Ueno / Okachimachi / Asakusa) that no longer exist in Stop 7
    function isRetiredTokyoHotelLine(stop, line) {
      const retiredChecks = [
        /okachimachi/i,
        /mitsui\s*garden.*ueno|\bueno\b/i,
        /dormy\s*inn.*asakusa|\basakusa\b/i,
      ];
      return retiredChecks.some((rx) => rx.test(line) && !findOptionStrictly(stop, rx));
    }

    function matchOptionForStop(stop, line) {
      const lower = line.toLowerCase();

      // 1. Exact hotel name / shortName match against current options
      for (const opt of stop.options) {
        if (lower.includes(opt.name.toLowerCase()) || (opt.shortName && lower.includes(opt.shortName.toLowerCase()))) {
          return opt.id;
        }
      }

      // 2. For Stop 7, refuse to remap retired Ueno / Okachimachi / Asakusa hotels to new Ginza slots
      if (stop.id === 7 && isRetiredTokyoHotelLine(stop, line)) {
        return null;
      }

      // 3. Stop-specific hotel name matching (strictly against current options)
      if (stop.id === 1) {
        if (/solo/i.test(line)) return findOptionStrictly(stop, /solo/i) || (stop.options.some((o) => o.id === '1B') ? '1B' : null);
        if (/shared|3\+2|haneda/i.test(line)) return findOptionStrictly(stop, /shared|3\+2/i) || (stop.options.some((o) => o.id === '1A') ? '1A' : null);
      } else if (stop.id === 2) {
        const isRo = /room\s*only|\(ro\)/i.test(line);
        if (/natulux/i.test(line)) return isRo ? '2B_RO' : '2B_BF';
        if (/la\s*vista/i.test(line)) return isRo ? '2A_RO' : '2A_BF';
      } else if (stop.id === 3) {
        if (/tamanoyu/i.test(line)) return /wagyu/i.test(line) ? '3B_WAGYU' : '3B_STD';
        if (/takinoya/i.test(line)) return '3A';
      } else if (stop.id === 4) {
        if (/spa\s*resort|36\.8|spa\s*\(/i.test(line)) return '4B';
        if (/club|56\s*m|nonokaze/i.test(line)) return '4A';
      } else if (stop.id === 7) {
        if (/gracery/i.test(line)) return findOptionStrictly(stop, /gracery/i);
        if (/super\s*hotel/i.test(line)) return findOptionStrictly(stop, /super\s*hotel/i);
        if (/sotetsu|fresa/i.test(line)) return findOptionStrictly(stop, /sotetsu|fresa/i);
        if (/remm\s*.*kyobashi|\bkyobashi\b/i.test(line)) return findOptionStrictly(stop, /kyobashi/i);
        if (/remm\s*.*hibiya|\bhibiya\b/i.test(line)) return findOptionStrictly(stop, /hibiya/i);
        if (/mitsui/i.test(line)) return findOptionStrictly(stop, /mitsui/i);
        if (/dormy/i.test(line)) return findOptionStrictly(stop, /dormy/i);
      }

      // 4. Explicit bracketed option ID match (e.g. [7B]) only if no conflicting retired name was detected
      for (const opt of stop.options) {
        const escapedId = opt.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const idRegex = new RegExp(`(?:\\[|\\b)${escapedId}(?:\\]|\\b)`, 'i');
        if (idRegex.test(line)) return opt.id;
      }

      return null;
    }

    const decisionStopIds = [1, 2, 3, 4, 7];
    lines.forEach((line, idx) => {
      const stopMatch = line.match(/stop\s*([1-7])\b/i);
      if (!stopMatch) return;
      const stopId = Number(stopMatch[1]);
      if (!decisionStopIds.includes(stopId)) return;
      const stop = STOPS.find((s) => s.id === stopId);
      if (!stop) return;

      presentDecisionStops.add(stopId);
      const matchedId = matchOptionForStop(stop, line);

      if (matchedId) {
        detectedPicks[stopId] = matchedId;
        // Infer Stop 7 bed/meal setup ONLY when Stop 7 actually matched a current hotel
        if (stopId === 7) {
          const nextLine = lines[idx + 1] && /rooms\s*:/i.test(lines[idx + 1]) ? lines[idx + 1] : '';
          const combined = `${line} ${nextLine}`;
          if (!detectedStop7Meal) {
            if (/breakfast|\bbf\b/i.test(line)) detectedStop7Meal = 'bf';
            else if (/room\s*only|\bro\b/i.test(line)) detectedStop7Meal = 'ro';
          }
          if (!detectedStop7Beds) {
            if (/shared\s*double|brothers[^·\n]*double/i.test(combined)) detectedStop7Beds = 'double';
            else if (/twin|2\s*separate\s*beds/i.test(combined)) detectedStop7Beds = 'twin';
          }
        }
      } else {
        unmatchedStops.push({
          stopId,
          city: stop.city,
          hotelName: extractHotelNameFromStopLine(line),
        });
      }
    });

    const matchedStopCount = Object.keys(detectedPicks).length;
    const hasPresetOnly = presentDecisionStops.size === 0 && Object.keys(basePicks).length > 0;
    if (matchedStopCount === 0 && unmatchedStops.length === 0 && !detectedMode && !detectedFx && !hasPresetOnly && !detectedStop7Beds && !detectedStop7Meal) {
      return {
        ok: false,
        reason: 'Could not recognize any Hokkaido + Tokyo 2027 picks in that text. Paste the full summary generated by "Share Selection" or "Copy Text".',
      };
    }

    const finalMode = detectedMode || state.mode;
    const stop7WasUnmatched = unmatchedStops.some((u) => u.stopId === 7);
    const finalStop7Beds = stop7WasUnmatched ? null : (detectedStop7Beds || (hasPresetOnly && matchedPreset && matchedPreset.stop7Beds) || null);
    const finalStop7Meal = stop7WasUnmatched ? null : (detectedStop7Meal || (hasPresetOnly && matchedPreset && matchedPreset.stop7Meal) || null);

    const mergedPicks = { ...state.picks };
    // Apply preset baseline ONLY if the pasted text had no stop-by-stop lines (preset-only snippet)
    if (hasPresetOnly) {
      Object.keys(basePicks).forEach((k) => { mergedPicks[Number(k)] = basePicks[k]; });
    }
    // Apply all explicitly matched stops (unmatched/retired stops remain untouched)
    Object.keys(detectedPicks).forEach((k) => { mergedPicks[Number(k)] = detectedPicks[k]; });
    if (finalMode === 'M2') mergedPicks[1] = '1A';

    return {
      ok: true,
      mode: finalMode,
      fxRate: detectedFx,
      stop7Beds: finalStop7Beds,
      stop7Meal: finalStop7Meal,
      picks: mergedPicks,
      matchedStopCount,
      unmatchedStops,
      usedPresetFallback: hasPresetOnly,
    };
  }

  function openExportModal() {
    document.getElementById('export-textarea').value = buildExportText();
    document.getElementById('export-modal').classList.remove('hidden');
  }

  function closeExportModal() {
    document.getElementById('export-modal').classList.add('hidden');
  }

  function openImportModal() {
    const feedback = document.getElementById('import-feedback');
    feedback.classList.add('hidden');
    feedback.textContent = '';
    document.getElementById('import-modal').classList.remove('hidden');
    setTimeout(() => document.getElementById('import-textarea').focus(), 40);
  }

  function closeImportModal() {
    document.getElementById('import-modal').classList.add('hidden');
  }

  function handleApplyImport() {
    const raw = document.getElementById('import-textarea').value;
    const feedback = document.getElementById('import-feedback');
    const res = parseSharedPicksText(raw);

    if (!res.ok) {
      feedback.className = 'p-3 rounded-xl text-xs leading-relaxed bg-amberWarm-light text-amberWarm border border-amberWarm-border';
      feedback.textContent = res.reason;
      feedback.classList.remove('hidden');
      return;
    }

    state.mode = res.mode;
    if (res.fxRate !== null) state.fxRate = res.fxRate;
    if (res.stop7Beds) state.stop7Beds = res.stop7Beds;
    if (res.stop7Meal) state.stop7Meal = res.stop7Meal;
    state.picks = res.picks;
    state.importWarning = res.unmatchedStops.length > 0 ? { unmatchedStops: res.unmatchedStops } : null;

    setActiveView('picker');
    renderAll(true);
    closeImportModal();

    const parts = [res.mode === 'M1' ? 'Mode 1 (Hybrid)' : 'Mode 2 (All 3+2)'];
    if (res.stop7Beds || res.stop7Meal) {
      const bTxt = state.stop7Beds === 'double' ? 'Double' : 'Twin';
      const mTxt = state.stop7Meal === 'bf' ? 'BF' : 'RO';
      parts.push(`Tokyo ${bTxt}/${mTxt}`);
    }
    if (res.fxRate !== null) parts.push(`¥${formatFx(res.fxRate)}`);
    if (res.matchedStopCount > 0) parts.push(`${res.matchedStopCount} stops loaded`);
    else if (res.usedPresetFallback) parts.push('preset applied');

    if (res.unmatchedStops.length > 0) {
      const skipped = res.unmatchedStops.map((u) => `Stop ${u.stopId}`).join(', ');
      showToast(`Loaded ${parts.join(' · ')} — skipped retired hotel at ${skipped}`, 4500);
    } else {
      showToast(`Applied shared picks: ${parts.join(' · ')}`);
    }
  }

  async function triggerNativeShare() {
    const text = buildExportText();
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Hokkaido + Tokyo 2027 — Hotel Picks', text });
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
      }
    }
    const copied = copyTextToClipboard(text);
    openExportModal();
    showToast(copied ? 'Copied summary — ready to paste!' : 'Preview opened to copy or download');
  }

  function downloadSummaryTxt() {
    const text = buildExportText();
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Hokkaido-2027-Hotel-Picks-${state.mode}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Downloaded .txt summary');
  }

  // ===================================================================
  // EVENT LISTENERS & INITIALIZATION
  // ===================================================================
  function init() {
    if (initialized) return;
    initialized = true;

    const retryBtn = document.getElementById('trip-data-retry-btn');
    if (retryBtn) retryBtn.addEventListener('click', loadTripData);

    document.querySelectorAll('.view-switch-trigger').forEach((btn) => {
      btn.addEventListener('click', () => setActiveView(btn.dataset.switchView));
    });

    document.querySelectorAll('.mode-card').forEach((btn) => {
      btn.addEventListener('click', () => {
        const nextMode = btn.dataset.mode;
        if (state.mode === nextMode) return;
        state.mode = nextMode;
        if (state.mode === 'M2') state.picks[1] = '1A';
        renderAll(true);
      });
    });

    const fxInput = document.getElementById('fx-input');
    fxInput.addEventListener('input', () => {
      const val = parseFloat(fxInput.value);
      if (!isNaN(val) && val >= 60 && val <= 220) {
        state.fxRate = val;
        renderAll(false);
      }
    });
    fxInput.addEventListener('blur', () => {
      const val = parseFloat(fxInput.value);
      if (isNaN(val) || val < 60 || val > 220) fxInput.value = formatFx(state.fxRate);
    });
    document.querySelectorAll('.fx-preset-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.fxRate = parseFloat(btn.dataset.fx);
        renderAll(true);
      });
    });

    document.getElementById('tab-map-tokyo').addEventListener('click', () => {
      state.mapTab = 'tokyo';
      renderGoogleMapsPanel();
    });
    document.getElementById('tab-map-route').addEventListener('click', () => {
      state.mapTab = 'route';
      renderGoogleMapsPanel();
    });

    document.querySelectorAll('.map-pane-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.mapPaneMode = btn.dataset.paneMode;
        renderGoogleMapsPanel();
      });
    });

    document.querySelectorAll('.map-zoom-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.mapZoom = Number(btn.dataset.mapZoom);
        renderGoogleMapsPanel();
      });
    });

    document.getElementById('close-map-modal').addEventListener('click', closeMapModal);
    document.getElementById('map-modal').addEventListener('click', (e) => {
      if (e.target.id === 'map-modal') closeMapModal();
    });

    document.getElementById('sticky-share-btn').addEventListener('click', triggerNativeShare);
    document.getElementById('btn-share-native').addEventListener('click', triggerNativeShare);
    document.getElementById('btn-copy-summary').addEventListener('click', () => {
      const ok = copyTextToClipboard(buildExportText());
      showToast(ok ? 'Copied selection summary to clipboard' : 'Open Preview to copy text');
    });
    document.getElementById('btn-open-export-modal').addEventListener('click', openExportModal);

    document.getElementById('open-import-modal-btn').addEventListener('click', openImportModal);
    document.getElementById('rail-import-btn').addEventListener('click', openImportModal);
    document.getElementById('btn-open-import-modal').addEventListener('click', openImportModal);

    document.getElementById('rail-share-btn').addEventListener('click', triggerNativeShare);
    document.getElementById('rail-copy-btn').addEventListener('click', () => {
      const ok = copyTextToClipboard(buildExportText());
      showToast(ok ? 'Copied selection summary to clipboard' : 'Open Preview to copy text');
    });
    document.getElementById('rail-preview-btn').addEventListener('click', openExportModal);
    document.getElementById('rail-open-map-btn').addEventListener('click', () => openMapModal('tokyo'));

    document.getElementById('hero-map-jump-btn').addEventListener('click', () => openMapModal('tokyo'));

    document.getElementById('close-export-modal').addEventListener('click', closeExportModal);
    document.getElementById('export-modal').addEventListener('click', (e) => {
      if (e.target.id === 'export-modal') closeExportModal();
    });
    document.getElementById('modal-copy-btn').addEventListener('click', () => {
      const ok = copyTextToClipboard(document.getElementById('export-textarea').value);
      showToast(ok ? 'Copied to clipboard!' : 'Select and copy text manually');
    });
    document.getElementById('modal-download-btn').addEventListener('click', downloadSummaryTxt);

    document.getElementById('close-import-modal').addEventListener('click', closeImportModal);
    document.getElementById('import-modal').addEventListener('click', (e) => {
      if (e.target.id === 'import-modal') closeImportModal();
    });
    document.getElementById('import-clear-btn').addEventListener('click', () => {
      document.getElementById('import-textarea').value = '';
      document.getElementById('import-feedback').classList.add('hidden');
    });
    document.getElementById('import-apply-btn').addEventListener('click', handleApplyImport);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeExportModal();
        closeImportModal();
        closeMapModal();
      }
    });

    // Keep Chart.js legend & series dots compact so they never crowd or overlap
    if (typeof Chart !== 'undefined') {
      Chart.register({
        id: 'compactLegendDots',
        beforeInit(chart) {
          const labels = chart.options && chart.options.plugins && chart.options.plugins.legend && chart.options.plugins.legend.labels;
          if (labels && labels.usePointStyle) {
            labels.boxWidth = 6;
            labels.boxHeight = 6;
            labels.pointStyleWidth = 10;
            labels.padding = 20;
          }
          const datasets = (chart.data && chart.data.datasets) || [];
          datasets.forEach((ds) => {
            if (Array.isArray(ds.pointRadius)) {
              ds.pointRadius = ds.pointRadius.map((r) => (r >= 6 ? 5 : Math.min(r, 4)));
            } else if (typeof ds.pointRadius === 'number') {
              ds.pointRadius = Math.min(ds.pointRadius, 4);
            }
            if (typeof ds.pointBorderWidth === 'number') {
              ds.pointBorderWidth = Math.min(ds.pointBorderWidth, 1.5);
            }
          });
        },
      });
    }

    // Kick off loading trip_data_2027.json (which then initializes audit_module.js)
    loadTripData();
  }

  global.HokkaidoPickerModule = { init };
})(window);