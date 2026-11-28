/**
 * Hokkaido + Tokyo 2027 — Core Hotel Picker Module
 * Hosted on GitHub so hokkaido_tokyo_2027_hotel_picker.html stays a lightweight shell.
 * Loads trip_data_2027.json and audit_module.js, renders all 7 stops, Stop 7 Tokyo
 * configurator, Split-Screen Map Explorer (SVG + Google Maps), Bed & Room Size Guide
 * (Singapore mattress scale + open suitcase footprints), Share Export, and JSON State Sync API.
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
    bedGuideOpen: false,
    bedGuideTab: 'beds', // 'beds' | 'rooms'
    bedGuideStopId: 7,
    bedGuideOptId: null, // null = follows currently selected option at bedGuideStopId
    picks: { 1: '1A', 2: '2A_BF', 3: '3A', 4: '4A', 7: '7A' },
    openMathDrawers: {},
    openGuideDrawers: {},
  };

  let pendingExternalState = null;
  let toastTimer = null;
  let initialized = false;

  // ===================================================================
  // SINGAPORE MATTRESS REFERENCE & BED/ROOM SPEC RESOLVER
  // ===================================================================
  const SG_MATTRESS_REFS = [
    { id: 'sg_single', label: 'SG Single', shortLabel: 'SG Single', cm: 91 },
    { id: 'sg_super', label: 'SG Super Single', shortLabel: 'SG Super Sgl', cm: 107 },
    { id: 'sg_queen', label: 'SG Queen', shortLabel: 'SG Queen', cm: 152 },
    { id: 'sg_king', label: 'SG King', shortLabel: 'SG King', cm: 183 },
  ];

  const BED_LADDER_TIERS = [
    { id: 'extra', label: 'Extra / Folding / Sofa Bed', cm: 97, note: 'Common 3rd bed in Japanese 3+2 triples (~SG Single)' },
    { id: 'futon', label: 'Japanese Tatami Futon', cm: 100, note: 'Full-length floor futon in Japanese-Western ryokan rooms' },
    { id: 'twin_std', label: 'Standard JP Twin Bed', cm: 110, note: 'Typical single bed in a Japanese Twin (~SG Super Single)' },
    { id: 'semi_dbl', label: 'JP Semi-Double / Wide Twin', cm: 120, note: 'Very comfy solo; tight if 2 adults share' },
    { id: 'jp_double', label: 'JP Double Bed', cm: 140, note: '12 cm narrower than SG Queen — cozy for 2, roomy solo' },
    { id: 'jp_wide_dbl', label: 'JP Wide Double', cm: 150, note: 'Virtually identical to a Singapore Queen (152 cm)' },
    { id: 'jp_queen', label: 'JP Queen Bed', cm: 160, note: '8 cm wider than a Singapore Queen' },
  ];

  /**
   * Translates a mattress width (cm) and occupant count into a concise Singapore reference label.
   */
  function describeBedVsSg(cm, sleepers = 1) {
    if (sleepers >= 2) {
      const diffQueen = cm - 152;
      if (cm <= 125) {
        return {
          text: `${Math.abs(diffQueen)} cm < SG Queen (tight for 2)`,
          tone: 'amber',
        };
      }
      if (cm <= 145) {
        return {
          text: `${Math.abs(diffQueen)} cm narrower than SG Queen`,
          tone: 'amber',
        };
      }
      if (cm <= 155) {
        return {
          text: '≈ SG Queen (152 cm)',
          tone: 'pine',
        };
      }
      return {
        text: `+${diffQueen} cm wider than SG Queen`,
        tone: 'pine',
      };
    }
    // Single sleeper on this mattress
    if (cm <= 98) {
      return { text: `≈ SG Single (+${Math.max(0, cm - 91)} cm)`, tone: 'amber' };
    }
    if (cm <= 114) {
      return { text: '≈ SG Super Single (107 cm)', tone: 'pine' };
    }
    if (cm <= 128) {
      return { text: `+${cm - 107} cm > SG Super Single`, tone: 'pine' };
    }
    if (cm <= 146) {
      return { text: 'Nearly SG Queen (solo!)', tone: 'plum' };
    }
    return { text: '≈ SG Queen (solo!)', tone: 'plum' };
  }

  /**
   * Parses explicit room m² and bed cm mentions from a roomBreakdown clause
   * so any JSON updates in trip_data_2027.json are reflected automatically.
   */
  function extractM2FromText(str, fallback) {
    if (!str) return fallback;
    const m = str.match(/(\d+(?:\.\d+)?)\s*m²/i);
    return m ? parseFloat(m[1]) : fallback;
  }

  function extractCmFromText(str, fallback) {
    if (!str) return fallback;
    const m = str.match(/(\d{2,3})\s*cm/i);
    return m ? parseInt(m[1], 10) : fallback;
  }

  /**
   * Returns structured bed & room dimensions for BOTH rooms (Parents/Sister + Brothers)
   * for any stop & resolved option. Respects optional `opt.bedSpecs` in JSON if present.
   */
  function getBedSpecsForOption(stop, opt, mode = state.mode) {
    if (opt && opt.bedSpecs) {
      const custom = opt.bedSpecs[mode] || opt.bedSpecs;
      if (custom && custom.brothers && custom.parentsSister) return custom;
    }

    const breakdown = String(resolveField(opt.roomBreakdown, mode) || '');
    const solo = isOptionSolo(opt, mode);
    const hay = `${opt.name || ''} ${opt.shortName || ''} ${breakdown}`.toLowerCase();

    // Split breakdown clauses to pull m² / cm hints per room if present
    const parts = breakdown.split('·').map((s) => s.trim());
    const broPart = parts.find((p) => /brothers/i.test(p)) || '';
    const parPart = parts.find((p) => /parents/i.test(p)) || '';
    const sisPart = parts.find((p) => /sister\s*\(solo\)|sister\s*:/i.test(p)) || '';

    // ---- STOP 1: HANEDA EXCEL HOTEL TOKYU ----
    if (stop.id === 1) {
      const bros = {
        label: 'Brothers’ Room (23 m² Standard Twin)',
        areaM2: extractM2FromText(broPart, 23),
        suitcases: 2,
        beds: [
          { widthCm: 110, sleepers: 1, occupant: 'Bro 1', type: 'Twin Bed' },
          { widthCm: 110, sleepers: 1, occupant: 'Bro 2', type: 'Twin Bed' },
        ],
        note: 'Two proper ~SG Super Single beds with generous airport-room floor space.',
      };
      if (solo) {
        return {
          isSolo: true,
          brothers: bros,
          sisterSolo: {
            label: 'Sister’s Solo Room (19 m² Excel Single)',
            areaM2: extractM2FromText(sisPart, 19),
            suitcases: 1,
            beds: [{ widthCm: extractCmFromText(sisPart, 140), sleepers: 1, occupant: 'Sister', type: 'Wide Single / Double' }],
            note: 'Sister gets a full 140 cm double bed all to herself plus her own bathroom right off the SG flight.',
          },
        };
      }
      return {
        isSolo: false,
        brothers: bros,
        parentsSister: {
          label: 'Parents + Sister (29 m² Triple)',
          areaM2: extractM2FromText(parPart, 29),
          suitcases: 3,
          beds: [
            { widthCm: 110, sleepers: 1, occupant: 'Parent 1', type: 'Twin Bed' },
            { widthCm: 110, sleepers: 1, occupant: 'Parent 2', type: 'Twin Bed' },
            { widthCm: 97, sleepers: 1, occupant: 'Sister', type: 'Extra Bed', isSister: true, isExtra: true },
          ],
          note: 'Sister sleeps on a ~97 cm extra bed (slightly wider than an SG Single) for 1 quick transit night.',
        },
      };
    }

    // ---- STOP 2: FURANO / BIEI ----
    if (stop.id === 2) {
      if (/la\s*vista/i.test(hay)) {
        return {
          isSolo: false,
          brothers: {
            label: 'Brothers’ Room (18 m² Hollywood Twin)',
            areaM2: extractM2FromText(broPart, 18),
            suitcases: 2,
            beds: [
              { widthCm: 110, sleepers: 1, occupant: 'Bro 1', type: 'Hollywood Twin' },
              { widthCm: 110, sleepers: 1, occupant: 'Bro 2', type: 'Hollywood Twin' },
            ],
            joinedBeds: true,
            note: 'Two 110 cm beds pushed flush side-by-side (220 cm combined) with separate duvets.',
          },
          parentsSister: {
            label: 'Parents + Sister (37 m² Deluxe Twin + Extra)',
            areaM2: extractM2FromText(parPart, 37),
            suitcases: 3,
            beds: [
              { widthCm: 120, sleepers: 1, occupant: 'Parent 1', type: 'Semi-Double' },
              { widthCm: 120, sleepers: 1, occupant: 'Parent 2', type: 'Semi-Double' },
              { widthCm: 100, sleepers: 1, occupant: 'Sister', type: 'Extra / Daybed', isSister: true, isExtra: true },
            ],
            note: 'Spacious 37 m² resort room; Sister sleeps on a ~100 cm daybed/extra bed (~SG Super Single width).',
          },
        };
      }
      // Furano Natulux
      const natBros = {
        label: `Brothers’ Room (${extractM2FromText(broPart, 22)} m² Standard Twin)`,
        areaM2: extractM2FromText(broPart, 22),
        suitcases: 2,
        beds: [
          { widthCm: extractCmFromText(broPart, 120), sleepers: 1, occupant: 'Bro 1', type: 'Wide Twin' },
          { widthCm: extractCmFromText(broPart, 120), sleepers: 1, occupant: 'Bro 2', type: 'Wide Twin' },
        ],
        note: 'Generous 120 cm wide twins (wider than SG Super Single) with solid floor space.',
      };
      if (solo) {
        return {
          isSolo: true,
          brothers: natBros,
          sisterSolo: {
            label: `Sister’s Solo Room (${extractM2FromText(sisPart, 16)} m² Casual Double)`,
            areaM2: extractM2FromText(sisPart, 16),
            suitcases: 1,
            beds: [{ widthCm: 140, sleepers: 1, occupant: 'Sister', type: 'Double Bed' }],
            note: 'Sister gets a proper 140 cm Double bed & private bathroom all to herself (no extra bed!).',
          },
        };
      }
      return {
        isSolo: false,
        brothers: natBros,
        parentsSister: {
          label: `Parents + Sister (${extractM2FromText(parPart, 39)} m² 7F Supreme Twin)`,
          areaM2: extractM2FromText(parPart, 39),
          suitcases: 3,
          beds: [
            { widthCm: 120, sleepers: 1, occupant: 'Parent 1', type: 'Wide Twin' },
            { widthCm: 120, sleepers: 1, occupant: 'Parent 2', type: 'Wide Twin' },
            { widthCm: 100, sleepers: 1, occupant: 'Sister', type: 'Extra Bed', isSister: true, isExtra: true },
          ],
          note: 'Huge 39 m² room, though Sister uses a ~100 cm extra bed (between SG Single & Super Single).',
        },
      };
    }

    // ---- STOP 3: NOBORIBETSU ----
    if (stop.id === 3) {
      if (/takinoya\s*bekkan|tamanoyu/i.test(hay)) {
        return {
          isSolo: false,
          brothers: {
            label: 'Brothers’ Room (~40 m² Two-Room Jap-West)',
            areaM2: extractM2FromText(broPart, 40),
            suitcases: 2,
            beds: [
              { widthCm: 120, sleepers: 1, occupant: 'Bro 1', type: 'Semi-Double' },
              { widthCm: 120, sleepers: 1, occupant: 'Bro 2', type: 'Semi-Double' },
            ],
            note: 'Two roomy 120 cm semi-double beds plus an adjoining tatami sitting room.',
          },
          parentsSister: {
            label: 'Parents + Sister (~40 m² Two-Room Jap-West)',
            areaM2: extractM2FromText(parPart, 40),
            suitcases: 3,
            beds: [
              { widthCm: 120, sleepers: 1, occupant: 'Parent 1', type: 'Semi-Double' },
              { widthCm: 120, sleepers: 1, occupant: 'Parent 2', type: 'Semi-Double' },
              { widthCm: 100, sleepers: 1, occupant: 'Sister', type: 'Tatami Futon', isSister: true, isFuton: true },
            ],
            note: 'Two-room layout means Sister’s plush ~100 cm tatami futon sits in its own separate tatami area for extra privacy.',
          },
        };
      }
      // Takinoya 5-star
      return {
        isSolo: false,
        brothers: {
          label: 'Brothers’ Room (65 m² Type AW Suite)',
          areaM2: extractM2FromText(broPart, 65),
          suitcases: 2,
          beds: [
            { widthCm: 120, sleepers: 1, occupant: 'Bro 1', type: 'Low Twin' },
            { widthCm: 120, sleepers: 1, occupant: 'Bro 2', type: 'Low Twin' },
          ],
          note: 'Massive 65 m² luxury ryokan suite — effortless luggage & lounge space.',
        },
        parentsSister: {
          label: 'Parents + Sister (83 m² Type D w/ Private Bath)',
          areaM2: extractM2FromText(parPart, 83),
          suitcases: 3,
          beds: [
            { widthCm: 120, sleepers: 1, occupant: 'Parent 1', type: 'Low Twin' },
            { widthCm: 120, sleepers: 1, occupant: 'Parent 2', type: 'Low Twin' },
            { widthCm: 100, sleepers: 1, occupant: 'Sister', type: 'Plush Tatami Futon', isSister: true, isFuton: true },
          ],
          note: 'Huge 83 m² sanctuary with separate tatami zone for Sister’s thick Japanese futon (~100 cm).',
        },
      };
    }

    // ---- STOP 4: LAKE TOYA (NONOKAZE) ----
    if (stop.id === 4) {
      const isSpa = /spa|36\.8/i.test(hay);
      return {
        isSolo: false,
        brothers: {
          label: isSpa ? 'Brothers’ Room (36.8 m² Spa 7F Twin)' : 'Brothers’ Room (56 m² Club Deluxe Twin)',
          areaM2: isSpa ? 36.8 : 56,
          suitcases: 2,
          beds: [
            { widthCm: isSpa ? 115 : 120, sleepers: 1, occupant: 'Bro 1', type: 'Twin Bed' },
            { widthCm: isSpa ? 115 : 120, sleepers: 1, occupant: 'Bro 2', type: 'Twin Bed' },
          ],
          note: isSpa
            ? 'Still a very roomy 36.8 m² lakefront room with two full twin beds.'
            : 'Expansive 56 m² renovated lakefront lounge layout with two wide 120 cm twins.',
        },
        parentsSister: {
          label: 'Parents + Sister (56 m² Club Jap-West)',
          areaM2: 56,
          suitcases: 3,
          beds: [
            { widthCm: 120, sleepers: 1, occupant: 'Parent 1', type: 'Wide Twin' },
            { widthCm: 120, sleepers: 1, occupant: 'Parent 2', type: 'Wide Twin' },
            { widthCm: 100, sleepers: 1, occupant: 'Sister', type: 'Tatami Futon', isSister: true, isFuton: true },
          ],
          note: 'Separate raised tatami area gives Sister her own cozy zone on a ~100 cm futon overlooking Lake Toya.',
        },
      };
    }

    // ---- STOP 5: HAKODATE (TOKYU STAY) ----
    if (stop.id === 5) {
      const bros = {
        label: `Brothers’ Room (${extractM2FromText(broPart, 19)} m² Standard Twin)`,
        areaM2: extractM2FromText(broPart, 19),
        suitcases: 2,
        beds: [
          { widthCm: 100, sleepers: 1, occupant: 'Bro 1', type: 'Compact Twin' },
          { widthCm: 100, sleepers: 1, occupant: 'Bro 2', type: 'Compact Twin' },
        ],
        note: 'Two 100 cm compact twin beds (slightly narrower than SG Super Single) + in-room washer-dryer.',
      };
      if (solo) {
        return {
          isSolo: true,
          brothers: bros,
          sisterSolo: {
            label: `Sister’s Solo Room (${extractM2FromText(sisPart, 16)} m² Comfort Double)`,
            areaM2: extractM2FromText(sisPart, 16),
            suitcases: 1,
            beds: [{ widthCm: 140, sleepers: 1, occupant: 'Sister', type: 'Double Bed' }],
            note: 'Sister gets a private 140 cm double bed + her own washer-dryer for 3 nights in Hakodate.',
          },
        };
      }
      return {
        isSolo: false,
        brothers: bros,
        parentsSister: {
          label: `Parents + Sister (${extractM2FromText(parPart, 33)} m² Corner Twin)`,
          areaM2: extractM2FromText(parPart, 33),
          suitcases: 3,
          beds: [
            { widthCm: 110, sleepers: 1, occupant: 'Parent 1', type: 'Twin Bed' },
            { widthCm: 110, sleepers: 1, occupant: 'Parent 2', type: 'Twin Bed' },
            { widthCm: 97, sleepers: 1, occupant: 'Sister', type: 'Sofa / Extra Bed', isSister: true, isExtra: true },
          ],
          note: 'Spacious 33 m² corner room, with Sister on a ~97 cm sofa/extra bed for 3 nights.',
        },
      };
    }

    // ---- STOP 6: SAPPORO (THE GATE HOTEL) ----
    if (stop.id === 6) {
      return {
        isSolo: false,
        brothers: {
          label: `Brothers’ Room (${extractM2FromText(broPart, 26)} m² Essential Twin)`,
          areaM2: extractM2FromText(broPart, 26),
          suitcases: 2,
          beds: [
            { widthCm: 120, sleepers: 1, occupant: 'Bro 1', type: 'Slumberland Twin' },
            { widthCm: 120, sleepers: 1, occupant: 'Bro 2', type: 'Slumberland Twin' },
          ],
          note: 'Brand-new Dec 2025 rooms with plush 120 cm Slumberland mattresses and comfortable packing space.',
        },
        parentsSister: {
          label: `Parents + Sister (${extractM2FromText(parPart, 31)} m² Scenic Hollywood Triple)`,
          areaM2: extractM2FromText(parPart, 31),
          suitcases: 3,
          beds: [
            { widthCm: 120, sleepers: 1, occupant: 'Parent 1', type: 'Slumberland Twin' },
            { widthCm: 120, sleepers: 1, occupant: 'Parent 2', type: 'Slumberland Twin' },
            { widthCm: 100, sleepers: 1, occupant: 'Sister', type: 'Extra Bed', isSister: true, isExtra: true },
          ],
          note: 'Parents get 120 cm Slumberland beds; Sister sleeps on a ~100 cm extra bed (~SG Super Single width).',
        },
      };
    }

    // ---- STOP 7: TOKYO (SUPPORTS GINZA/HIBIYA/KYOBASHI + UENO/ASAKUSA) ----
    const isDoubleBros = stop.hasStopConfigurator
      ? state.stop7Beds === 'double'
      : /double|queen/i.test(broPart) && !/twin/i.test(broPart);

    // 7A Ginza: Hotel Gracery Ginza
    if (/gracery/i.test(hay)) {
      const broArea = extractM2FromText(broPart, isDoubleBros ? 15 : 23);
      const broW = extractCmFromText(broPart, isDoubleBros ? 140 : 110);
      const parArea = extractM2FromText(parPart, 23);
      const parW = extractCmFromText(parPart, 110);
      const isSofaTriple = /sofa\s*bed/i.test(parPart);
      return {
        isSolo: false,
        brothers: {
          label: isDoubleBros
            ? `Brothers’ Room (${broArea} m² Concept Flooring Double)`
            : `Brothers’ Room (${broArea} m² Standard Twin)`,
          areaM2: broArea,
          suitcases: 2,
          beds: isDoubleBros
            ? [{ widthCm: broW, sleepers: 2, occupant: '2 Brothers', type: 'Shared Double' }]
            : [
                { widthCm: broW, sleepers: 1, occupant: 'Bro 1', type: 'Twin Bed' },
                { widthCm: broW, sleepers: 1, occupant: 'Bro 2', type: 'Twin Bed' },
              ],
          note: isDoubleBros
            ? `${broW} cm bed is 12 cm narrower than an SG Queen — noticeable shoulder-to-shoulder fit for 2 adults in a ${broArea} m² room.`
            : `Proper ${broW} cm twin beds (~SG Super Single each) with solid ${broArea} m² central-Ginza floor space.`,
        },
        parentsSister: {
          label: isSofaTriple
            ? `Parents + Sister (${parArea} m² Standard Twin + Sofa Bed)`
            : `Parents + Sister (${parArea} m² Standard Triple)`,
          areaM2: parArea,
          suitcases: 3,
          beds: [
            { widthCm: parW, sleepers: 1, occupant: 'Parent 1', type: 'Single Bed' },
            { widthCm: parW, sleepers: 1, occupant: 'Parent 2', type: 'Single Bed' },
            isSofaTriple
              ? { widthCm: 95, sleepers: 1, occupant: 'Sister', type: 'Sofa Bed', isSister: true, isExtra: true }
              : { widthCm: parW, sleepers: 1, occupant: 'Sister', type: 'Single Bed', isSister: true },
          ],
          note: isSofaTriple
            ? 'Standard Twin + ~95 cm sofa bed (≈ SG Single); 3 suitcases will feel snug in 23 m².'
            : `True 3-bed Tokyo triple: Sister gets a real ${parW} cm single bed (~SG Super Single) instead of a folding rollaway; 3 suitcases stay tidy in ${parArea} m².`,
        },
      };
    }

    // 7B Ginza / Legacy 7B Okachimachi: Super Hotel
    if (/super\s*hotel/i.test(hay)) {
      const isConnecting = /connect/i.test(hay);
      const broArea = extractM2FromText(broPart, isDoubleBros ? 12 : 17);
      const broW = extractCmFromText(broPart, isDoubleBros ? 150 : 100);
      const brosObj = {
        label: isDoubleBros
          ? `Brothers’ Room (${broArea} m² Standard Double)`
          : `Brothers’ Room (${broArea} m² Deluxe Twin)`,
        areaM2: broArea,
        suitcases: 2,
        beds: isDoubleBros
          ? [{ widthCm: broW, sleepers: 2, occupant: '2 Brothers', type: 'Shared Wide Double' }]
          : [
              { widthCm: broW, sleepers: 1, occupant: 'Bro 1', type: 'Compact Twin' },
              { widthCm: broW, sleepers: 1, occupant: 'Bro 2', type: 'Compact Twin' },
            ],
        note: isDoubleBros
          ? `Super Hotel’s ${broW} cm bed is close to an SG Queen, but the ${broArea} m² floor is very tight for 2 open suitcases.`
          : `Two separate beds avoid sharing, though ${broArea} m² floor space stays compact for packing.`,
      };

      if (isConnecting) {
        const connArea = extractM2FromText(parPart, 24);
        const halfArea = Math.round(connArea / 2);
        return {
          isSolo: true,
          isConnecting: true,
          brothers: brosObj,
          sisterSolo: {
            label: `Sister’s Adjoining Room (~${halfArea} m² inside ${connArea} m² Connecting)`,
            areaM2: halfArea,
            suitcases: 1,
            beds: [{ widthCm: 150, sleepers: 1, occupant: 'Sister', type: 'Wide Bed (Own Room)' }],
            note: 'Internal connecting door gives Sister her own separate bedroom, bathroom, and ~150 cm bed (≈ SG Queen solo!).',
          },
          parents: {
            label: `Parents’ Adjoining Room (~${halfArea} m² inside ${connArea} m² Connecting)`,
            areaM2: halfArea,
            suitcases: 2,
            beds: [{ widthCm: 150, sleepers: 2, occupant: 'Parents', type: 'Wide Double (≈ SG Queen)' }],
            note: 'Parents share one ~150 cm wide bed (≈ SG Queen) with an internal door directly to Sister’s room.',
          },
        };
      }

      if (solo) {
        const sisArea = extractM2FromText(sisPart, 12);
        return {
          isSolo: true,
          brothers: brosObj,
          sisterSolo: {
            label: `Sister’s Solo Room (${sisArea} m² Standard Double)`,
            areaM2: sisArea,
            suitcases: 1,
            beds: [{ widthCm: extractCmFromText(sisPart, 150), sleepers: 1, occupant: 'Sister', type: 'Wide Double (Solo)' }],
            note: 'Sister gets a ~150 cm wide bed (≈ SG Queen solo!) and private bathroom all to herself.',
          },
        };
      }

      return {
        isSolo: false,
        brothers: brosObj,
        parentsSister: {
          label: `Parents + Sister (${extractM2FromText(parPart, 24)} m² Triple / Loft-Free Setup)`,
          areaM2: extractM2FromText(parPart, 24),
          suitcases: 3,
          beds: [
            { widthCm: 150, sleepers: 2, occupant: 'Parents', type: 'Wide Double' },
            { widthCm: 100, sleepers: 1, occupant: 'Sister', type: 'Single / Extra Bed', isSister: true, isExtra: true },
          ],
          note: 'Parents share a ~150 cm bed while Sister gets a ~100 cm single/extra bed.',
        },
      };
    }

    // 7C Ginza: Sotetsu Fresa Inn Ginza-Sanchome (M1: 2+2+1 Solo; M2: Connecting 3+2)
    if (/sotetsu|fresa/i.test(hay)) {
      const broArea = extractM2FromText(broPart, isDoubleBros ? 15.3 : 18.6);
      const broW = extractCmFromText(broPart, isDoubleBros ? 140 : 120);
      const sisArea = extractM2FromText(sisPart, 12);
      const sisW = extractCmFromText(sisPart, 140);
      const brosObj = {
        label: isDoubleBros
          ? `Brothers’ Room (${broArea} m² Comfort Double)`
          : `Brothers’ Room (${broArea} m² Superior Twin)`,
        areaM2: broArea,
        suitcases: 2,
        beds: isDoubleBros
          ? [{ widthCm: broW, sleepers: 2, occupant: '2 Brothers', type: 'Shared Serta Double' }]
          : [
              { widthCm: broW, sleepers: 1, occupant: 'Bro 1', type: 'Serta Wide Twin' },
              { widthCm: broW, sleepers: 1, occupant: 'Bro 2', type: 'Serta Wide Twin' },
            ],
        note: isDoubleBros
          ? `Compact ${broArea} m² Tokyo room + ${broW} cm Serta double bed (12 cm < SG Queen) — open 1 suitcase at a time.`
          : `Generous 2× ${broW} cm Serta twin beds (wider than SG Super Single each), though ${broArea} m² stays tidy for 2 large suitcases.`,
      };

      if (mode === 'M2') {
        return {
          isSolo: true,
          isConnecting: true,
          brothers: brosObj,
          sisterSolo: {
            label: 'Sister’s Adjoining Room (15.3 m² inside 33.9 m² Connecting)',
            areaM2: 15.3,
            suitcases: 1,
            beds: [{ widthCm: 140, sleepers: 1, occupant: 'Sister', type: 'Serta Double (Own Adjoining Room)' }],
            note: 'Connecting room setup (18.6 m² + 15.3 m² with internal door) gives Sister her own bedroom & bath while staying connected to Parents.',
          },
          parents: {
            label: 'Parents’ Adjoining Room (18.6 m² inside 33.9 m² Connecting)',
            areaM2: 18.6,
            suitcases: 2,
            beds: [
              { widthCm: 120, sleepers: 1, occupant: 'Parent 1', type: 'Serta Wide Twin' },
              { widthCm: 120, sleepers: 1, occupant: 'Parent 2', type: 'Serta Wide Twin' },
            ],
            note: 'Parents take the adjoining 18.6 m² twin side connected directly to Sister’s room via internal door.',
          },
        };
      }

      return {
        isSolo: true,
        brothers: brosObj,
        sisterSolo: {
          label: `Sister’s Solo Room (${sisArea} m² Standard Single)`,
          areaM2: sisArea,
          suitcases: 1,
          beds: [{ widthCm: sisW, sleepers: 1, occupant: 'Sister', type: 'Serta Double Bed (Solo)' }],
          note: `Sister gets a full ${sisW} cm Serta double bed & private bathroom to herself (no extra bed!) — compact ${sisArea} m² floor is fine for 1 suitcase.`,
        },
      };
    }

    // 7D / 7E: remm Tokyo Kyobashi & remm Hibiya (2+2+1 Only)
    if (/remm/i.test(hay)) {
      const isHibiya = /hibiya/i.test(hay);
      const broArea = extractM2FromText(broPart, isHibiya ? (isDoubleBros ? 15.1 : 23) : (isDoubleBros ? 15 : 18.4));
      const broW = extractCmFromText(broPart, isDoubleBros ? 140 : 110);
      const sisArea = extractM2FromText(sisPart, isHibiya && isDoubleBros ? 15.1 : 15);
      const sisW = extractCmFromText(sisPart, 140);
      const broRoomName = isHibiya
        ? (isDoubleBros ? 'Economy Double' : 'Twin')
        : (isDoubleBros ? 'Inside Semi-Double' : 'Economy Twin');
      const sisRoomName = isHibiya
        ? (isDoubleBros ? 'Economy Double' : 'Semi-Double')
        : 'Inside Semi-Double';

      return {
        isSolo: true,
        brothers: {
          label: `Brothers’ Room (${broArea} m² ${broRoomName})`,
          areaM2: broArea,
          suitcases: 2,
          beds: isDoubleBros
            ? [{ widthCm: broW, sleepers: 2, occupant: '2 Brothers', type: 'Shared Double' }]
            : [
                { widthCm: broW, sleepers: 1, occupant: 'Bro 1', type: 'Twin Bed' },
                { widthCm: broW, sleepers: 1, occupant: 'Bro 2', type: 'Twin Bed' },
              ],
          note: isDoubleBros
            ? `${broArea} m² floor + ${broW} cm bed (12 cm narrower than SG Queen) — tight for 2 brothers + 2 suitcases; includes in-room massage chair.`
            : `${broArea} m² Tokyo twin room with two ${broW} cm Silky remm beds, bathtub, and an in-room massage chair.`,
        },
        sisterSolo: {
          label: `Sister’s Solo Room (${sisArea} m² ${sisRoomName})`,
          areaM2: sisArea,
          suitcases: 1,
          beds: [{ widthCm: sisW, sleepers: 1, occupant: 'Sister', type: 'Silky remm Double' }],
          note: `Sister gets a plush ${sisW} cm Silky remm double bed, private rain-shower bathroom & massage chair all to herself!`,
        },
      };
    }

    // Legacy 7A: Mitsui Garden Hotel Ueno
    if (/mitsui\s*garden/i.test(hay)) {
      return {
        isSolo: false,
        brothers: {
          label: 'Brothers’ Room (22 m² Standard Twin)',
          areaM2: extractM2FromText(broPart, 22),
          suitcases: 2,
          beds: [
            { widthCm: 110, sleepers: 1, occupant: 'Bro 1', type: 'Twin Bed' },
            { widthCm: 110, sleepers: 1, occupant: 'Bro 2', type: 'Twin Bed' },
          ],
          note: 'Two proper 110 cm twin beds (~SG Super Single each) with modern 2023 renovation.',
        },
        parentsSister: {
          label: 'Parents + Sister (25 m² Superior Twin + Sofa Bed)',
          areaM2: extractM2FromText(parPart, 25),
          suitcases: 3,
          beds: [
            { widthCm: 110, sleepers: 1, occupant: 'Parent 1', type: 'Twin Bed' },
            { widthCm: 110, sleepers: 1, occupant: 'Parent 2', type: 'Twin Bed' },
            { widthCm: 95, sleepers: 1, occupant: 'Sister', type: 'Sofa Bed', isSister: true, isExtra: true },
          ],
          note: 'Sister sleeps on a ~95 cm convertible sofa bed (≈ SG Single) for 3 nights in Tokyo.',
        },
      };
    }

    // Legacy 7C: Dormy Inn EXPRESS Asakusa
    if (/dormy\s*inn/i.test(hay)) {
      return {
        isSolo: false,
        brothers: {
          label: 'Brothers’ Room (20 m² Shared Queen)',
          areaM2: extractM2FromText(broPart, 20),
          suitcases: 2,
          beds: [{ widthCm: 160, sleepers: 2, occupant: '2 Brothers', type: 'Shared Queen' }],
          note: '160 cm Queen bed is 8 cm wider than a Singapore Queen — much roomier than a 140 cm Japanese double.',
        },
        parentsSister: {
          label: 'Parents + Sister (27 m² Jap-West River View)',
          areaM2: extractM2FromText(parPart, 27),
          suitcases: 3,
          beds: [
            { widthCm: 100, sleepers: 1, occupant: 'Parent 1', type: 'Compact Twin' },
            { widthCm: 100, sleepers: 1, occupant: 'Parent 2', type: 'Compact Twin' },
            { widthCm: 100, sleepers: 1, occupant: 'Sister', type: 'Tatami Futon', isSister: true, isFuton: true },
          ],
          note: 'Japanese-Western layout lets Sister sleep on a ~100 cm tatami futon instead of a folding rollaway.',
        },
      };
    }

    // Generic safe fallback
    const broArea = extractM2FromText(broPart, isDoubleBros ? 16 : 22);
    return {
      isSolo: solo,
      brothers: {
        label: `Brothers’ Room (${broArea} m²)`,
        areaM2: broArea,
        suitcases: 2,
        beds: isDoubleBros
          ? [{ widthCm: 140, sleepers: 2, occupant: '2 Brothers', type: 'Shared Double' }]
          : [
              { widthCm: 110, sleepers: 1, occupant: 'Bro 1', type: 'Twin Bed' },
              { widthCm: 110, sleepers: 1, occupant: 'Bro 2', type: 'Twin Bed' },
            ],
        note: isDoubleBros ? 'Shared 140 cm double bed (12 cm narrower than SG Queen).' : 'Two separate ~110 cm twin beds.',
      },
      ...(solo
        ? {
            sisterSolo: {
              label: `Sister’s Solo Room (${extractM2FromText(sisPart, 15)} m²)`,
              areaM2: extractM2FromText(sisPart, 15),
              suitcases: 1,
              beds: [{ widthCm: 140, sleepers: 1, occupant: 'Sister', type: 'Double Bed (Solo)' }],
              note: 'Private solo room with a 140 cm double bed.',
            },
          }
        : {
            parentsSister: {
              label: `Parents + Sister (${extractM2FromText(parPart, 28)} m² Triple)`,
              areaM2: extractM2FromText(parPart, 28),
              suitcases: 3,
              beds: [
                { widthCm: 110, sleepers: 1, occupant: 'Parent 1', type: 'Twin Bed' },
                { widthCm: 110, sleepers: 1, occupant: 'Parent 2', type: 'Twin Bed' },
                { widthCm: 97, sleepers: 1, occupant: 'Sister', type: 'Extra Bed', isSister: true, isExtra: true },
              ],
              note: 'Parents take the two twin beds; Sister uses a ~97 cm extra bed.',
            },
          }),
    };
  }

  /**
   * Renders a clean, top-down proportional SVG of a room's beds with adult shoulder silhouettes (~48 cm each).
   * Scale: 1 cm = 0.85 px so a 140 cm bed and 2× 110 cm beds are directly comparable at a glance.
   */
  function renderBedGroupSvg(beds, options = {}) {
    const scale = options.compact ? 0.62 : 0.78;
    const bedH = options.compact ? 64 : 86;
    const gap = options.joined ? 2 : (options.compact ? 10 : 14);
    const padX = 12;
    const padY = 10;
    const labelH = options.compact ? 18 : 22;

    const totalBedW = beds.reduce((sum, b) => sum + b.widthCm * scale, 0) + gap * Math.max(0, beds.length - 1);
    const svgW = Math.max(options.compact ? 175 : 230, totalBedW + padX * 2);
    const svgH = padY + bedH + labelH + 6;
    let curX = (svgW - totalBedW) / 2;

    const bedsSvg = beds.map((bed) => {
      const bw = bed.widthCm * scale;
      const x = curX;
      curX += bw + gap;

      const isSister = Boolean(bed.isSister || bed.occupant === 'Sister');
      const isTightShared = bed.sleepers >= 2 && bed.widthCm <= 145;
      const stroke = isSister ? '#6B4E71' : isTightShared ? '#9A6324' : '#2E5A47';
      const fill = isSister ? '#F6F1F7' : isTightShared ? '#FBF5EC' : '#EDF4F0';
      const pillowFill = '#FFFFFF';
      const sleeperFill = isSister ? '#6B4E71' : isTightShared ? '#9A6324' : '#2E5A47';

      // Pillows
      const pillowCount = bed.sleepers >= 2 ? 2 : 1;
      const pillowGap = 4;
      const pillowW = Math.min(bw - 10, (bw - 10 - pillowGap * (pillowCount - 1)) / pillowCount);
      const pillowH = options.compact ? 10 : 13;
      const pillowStartX = x + (bw - (pillowW * pillowCount + pillowGap * (pillowCount - 1))) / 2;
      let pillowsHtml = '';
      for (let i = 0; i < pillowCount; i++) {
        const px = pillowStartX + i * (pillowW + pillowGap);
        pillowsHtml += `<rect x="${px.toFixed(1)}" y="${(padY + 5).toFixed(1)}" width="${pillowW.toFixed(1)}" height="${pillowH}" rx="3.5" fill="${pillowFill}" stroke="${stroke}" stroke-width="1" opacity="0.95" />`;
      }

      // Adult sleeper silhouettes (~48 cm shoulder width drawn to exact mattress scale!)
      const shoulderW = 48 * scale;
      const headR = options.compact ? 4.5 : 5.8;
      let sleepersHtml = '';
      for (let i = 0; i < bed.sleepers; i++) {
        const cx = bed.sleepers === 1
          ? x + bw / 2
          : x + (bw / 2) + (i === 0 ? -bw * 0.23 : bw * 0.23);
        const headY = padY + pillowH + (options.compact ? 12 : 16);
        const bodyY = headY + headR + 2;
        const bodyH = options.compact ? 22 : 30;
        const clampedSW = Math.min(shoulderW, (bw / bed.sleepers) - 4);
        sleepersHtml += `
          <circle cx="${cx.toFixed(1)}" cy="${headY.toFixed(1)}" r="${headR}" fill="${sleeperFill}" opacity="0.28" />
          <rect x="${(cx - clampedSW / 2).toFixed(1)}" y="${bodyY.toFixed(1)}" width="${clampedSW.toFixed(1)}" height="${bodyH}" rx="${(clampedSW / 2.6).toFixed(1)}" fill="${sleeperFill}" opacity="0.22" />
        `;
      }

      // Extra / futon dashed border hint
      const dashAttr = bed.isExtra ? 'stroke-dasharray="4 3"' : '';
      const footText = `${bed.widthCm} cm`;
      const occText = options.compact ? '' : (bed.occupant || '');

      return `
        <g>
          <rect x="${x.toFixed(1)}" y="${padY}" width="${bw.toFixed(1)}" height="${bedH}" rx="7" fill="${fill}" stroke="${stroke}" stroke-width="1.6" ${dashAttr} />
          <line x1="${(x + 3).toFixed(1)}" y1="${(padY + bedH * 0.44).toFixed(1)}" x2="${(x + bw - 3).toFixed(1)}" y2="${(padY + bedH * 0.44).toFixed(1)}" stroke="${stroke}" stroke-width="0.9" opacity="0.25" />
          ${pillowsHtml}
          ${sleepersHtml}
          <text x="${(x + bw / 2).toFixed(1)}" y="${(padY + bedH + 13).toFixed(1)}" text-anchor="middle" fill="${stroke}" font-family="Inter, sans-serif" font-size="${options.compact ? '9.5' : '10.5'}" font-weight="700">${footText}</text>
          ${occText ? `<text x="${(x + bw / 2).toFixed(1)}" y="${(padY + bedH + 24).toFixed(1)}" text-anchor="middle" fill="#575B57" font-family="Inter, sans-serif" font-size="9" font-weight="500">${escapeHtml(occText)}</text>` : ''}
        </g>
      `;
    }).join('');

    return `
      <svg viewBox="0 0 ${svgW.toFixed(0)} ${(svgH + (options.compact ? 0 : 8)).toFixed(0)}" class="w-full max-w-[340px] h-auto mx-auto select-none" role="img" aria-label="Proportional top-down bed size diagram">
        ${bedsSvg}
      </svg>
    `;
  }

  /**
   * Renders a true-to-scale top-down SVG room footprint with bathroom zone, beds,
   * and open 28-inch suitcases (75 x 100 cm open clamshell each).
   */
  function renderRoomFootprintSvg(room, accent = 'pine') {
    const area = Math.max(11, Number(room.areaM2) || 18);
    // Horizontal hotel-room orientation (~1.42 : 1 width-to-depth) uses the card width cleanly
    // and keeps all compact/standard Tokyo rooms (12–26 m²) at an identical 1:1 visual scale.
    const roomW_m = Math.sqrt(area * 1.42);
    const roomH_m = area / roomW_m;

    const svgW = 300;
    const svgH = 195;
    const padX = 16;
    const padT = 24;
    const padB = 12;
    const maxScalePxPerM = 34;
    const pxPerM = Math.min(
      maxScalePxPerM,
      (svgW - padX * 2) / roomW_m,
      (svgH - padT - padB) / roomH_m
    );

    const rw = roomW_m * pxPerM;
    const rh = roomH_m * pxPerM;
    const ox = (svgW - rw) / 2;
    const oy = padT + (svgH - padT - padB - rh) / 2;

    const stroke = accent === 'plum' ? '#6B4E71' : accent === 'amber' ? '#9A6324' : '#2E5A47';
    const bedFill = accent === 'plum' ? '#F6F1F7' : accent === 'amber' ? '#FBF5EC' : '#EDF4F0';
    const innerPad = Math.max(4, Math.min(6.5, 0.16 * pxPerM));

    // Open 28" suitcase footprint laid flat (1.00 m wide × 0.75 m tall)
    const suitW = 1.0 * pxPerM;
    const suitH = 0.75 * pxPerM;
    const bedLenPx = Math.min(1.95 * pxPerM, Math.max(24, rh - suitH - innerPad * 3));

    // Top-left: Bathroom / Entry zone (never extends into the lower suitcase strip)
    const bathW_m = area < 18 ? 1.45 : area < 35 ? 1.75 : 2.35;
    const bathH_m = area < 18 ? 1.85 : area < 35 ? 2.0 : 2.4;
    const bathW = Math.min(rw * 0.34, bathW_m * pxPerM);
    const bathH = Math.min(innerPad + bedLenPx, bathH_m * pxPerM);

    // Top-right: Sleeping zone (strictly to the right of the bath)
    const bedZoneLeft = ox + bathW + innerPad * 1.4;
    const bedZoneRight = ox + rw - innerPad;
    const availBedW = Math.max(20, bedZoneRight - bedZoneLeft);

    const bedGap = Math.max(3, 0.14 * pxPerM);
    const rawBedWidths = room.beds.map((b) => (b.widthCm / 100) * pxPerM);
    const totalRawBedsW = rawBedWidths.reduce((a, b) => a + b, 0) + bedGap * Math.max(0, room.beds.length - 1);
    const bedsFit = totalRawBedsW > availBedW ? availBedW / totalRawBedsW : 1;
    const fittedTotalBedsW = totalRawBedsW * bedsFit;

    let bx = bedZoneRight - fittedTotalBedsW;
    const by = oy + innerPad;
    const bedsHtml = room.beds.map((b, i) => {
      const bw = rawBedWidths[i] * bedsFit;
      const x = bx;
      bx += bw + bedGap * bedsFit;
      const isSis = Boolean(b.isSister || b.occupant === 'Sister');
      const bStroke = isSis ? '#6B4E71' : stroke;
      const bFill = isSis ? '#F6F1F7' : bedFill;
      const pillowH = Math.max(4, Math.min(8, bedLenPx * 0.14));
      const pillowW = Math.max(6, bw - 6);
      return `
        <g>
          <rect x="${x.toFixed(1)}" y="${by.toFixed(1)}" width="${bw.toFixed(1)}" height="${bedLenPx.toFixed(1)}" rx="3.5" fill="${bFill}" stroke="${bStroke}" stroke-width="1.3" ${b.isExtra ? 'stroke-dasharray="3 2"' : ''} />
          <rect x="${(x + (bw - pillowW) / 2).toFixed(1)}" y="${(by + 3).toFixed(1)}" width="${pillowW.toFixed(1)}" height="${pillowH.toFixed(1)}" rx="2" fill="#FFFFFF" stroke="${bStroke}" stroke-width="0.8" opacity="0.9" />
        </g>
      `;
    }).join('');

    // Open floor zone strictly BELOW both the bath and beds — guarantees zero overlap
    const numSuitcases = room.suitcases || 2;
    const floorTop = by + bedLenPx + innerPad;
    const floorBottom = oy + rh - innerPad;
    const floorAvailH = Math.max(10, floorBottom - floorTop);
    const floorLeft = ox + innerPad;
    const floorAvailW = Math.max(20, rw - innerPad * 2);

    const suitGap = Math.max(4, 0.16 * pxPerM);
    const rawSuitRowW = numSuitcases * suitW + Math.max(0, numSuitcases - 1) * suitGap;
    const suitFit = rawSuitRowW > floorAvailW ? floorAvailW / rawSuitRowW : 1;
    const drawSuitW = suitW * suitFit;
    const drawSuitH = Math.min(suitH * suitFit, floorAvailH);
    const drawGap = suitGap * suitFit;
    const totalSuitW = numSuitcases * drawSuitW + Math.max(0, numSuitcases - 1) * drawGap;

    const startSuitX = floorLeft + (floorAvailW - totalSuitW) / 2;
    const startSuitY = floorTop + Math.max(0, (floorAvailH - drawSuitH) / 2);

    let suitcasesHtml = '';
    for (let i = 0; i < numSuitcases; i++) {
      const sx = startSuitX + i * (drawSuitW + drawGap);
      suitcasesHtml += `
        <g opacity="0.92">
          <rect x="${sx.toFixed(1)}" y="${startSuitY.toFixed(1)}" width="${drawSuitW.toFixed(1)}" height="${drawSuitH.toFixed(1)}" rx="2.5" fill="#9E4A35" fill-opacity="0.16" stroke="#9E4A35" stroke-width="1.15" />
          <line x1="${(sx + drawSuitW / 2).toFixed(1)}" y1="${startSuitY.toFixed(1)}" x2="${(sx + drawSuitW / 2).toFixed(1)}" y2="${(startSuitY + drawSuitH).toFixed(1)}" stroke="#9E4A35" stroke-width="0.9" stroke-dasharray="2 1.5" />
        </g>
      `;
    }

    // Luggage clearance verdict
    const usablePerBag = (area - 3.6 - room.beds.reduce((s, b) => s + (b.widthCm / 100) * 2.0, 0)) / Math.max(1, numSuitcases);
    let clearance = { label: 'Spacious packing', cls: 'bg-pine-light text-pine border-pine-border' };
    if (usablePerBag < 2.2) {
      clearance = { label: 'Tight · 1 suitcase open at a time', cls: 'bg-amberWarm-light text-amberWarm border-amberWarm-border' };
    } else if (usablePerBag < 4.5) {
      clearance = { label: 'Manageable · snug with open bags', cls: 'bg-sand text-inkSoft border-stoneLine' };
    } else if (usablePerBag < 9) {
      clearance = { label: 'Comfortable floor clearance', cls: 'bg-pine-light text-pine border-pine-border' };
    }

    return {
      clearance,
      svg: `
        <svg viewBox="0 0 ${svgW} ${svgH}" class="w-full h-auto select-none" role="img" aria-label="Scale floorplan of ${escapeHtml(room.label)}">
          <rect x="0" y="0" width="${svgW}" height="${svgH}" rx="12" fill="#FAF8F4" />
          <!-- Room outer walls -->
          <rect x="${ox.toFixed(1)}" y="${oy.toFixed(1)}" width="${rw.toFixed(1)}" height="${rh.toFixed(1)}" rx="4" fill="#FFFFFF" stroke="#1E211F" stroke-width="1.8" />
          <!-- Top-left Bath / Entry zone -->
          <rect x="${ox.toFixed(1)}" y="${oy.toFixed(1)}" width="${bathW.toFixed(1)}" height="${bathH.toFixed(1)}" fill="#F2EFE9" stroke="#D7D1C4" stroke-width="1" />
          <text x="${(ox + bathW / 2).toFixed(1)}" y="${(oy + bathH / 2 + 3).toFixed(1)}" text-anchor="middle" fill="#838781" font-family="Inter, sans-serif" font-size="8.5" font-weight="600">Bath</text>
          ${bedsHtml}
          ${suitcasesHtml}
          <!-- Dimensions label -->
          <text x="${(ox + rw / 2).toFixed(1)}" y="${(oy - 6).toFixed(1)}" text-anchor="middle" fill="#575B57" font-family="Inter, sans-serif" font-size="9.5" font-weight="600">${area} m² (~${roomW_m.toFixed(1)}m × ${roomH_m.toFixed(1)}m)</text>
        </svg>
      `,
    };
  }

  // ===================================================================
  // BED & ROOM SIZE GUIDE MODAL (DYNAMICALLY INJECTED — NO HTML EDITS)
  // ===================================================================
  function ensureBedGuideUI() {
    // 1. Inject Hero Quick Action button next to "Explore Google Maps" & "Load Shared Picks"
    const mapJumpBtn = document.getElementById('hero-map-jump-btn');
    if (mapJumpBtn && mapJumpBtn.parentElement && !document.getElementById('open-bed-guide-btn')) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'open-bed-guide-btn';
      btn.className = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-medium bg-white hover:bg-sand text-ink border border-stoneLine transition-colors cursor-pointer whitespace-nowrap';
      btn.innerHTML = '<span aria-hidden="true">📏</span><span>Bed &amp; Room Guide</span>';
      btn.addEventListener('click', () => openBedGuideModal(7));
      mapJumpBtn.insertAdjacentElement('afterend', btn);
    }

    // 2. Inject quick launch button inside Desktop Right Rail beside Map Explorer
    const railMapBtn = document.getElementById('rail-open-map-btn');
    if (railMapBtn && railMapBtn.parentElement && !document.getElementById('rail-open-bed-guide-btn')) {
      const wrap = railMapBtn.parentElement;
      const bedBtn = document.createElement('button');
      bedBtn.type = 'button';
      bedBtn.id = 'rail-open-bed-guide-btn';
      bedBtn.className = 'mt-2 w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-white hover:bg-plum-light/60 border border-stoneLine hover:border-plum-border transition-colors cursor-pointer group';
      bedBtn.innerHTML = `
        <span class="inline-flex items-center gap-2 text-xs font-medium text-ink">
          <span aria-hidden="true">📏</span>
          <span>Bed &amp; Room Size Guide</span>
        </span>
        <span class="text-[11px] font-medium text-plum group-hover:translate-x-0.5 transition-transform">SG Scale →</span>
      `;
      bedBtn.addEventListener('click', () => openBedGuideModal(7));
      wrap.appendChild(bedBtn);
    }

    // 3. Inject Modal Shell into document.body
    if (!document.getElementById('bed-guide-modal')) {
      const modal = document.createElement('div');
      modal.id = 'bed-guide-modal';
      modal.className = 'hidden fixed inset-0 z-50 bg-ink/55 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 lg:p-6';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.setAttribute('aria-labelledby', 'bed-guide-modal-title');
      modal.innerHTML = `
        <div class="bg-paper border border-stoneLine rounded-2xl w-full max-w-5xl max-h-[92vh] shadow-2xl overflow-hidden flex flex-col">
          <!-- Modal Header -->
          <div class="px-4 sm:px-6 py-3.5 bg-sand/80 border-b border-stoneLine flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div>
              <div class="text-[10px] uppercase tracking-[0.14em] font-semibold text-maple">Singapore Mattress &amp; Luggage Reference</div>
              <h3 id="bed-guide-modal-title" class="font-serif text-lg sm:text-2xl font-medium text-ink leading-tight">Bed &amp; Room Size Guide</h3>
            </div>
            <div class="flex items-center gap-2">
              <div class="inline-flex p-0.5 rounded-xl bg-white border border-stoneLine" role="tablist" aria-label="Bed guide views">
                <button type="button" data-bg-tab="beds" class="bg-tab-btn px-3 py-1.5 rounded-lg text-xs font-semibold bg-ink text-paper transition-colors cursor-pointer whitespace-nowrap">Bed Widths (SG Scale)</button>
                <button type="button" data-bg-tab="rooms" class="bg-tab-btn px-3 py-1.5 rounded-lg text-xs font-medium text-inkSoft hover:text-ink transition-colors cursor-pointer whitespace-nowrap">Room &amp; Suitcases (m²)</button>
              </div>
              <button type="button" id="close-bed-guide-modal" class="w-8 h-8 rounded-full bg-white/80 hover:bg-white border border-stoneLine text-inkSoft hover:text-ink flex items-center justify-center cursor-pointer transition-colors" aria-label="Close bed guide">✕</button>
            </div>
          </div>

          <!-- Stop & Option Selector Strip -->
          <div id="bed-guide-controls" class="px-4 sm:px-6 py-3 bg-white border-b border-stoneLine space-y-2.5 shrink-0"></div>

          <!-- Scrollable Content Body -->
          <div id="bed-guide-body" class="flex-1 overflow-y-auto rail-scroll p-4 sm:p-6 space-y-5"></div>
        </div>
      `;
      document.body.appendChild(modal);

      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeBedGuideModal();
      });
      document.getElementById('close-bed-guide-modal').addEventListener('click', closeBedGuideModal);
      modal.querySelectorAll('.bg-tab-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          state.bedGuideTab = btn.dataset.bgTab;
          renderBedGuideModal();
        });
      });
    }
  }

  function openBedGuideModal(stopId = 7, optId = null, tab = null) {
    ensureBedGuideUI();
    state.bedGuideStopId = stopId || 7;
    state.bedGuideOptId = optId;
    if (tab) state.bedGuideTab = tab;
    state.bedGuideOpen = true;
    document.getElementById('bed-guide-modal').classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
    renderBedGuideModal();
  }

  function closeBedGuideModal() {
    const modal = document.getElementById('bed-guide-modal');
    if (modal) modal.classList.add('hidden');
    state.bedGuideOpen = false;
    if (!state.mapModalOpen) document.body.classList.remove('overflow-hidden');
  }

  function renderBedReferenceLadderSvg(highlightWidths) {
    const W = 720;
    const rowH = 34;
    const padL = 165;
    const padR = 44;
    const padT = 40;
    const padB = 26;
    const maxCm = 195;
    const plotW = W - padL - padR;
    const H = padT + BED_LADDER_TIERS.length * rowH + padB;
    const cmToX = (cm) => padL + (cm / maxCm) * plotW;

    // SG dashed reference verticals (stagger SG Single vs SG Super Single labels so they never crowd)
    const refLines = SG_MATTRESS_REFS.map((ref) => {
      const x = cmToX(ref.cm);
      const topLabelY = ref.id === 'sg_super' ? padT - 24 : padT - 12;
      return `
        <g>
          <line x1="${x.toFixed(1)}" y1="${padT - 6}" x2="${x.toFixed(1)}" y2="${H - padB + 4}" stroke="#9E4A35" stroke-width="1.2" stroke-dasharray="3 3" opacity="0.55" />
          <text x="${x.toFixed(1)}" y="${topLabelY}" text-anchor="middle" fill="#9E4A35" font-family="Inter, sans-serif" font-size="9" font-weight="700">${ref.shortLabel}</text>
          <text x="${x.toFixed(1)}" y="${H - 8}" text-anchor="middle" fill="#838781" font-family="Inter, sans-serif" font-size="8.5" font-weight="600">${ref.cm} cm</text>
        </g>
      `;
    }).join('');

    const rows = BED_LADDER_TIERS.map((tier, idx) => {
      const y = padT + idx * rowH;
      const barW = (tier.cm / maxCm) * plotW;

      // Determine if Sister, Parents, or Brothers use a bed near this tier width
      const tags = [];
      if (highlightWidths.sister.some((w) => Math.abs(w - tier.cm) <= 5)) tags.push({ txt: 'Sister', fill: '#6B4E71' });
      if (highlightWidths.brothers.some((w) => Math.abs(w - tier.cm) <= 5)) tags.push({ txt: 'Bros', fill: '#2E5A47' });
      if (highlightWidths.parents.some((w) => Math.abs(w - tier.cm) <= 5)) tags.push({ txt: 'Parents', fill: '#575B57' });

      const active = tags.length > 0;
      const barFill = tags.some((t) => t.txt === 'Sister')
        ? '#6B4E71'
        : tags.some((t) => t.txt === 'Bros')
          ? '#2E5A47'
          : active
            ? '#575B57'
            : '#D7D1C4';

      let badgeX = padL + barW + 8;
      const tagsSvg = tags.map((t) => {
        const tw = t.txt.length * 5.8 + 12;
        const bx = badgeX;
        badgeX += tw + 4;
        return `
          <rect x="${bx.toFixed(1)}" y="${(y + 6).toFixed(1)}" width="${tw.toFixed(1)}" height="16" rx="8" fill="${t.fill}" />
          <text x="${(bx + tw / 2).toFixed(1)}" y="${(y + 17).toFixed(1)}" text-anchor="middle" fill="#FFFFFF" font-family="Inter, sans-serif" font-size="8.5" font-weight="700">${t.txt}</text>
        `;
      }).join('');

      return `
        <g>
          <text x="${padL - 10}" y="${(y + 17).toFixed(1)}" text-anchor="end" fill="${active ? '#1E211F' : '#575B57'}" font-family="Inter, sans-serif" font-size="10.5" font-weight="${active ? '700' : '500'}">${escapeHtml(tier.label)}</text>
          <rect x="${padL}" y="${(y + 5).toFixed(1)}" width="${barW.toFixed(1)}" height="18" rx="5" fill="${barFill}" opacity="${active ? '0.9' : '0.45'}" />
          <text x="${(padL + barW - 6).toFixed(1)}" y="${(y + 17).toFixed(1)}" text-anchor="end" fill="${active ? '#FFFFFF' : '#1E211F'}" font-family="Inter, sans-serif" font-size="9.5" font-weight="700">${tier.cm} cm</text>
          ${tagsSvg}
        </g>
      `;
    }).join('');

    return `
      <svg viewBox="0 0 ${W} ${H}" class="w-full h-auto select-none" role="img" aria-label="Japanese hotel bed widths compared against Singapore mattress sizes">
        <rect x="0" y="0" width="${W}" height="${H}" rx="12" fill="#FAF8F4" />
        ${refLines}
        ${rows}
      </svg>
    `;
  }

  function renderBedGuideModal() {
    if (!state.bedGuideOpen || !state.dataLoaded) return;
    const modal = document.getElementById('bed-guide-modal');
    if (!modal) return;

    // Update top tab pills
    modal.querySelectorAll('.bg-tab-btn').forEach((btn) => {
      const active = btn.dataset.bgTab === state.bedGuideTab;
      btn.className = active
        ? 'bg-tab-btn px-3 py-1.5 rounded-lg text-xs font-semibold bg-ink text-paper transition-colors cursor-pointer whitespace-nowrap'
        : 'bg-tab-btn px-3 py-1.5 rounded-lg text-xs font-medium text-inkSoft hover:text-ink transition-colors cursor-pointer whitespace-nowrap';
    });

    const stop = STOPS.find((s) => s.id === state.bedGuideStopId) || STOPS[STOPS.length - 1];
    const lockedNow = isStopLockedForMode(stop, state.mode);
    const visibleOptions = getVisibleOptionsForStop(stop, state.mode);

    const pickedOpt = getSelectedOptionForStop(stop, state.mode);
    const currentOptId = state.bedGuideOptId && visibleOptions.some((o) => o.id === state.bedGuideOptId)
      ? state.bedGuideOptId
      : pickedOpt.id;
    const rawOpt = getOption(stop, currentOptId);
    const opt = resolveOptionData(stop, rawOpt);
    const specs = getBedSpecsForOption(stop, opt, state.mode);
    const isPickedAtStop = lockedNow || pickedOpt.id === opt.id;

    // 1. Controls bar: Stop pills + Option pills + Stop 7 Twin/Double toggle
    const controlsEl = document.getElementById('bed-guide-controls');
    const stopPillsHtml = STOPS.map((s) => {
      const active = s.id === stop.id;
      const shortCity = s.id === 1 ? 'Haneda' : s.id === 7 ? 'Tokyo' : s.city.split(' ')[0];
      return `
        <button type="button" data-bg-stop="${s.id}" class="bg-stop-pill px-2.5 py-1 rounded-full text-[11px] transition-colors cursor-pointer whitespace-nowrap ${active ? 'bg-maple text-white font-semibold' : 'bg-sand text-inkSoft hover:text-ink font-medium'}">
          ${s.id}. ${shortCity}
        </button>
      `;
    }).join('');

    const optPillsHtml = visibleOptions.length > 1
      ? visibleOptions.map((o) => {
          const active = o.id === opt.id;
          return `
            <button type="button" data-bg-opt="${o.id}" class="bg-opt-pill px-2.5 py-1 rounded-lg text-[11px] border transition-colors cursor-pointer whitespace-nowrap ${active ? 'bg-pine-light text-pine border-pine font-semibold' : 'bg-paper text-inkSoft border-stoneLine hover:text-ink'}">
              ${o.id} · ${escapeHtml(o.shortName)}
            </button>
          `;
        }).join('')
      : `<span class="text-xs font-medium text-ink">${escapeHtml(opt.name)} <span class="text-inkMuted">(Locked)</span></span>`;

    const tokyoBedToggleHtml = stop.id === 7 && stop.hasStopConfigurator
      ? `
        <div class="inline-flex items-center gap-1.5 ml-auto">
          <span class="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-inkMuted">Bros:</span>
          <div class="inline-flex p-0.5 rounded-lg bg-sand border border-stoneLine text-[11px]">
            <button type="button" data-bg-s7-beds="twin" class="bg-s7-beds px-2 py-0.5 rounded-md cursor-pointer ${state.stop7Beds === 'twin' ? 'bg-pine text-white font-semibold' : 'text-inkSoft'}">Twin</button>
            <button type="button" data-bg-s7-beds="double" class="bg-s7-beds px-2 py-0.5 rounded-md cursor-pointer ${state.stop7Beds === 'double' ? 'bg-pine text-white font-semibold' : 'text-inkSoft'}">Shared Double</button>
          </div>
        </div>
      `
      : '';

    controlsEl.innerHTML = `
      <div class="flex flex-wrap items-center gap-1.5">
        <span class="text-[10px] uppercase tracking-[0.12em] font-semibold text-inkMuted mr-1">Stop:</span>
        ${stopPillsHtml}
        <span class="ml-auto px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-paper text-inkSoft border border-stoneLine">${state.mode === 'M1' ? 'Mode 1 · Hybrid' : 'Mode 2 · All 3+2'}</span>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-[10px] uppercase tracking-[0.12em] font-semibold text-inkMuted">Hotel:</span>
        ${optPillsHtml}
        ${tokyoBedToggleHtml}
      </div>
    `;

    controlsEl.querySelectorAll('.bg-stop-pill').forEach((b) => {
      b.addEventListener('click', () => {
        state.bedGuideStopId = Number(b.dataset.bgStop);
        state.bedGuideOptId = null;
        renderBedGuideModal();
      });
    });
    controlsEl.querySelectorAll('.bg-opt-pill').forEach((b) => {
      b.addEventListener('click', () => {
        state.bedGuideOptId = b.dataset.bgOpt;
        renderBedGuideModal();
      });
    });
    controlsEl.querySelectorAll('.bg-s7-beds').forEach((b) => {
      b.addEventListener('click', () => {
        if (state.stop7Beds !== b.dataset.bgS7Beds) {
          state.stop7Beds = b.dataset.bgS7Beds;
          renderAll(true);
        }
      });
    });

    // 2. Render Body based on active tab
    const bodyEl = document.getElementById('bed-guide-body');
    const pillClassForTone = (tone) => (
      tone === 'plum'
        ? 'bg-plum-light text-plum border-plum-border'
        : tone === 'amber'
          ? 'bg-amberWarm-light text-amberWarm border-amberWarm-border'
          : 'bg-pine-light text-pine border-pine-border'
    );

    if (state.bedGuideTab === 'beds') {
      const broFirstBed = specs.brothers.beds[0];
      const broSg = describeBedVsSg(broFirstBed.widthCm, broFirstBed.sleepers);
      const broSummaryTag = specs.brothers.beds.length > 1
        ? `2× ${broFirstBed.widthCm} cm · ${broSg.text}`
        : `1× ${broFirstBed.widthCm} cm · ${broSg.text}`;

      // Sister & Parents Card(s)
      let parentsSisterCardHtml = '';
      const highlightWidths = {
        sister: [],
        parents: [],
        brothers: specs.brothers.beds.map((b) => b.widthCm),
      };

      if (specs.isSolo && specs.sisterSolo) {
        const sisBed = specs.sisterSolo.beds[0];
        const sisSg = describeBedVsSg(sisBed.widthCm, 1);
        highlightWidths.sister.push(sisBed.widthCm);

        let soloFooterHtml = `
            <div class="pt-2.5 border-t border-stoneLine/80 flex flex-wrap items-center justify-between gap-2 text-[11px] text-inkSoft">
              <span>Room size: <strong class="text-ink">${specs.sisterSolo.areaM2} m²</strong> · Private solo bathroom</span>
              <span>Parents’ room booked separately</span>
            </div>
        `;

        if (specs.isConnecting && specs.parents) {
          const parBed = specs.parents.beds[0];
          const parSg = describeBedVsSg(parBed.widthCm, parBed.sleepers);
          highlightWidths.parents.push(...specs.parents.beds.map((b) => b.widthCm));
          soloFooterHtml = `
            <div class="pt-2.5 border-t border-stoneLine/80 flex flex-wrap items-center justify-between gap-2 text-[11.5px]">
              <div>
                <span class="font-semibold text-ink">Parents’ Room:</span>
                <span class="text-inkSoft">${escapeHtml(specs.parents.label)}</span>
              </div>
              <span class="px-2 py-0.5 rounded-full text-[10px] font-medium border ${pillClassForTone(parSg.tone)}">${specs.parents.beds.length > 1 ? `2× ${parBed.widthCm} cm` : `1× ${parBed.widthCm} cm`} · ${parSg.text}</span>
            </div>
          `;
        }

        const sisBadgeLabel = specs.isConnecting
          ? 'Sister’s Adjoining Room (Connecting Suite)'
          : 'Sister’s Solo Room (2+2+1)';

        parentsSisterCardHtml = `
          <div class="rounded-2xl bg-white border-2 border-plum-border p-4 space-y-3 flex flex-col justify-between">
            <div>
              <div class="flex flex-wrap items-center justify-between gap-2">
                <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-plum-light text-plum border border-plum-border">${sisBadgeLabel}</span>
                <span class="px-2 py-0.5 rounded-full text-[10.5px] font-semibold border ${pillClassForTone(sisSg.tone)}">${sisBed.widthCm} cm · ${sisSg.text}</span>
              </div>
              <h4 class="font-serif text-base font-semibold text-ink mt-1.5">${escapeHtml(specs.sisterSolo.label)}</h4>
              <div class="mt-2 py-2 rounded-xl bg-paper border border-stoneLine/70">
                ${renderBedGroupSvg(specs.sisterSolo.beds)}
              </div>
              <p class="text-xs text-inkSoft mt-2 leading-relaxed">${escapeHtml(specs.sisterSolo.note)}</p>
            </div>
            ${soloFooterHtml}
          </div>
        `;
      } else if (specs.parentsSister) {
        const sisBed = specs.parentsSister.beds.find((b) => b.isSister) || specs.parentsSister.beds[specs.parentsSister.beds.length - 1];
        const parBeds = specs.parentsSister.beds.filter((b) => !b.isSister);
        const sisSg = describeBedVsSg(sisBed.widthCm, 1);
        highlightWidths.sister.push(sisBed.widthCm);
        highlightWidths.parents.push(...parBeds.map((b) => b.widthCm));

        parentsSisterCardHtml = `
          <div class="rounded-2xl bg-white border-2 border-plum-border p-4 space-y-3 flex flex-col justify-between">
            <div>
              <div class="flex flex-wrap items-center justify-between gap-2">
                <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-plum-light text-plum border border-plum-border">Parents + Sister (3+2 Shared Room)</span>
                <span class="px-2 py-0.5 rounded-full text-[10.5px] font-semibold border ${pillClassForTone(sisSg.tone)}">Sister: ${sisBed.widthCm} cm (${sisBed.type})</span>
              </div>
              <h4 class="font-serif text-base font-semibold text-ink mt-1.5">${escapeHtml(specs.parentsSister.label)}</h4>
              <div class="mt-2 py-2 rounded-xl bg-paper border border-stoneLine/70">
                ${renderBedGroupSvg(specs.parentsSister.beds)}
              </div>
              <p class="text-xs text-inkSoft mt-2 leading-relaxed">${escapeHtml(specs.parentsSister.note)}</p>
            </div>
            <div class="pt-2.5 border-t border-stoneLine/80 flex flex-wrap items-center justify-between gap-2 text-[11px] text-inkSoft">
              <span>Sister’s bed vs. SG: <strong class="text-ink">${sisSg.text}</strong></span>
              <span>Parents: <strong class="text-ink">${parBeds.map((b) => `${b.widthCm} cm`).join(' + ')}</strong></span>
            </div>
          </div>
        `;
      }

      bodyEl.innerHTML = `
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div class="text-[11px] uppercase tracking-[0.12em] font-semibold text-maple">Stop ${stop.id} · ${escapeHtml(stop.city)} (${stop.nights}N)</div>
            <div class="font-serif text-xl font-medium text-ink">${escapeHtml(opt.name)} ${isPickedAtStop ? '<span class="ml-1.5 px-2 py-0.5 rounded-full font-sans text-[10.5px] font-semibold bg-pine text-white align-middle">Current Pick</span>' : ''}</div>
          </div>
          <div class="text-[11px] text-inkMuted">Silhouettes drawn to scale (~48 cm adult shoulders)</div>
        </div>

        <!-- Side-by-Side: Sister & Parents' Room | Brothers' Room -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          ${parentsSisterCardHtml}

          <div class="rounded-2xl bg-white border-2 ${broSg.tone === 'amber' ? 'border-amberWarm-border' : 'border-pine-border'} p-4 space-y-3 flex flex-col justify-between">
            <div>
              <div class="flex flex-wrap items-center justify-between gap-2">
                <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-pine-light text-pine border border-pine-border">Brothers’ Room</span>
                <span class="px-2 py-0.5 rounded-full text-[10.5px] font-semibold border ${pillClassForTone(broSg.tone)}">${broSummaryTag}</span>
              </div>
              <h4 class="font-serif text-base font-semibold text-ink mt-1.5">${escapeHtml(specs.brothers.label)}</h4>
              <div class="mt-2 py-2 rounded-xl bg-paper border border-stoneLine/70">
                ${renderBedGroupSvg(specs.brothers.beds, { joined: Boolean(specs.brothers.joinedBeds) })}
              </div>
              <p class="text-xs text-inkSoft mt-2 leading-relaxed">${escapeHtml(specs.brothers.note)}</p>
            </div>
            <div class="pt-2.5 border-t border-stoneLine/80 flex flex-wrap items-center justify-between gap-2 text-[11px] text-inkSoft">
              <span>Total sleeping width: <strong class="text-ink">${specs.brothers.beds.reduce((s, b) => s + b.widthCm, 0)} cm</strong></span>
              <span>${specs.brothers.beds.length === 1 ? '1 shared mattress' : '2 separate mattresses'}</span>
            </div>
          </div>
        </div>

        <!-- Singapore Mattress Comparison Ladder -->
        <div class="rounded-2xl bg-white border border-stoneLine p-4 sm:p-5 space-y-2.5">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h4 class="font-serif text-lg font-medium text-ink">How Japanese Hotel Beds Compare to Singapore Mattresses</h4>
              <p class="text-xs text-inkSoft">Dashed red lines show standard Singapore widths (Single 91 · Super Single 107 · Queen 152 · King 183 cm). Colored pills mark the beds used on Stop ${stop.id}.</p>
            </div>
          </div>
          ${renderBedReferenceLadderSvg(highlightWidths)}
        </div>
      `;
    } else {
      // TAB 2: ROOM FOOTPRINTS & OPEN 28" SUITCASES
      const roomsToDraw = [];
      if (specs.isSolo && specs.sisterSolo) {
        roomsToDraw.push({
          role: specs.isConnecting ? 'Sister’s Adjoining Room' : 'Sister’s Solo Room',
          accent: 'plum',
          room: specs.sisterSolo,
        });
        if (specs.isConnecting && specs.parents) {
          roomsToDraw.push({ role: 'Parents’ Adjoining Room', accent: 'pine', room: specs.parents });
        }
      } else if (specs.parentsSister) {
        roomsToDraw.push({ role: 'Parents + Sister’s Room', accent: 'plum', room: specs.parentsSister });
      }
      const broTone = describeBedVsSg(specs.brothers.beds[0].widthCm, specs.brothers.beds[0].sleepers).tone;
      roomsToDraw.push({ role: 'Brothers’ Room', accent: broTone === 'amber' ? 'amber' : 'pine', room: specs.brothers });

      const cardsHtml = roomsToDraw.map((item) => {
        const fp = renderRoomFootprintSvg(item.room, item.accent);
        return `
          <div class="rounded-2xl bg-white border border-stoneLine p-4 space-y-2.5 flex flex-col justify-between">
            <div>
              <div class="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                <span class="text-[10.5px] uppercase tracking-[0.11em] font-semibold ${item.accent === 'plum' ? 'text-plum' : 'text-pine'}">${escapeHtml(item.role)}</span>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold border ${fp.clearance.cls}">${fp.clearance.label}</span>
              </div>
              <h4 class="font-serif text-base font-semibold text-ink leading-snug">${escapeHtml(item.room.label)}</h4>
              <div class="mt-2.5">${fp.svg}</div>
            </div>
            <p class="text-[11.5px] text-inkSoft leading-relaxed">${escapeHtml(item.room.note)}</p>
          </div>
        `;
      }).join('');

      // 7-Stop Itinerary Room Size Comparison Bars (Brothers vs. Sister's Room)
      const itineraryBarsHtml = STOPS.map((s) => {
        const sOpt = getSelectedOptionForStop(s, state.mode);
        const sSpec = getBedSpecsForOption(s, sOpt, state.mode);
        const broM2 = sSpec.brothers.areaM2;
        const sisRoom = sSpec.isSolo ? sSpec.sisterSolo : sSpec.parentsSister;
        const sisM2 = sisRoom ? sisRoom.areaM2 : broM2;
        const broPct = Math.min(100, Math.round((broM2 / 83) * 100));
        const sisPct = Math.min(100, Math.round((sisM2 / 83) * 100));
        const isCur = s.id === stop.id;

        return `
          <button type="button" data-bg-jump-stop="${s.id}" class="bg-jump-stop w-full text-left p-2.5 rounded-xl border transition-colors cursor-pointer ${isCur ? 'bg-pine-light/45 border-pine' : 'bg-paper/70 border-stoneLine hover:bg-white'}">
            <div class="flex items-center justify-between gap-2 text-xs mb-1.5">
              <span class="font-semibold text-ink">Stop ${s.id} · ${escapeHtml(s.city.split(' ')[0])} <span class="font-normal text-inkMuted">(${escapeHtml(sOpt.shortName)})</span></span>
              <span class="text-[11px] text-inkSoft tabular-nums">Sis: <strong class="text-plum">${sisM2} m²</strong> ${sSpec.isSolo ? '(solo)' : '(3p)'} · Bros: <strong class="text-pine">${broM2} m²</strong></span>
            </div>
            <div class="space-y-1">
              <div class="w-full h-1.5 rounded-full bg-sand overflow-hidden"><div class="h-full rounded-full bg-plum" style="width:${Math.max(10, sisPct)}%"></div></div>
              <div class="w-full h-1.5 rounded-full bg-sand overflow-hidden"><div class="h-full rounded-full bg-pine" style="width:${Math.max(10, broPct)}%"></div></div>
            </div>
          </button>
        `;
      }).join('');

      bodyEl.innerHTML = `
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div class="text-[11px] uppercase tracking-[0.12em] font-semibold text-maple">Stop ${stop.id} · ${escapeHtml(stop.city)} (${stop.nights}N)</div>
            <div class="font-serif text-xl font-medium text-ink">${escapeHtml(opt.name)}</div>
          </div>
          <div class="flex flex-wrap items-center gap-3 text-[11px] text-inkSoft">
            <span class="inline-flex items-center gap-1"><span class="w-3 h-3 rounded-xs bg-maple/20 border border-maple inline-block"></span>Open 28" suitcase (75×100 cm)</span>
            <span class="inline-flex items-center gap-1"><span class="w-3 h-3 rounded-xs bg-sand border border-stoneLine inline-block"></span>Bath / Entry</span>
          </div>
        </div>

        <div class="grid grid-cols-1 ${roomsToDraw.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-4">
          ${cardsHtml}
        </div>

        <div class="rounded-2xl bg-white border border-stoneLine p-4 sm:p-5 space-y-2.5">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h4 class="font-serif text-lg font-medium text-ink">Room Size Across Your 7-Stop Trip</h4>
            <div class="flex items-center gap-3 text-[11px] text-inkSoft">
              <span class="inline-flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-full bg-plum"></span>Sister’s Room</span>
              <span class="inline-flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-full bg-pine"></span>Brothers’ Room</span>
            </div>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">${itineraryBarsHtml}</div>
        </div>
      `;

      bodyEl.querySelectorAll('.bg-jump-stop').forEach((b) => {
        b.addEventListener('click', () => {
          state.bedGuideStopId = Number(b.dataset.bgJumpStop);
          state.bedGuideOptId = null;
          renderBedGuideModal();
        });
      });
    }
  }

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
    getVisibleOptionsForStop(stop, state.mode).forEach((rawOpt) => {
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

  /**
   * Distinguishes connecting-room options (where Parents + Sister have internal
   * connecting rooms, e.g. Super Hotel Premier Ginza & Sotetsu Fresa Inn Ginza-Sanchome)
   * from pure solo-only (2+2+1) hotels.
   */
  function isOptionConnecting(opt) {
    if (!opt) return false;
    if (opt.connectingRoom === true || opt.isConnecting === true) return true;
    const id = String(opt.id || '');
    if (id === '7B' || id === '7C') return true;
    const name = String(opt.name || '');
    if (/super\s*hotel|sotetsu\s*fresa/i.test(name)) return true;
    const m2Badge = resolveField(opt.roomBadge, 'M2');
    const m2Breakdown = resolveField(opt.roomBreakdown, 'M2');
    return /connecting/i.test(`${m2Badge || ''} ${m2Breakdown || ''}`);
  }

  /**
   * Returns true if an option ONLY supports a pure solo (non-connecting) room
   * for Sister with no 3+2 triple and no connecting rooms (e.g. 1B Haneda Solo,
   * 7D remm Kyobashi, 7E remm Hibiya).
   */
  function isOptionPureSoloOnly(opt) {
    if (!opt) return false;
    if (isOptionConnecting(opt)) return false;
    if (opt.hideInMode2 === true || opt.only221 === true) return true;
    if (opt.sisterSolo === true) return true;
    if (opt.sisterSolo && typeof opt.sisterSolo === 'object' && Boolean(opt.sisterSolo.M2)) return true;
    return false;
  }

  function isOptionAllowedInMode(opt, mode = state.mode) {
    if (!opt) return false;
    if (mode !== 'M2') return true;
    return !isOptionPureSoloOnly(opt);
  }

  function getVisibleOptionsForStop(stop, mode = state.mode) {
    if (!stop || !Array.isArray(stop.options) || stop.options.length === 0) return [];
    if (isStopLockedForMode(stop, mode)) return [stop.options[0]];
    const allowed = stop.options.filter((o) => isOptionAllowedInMode(o, mode));
    return allowed.length > 0 ? allowed : [stop.options[0]];
  }

  function getDefaultOptionForStop(stop, mode = state.mode) {
    if (!stop || !Array.isArray(stop.options) || stop.options.length === 0) return null;
    if (isStopLockedForMode(stop, mode)) return stop.options[0];
    const sKey = String(stop.id);
    const presetDefaultId = PRESETS[0] && PRESETS[0].picks && PRESETS[0].picks[sKey];
    const candidates = [presetDefaultId, stop.baselineOptionId];
    for (let i = 0; i < candidates.length; i += 1) {
      if (!candidates[i]) continue;
      const found = stop.options.find((o) => o.id === candidates[i] && isOptionAllowedInMode(o, mode));
      if (found) return found;
    }
    return getVisibleOptionsForStop(stop, mode)[0] || stop.options[0];
  }

  function getOptionRoomBadge(opt, mode = state.mode) {
    if (!opt) return '';
    if (mode === 'M2' && isOptionConnecting(opt)) return 'Connecting (3+2)';
    return resolveField(opt.roomBadge, mode);
  }

  function getOptionRoomingLabel(opt, mode = state.mode) {
    if (!opt) return '3+2';
    if (mode === 'M2' && isOptionConnecting(opt)) return 'Connecting (3+2)';
    return isOptionSolo(opt, mode) ? '2+2+1 (Solo)' : '3+2';
  }

  function isPresetAllowedInMode(preset, mode = state.mode) {
    if (!preset || !preset.picks) return false;
    if (mode !== 'M2') return true;
    return Object.keys(preset.picks).every((stopId) => {
      const stop = STOPS.find((s) => s.id === Number(stopId));
      if (!stop || isStopLockedForMode(stop, mode)) return true;
      const opt = stop.options.find((o) => o.id === preset.picks[stopId]);
      return opt ? isOptionAllowedInMode(opt, mode) : true;
    });
  }

  function enforceModeCompatibility(mode = state.mode) {
    const switchedStops = [];
    STOPS.forEach((stop) => {
      const currentId = state.picks[stop.id] || stop.baselineOptionId;
      const currentOpt = getOption(stop, currentId);
      if (isStopLockedForMode(stop, mode)) {
        const lockedOpt = stop.options[0];
        if (lockedOpt && currentOpt && currentOpt.id !== lockedOpt.id) {
          state.picks[stop.id] = lockedOpt.id;
          if (!isOptionAllowedInMode(currentOpt, mode)) {
            switchedStops.push({
              stopId: stop.id,
              city: stop.city.split(' ')[0],
              fromName: currentOpt.shortName || currentOpt.name,
              toName: lockedOpt.shortName || lockedOpt.name,
            });
          }
        }
        return;
      }
      if (currentOpt && !isOptionAllowedInMode(currentOpt, mode)) {
        const fallbackOpt = getDefaultOptionForStop(stop, mode);
        if (fallbackOpt) {
          state.picks[stop.id] = fallbackOpt.id;
          switchedStops.push({
            stopId: stop.id,
            city: stop.city.split(' ')[0],
            fromName: currentOpt.shortName || currentOpt.name,
            toName: fallbackOpt.shortName || fallbackOpt.name,
          });
        }
      }
    });
    return switchedStops;
  }

  function getOption(stop, optId) {
    return stop.options.find((o) => o.id === optId) || stop.options[0];
  }

  function getSelectedOptionForStop(stop, mode = state.mode, picks = state.picks, bedsOverride = state.stop7Beds, mealOverride = state.stop7Meal) {
    const lockedNow = isStopLockedForMode(stop, mode);
    const pickedId = lockedNow ? stop.options[0].id : (picks[stop.id] || stop.baselineOptionId);
    const raw = getOption(stop, pickedId);
    const validRaw = isOptionAllowedInMode(raw, mode) ? raw : getDefaultOptionForStop(stop, mode);
    return resolveOptionData(stop, validRaw, bedsOverride, mealOverride);
  }

  function isOptionSolo(opt, mode = state.mode) {
    if (!opt || !opt.sisterSolo) return false;
    // In Mode 2, pure-solo options are disallowed and connecting rooms do NOT count toward soloNights (always 0/16)
    if (mode === 'M2') return false;
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
      if (!isPresetAllowedInMode(preset, state.mode)) return false;
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

      if (pendingExternalState) {
        const buffered = pendingExternalState;
        pendingExternalState = null;
        applyStateInternal(buffered);
      }

      loadingEl.classList.add('hidden');
      const compareViewEl = document.getElementById('compare-view');
      const compareIsOpen = Boolean(compareViewEl && !compareViewEl.classList.contains('hidden'));
      if (state.activeView === 'picker' && !compareIsOpen) {
        pickerView.classList.remove('hidden');
      }

      renderDirectory();
      renderAll(false);

      if (typeof global.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
        global.dispatchEvent(new CustomEvent('hokkaido-picker-ready', {
          detail: { stopsCount: STOPS.length },
        }));
      }

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

    const visibleStop7 = getVisibleOptionsForStop(stop7, state.mode);
    const pickedStop7 = getSelectedOptionForStop(stop7, state.mode);
    const hotels = visibleStop7.map((rawOpt) => {
      const opt = resolveOptionData(stop7, rawOpt);
      const [lat, lng] = getTokyoHotelCoords(opt);
      return {
        opt,
        lat,
        lng,
        sgd: jpyToSgd(getOptionJpy(opt, state.mode)),
        isSelected: pickedStop7.id === opt.id,
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

      const visibleStop7Options = getVisibleOptionsForStop(stop7, state.mode);
      selectorLabel.textContent = `Stop 7 · ${stop7.city} (${visibleStop7Options.length} Options) · Tap to pin & select`;

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

      cardsWrap.innerHTML = visibleStop7Options.map((rawOpt) => {
        const opt = resolveOptionData(stop7, rawOpt);
        const isSelected = pickedOpt.id === opt.id;
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

    const visiblePresets = PRESETS.filter((preset) => isPresetAllowedInMode(preset, state.mode));
    container.className = visiblePresets.length === 2
      ? 'grid grid-cols-1 md:grid-cols-2 gap-3.5'
      : 'grid grid-cols-1 md:grid-cols-3 gap-3.5';

    container.innerHTML = visiblePresets.map((preset) => {
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
        if (!preset || !isPresetAllowedInMode(preset, state.mode)) return;
        const nextPicks = {};
        Object.keys(preset.picks).forEach((k) => { nextPicks[Number(k)] = preset.picks[k]; });
        state.picks = nextPicks;
        if (preset.stop7Beds) state.stop7Beds = preset.stop7Beds;
        if (preset.stop7Meal) state.stop7Meal = preset.stop7Meal;
        enforceModeCompatibility(state.mode);
        renderAll(true);
        showToast(`Applied "${preset.name}" preset`);
      });
    });
  }

  function renderGuideDrawerHtml(stop) {
    const isOpen = Boolean(state.openGuideDrawers[stop.id]);
    const verdictText = resolveField(stop.guide.verdict, state.mode);

    const visibleGuideHotels = (stop.guide.hotels || []).filter((h) => {
      if (state.mode !== 'M2') return true;
      const optMatch = String(h.name || '').match(/\(Option\s+([A-Za-z0-9_]+)\)/i);
      if (optMatch) {
        const matchedOpt = (stop.options || []).find((o) => o.id === optMatch[1]);
        if (matchedOpt && !isOptionAllowedInMode(matchedOpt, 'M2')) return false;
      }
      return true;
    });

    const hotelsHtml = visibleGuideHotels.map((h) => `
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
          <button type="button" data-bed-guide-stop="${stop.id}" class="bed-guide-trigger-btn inline-flex items-center gap-1 text-xs font-medium text-plum hover:underline underline-offset-2 transition-colors cursor-pointer">
            <span aria-hidden="true">📏</span>
            <span>Bed &amp; Room Sizes</span>
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
    const pickedOpt = getSelectedOptionForStop(stop, state.mode);
    const specs = getBedSpecsForOption(stop, pickedOpt, state.mode);

    const broBed = specs.brothers.beds[0];
    const broSg = describeBedVsSg(broBed.widthCm, broBed.sleepers);
    const broTitle = specs.brothers.beds.length > 1
      ? `2× ${broBed.widthCm} cm Twin`
      : `1× ${broBed.widthCm} cm Shared`;

    const sisRoom = specs.isSolo && specs.sisterSolo ? specs.sisterSolo : specs.parentsSister;
    const sisBed = specs.isSolo && specs.sisterSolo
      ? specs.sisterSolo.beds[0]
      : (specs.parentsSister.beds.find((b) => b.isSister) || specs.parentsSister.beds[specs.parentsSister.beds.length - 1]);
    const sisSg = describeBedVsSg(sisBed.widthCm, 1);
    const sisHeading = specs.isConnecting
      ? `Sister Adjoining: ${sisBed.widthCm} cm (${sisRoom.areaM2} m²)`
      : specs.isSolo
        ? `Sister Solo: ${sisBed.widthCm} cm (${sisRoom.areaM2} m²)`
        : `Parents + Sister: ${sisBed.widthCm} cm ${sisBed.type} (${sisRoom.areaM2} m²)`;
    const totalConnArea = specs.parents && specs.sisterSolo
      ? Math.round((Number(specs.sisterSolo.areaM2) || 12) + (Number(specs.parents.areaM2) || 12))
      : (sisRoom.areaM2 || 12) * 2;
    const sisSubnote = specs.isConnecting
      ? `Adjoining room & bath inside ${totalConnArea} m² Connecting Suite w/ Parents`
      : specs.isSolo
        ? 'Own solo room & private bathroom (no extra bed)'
        : '3-pax shared room · Parents take the 2 main beds';

    return `
      <div class="mb-4 p-3.5 sm:p-4 rounded-2xl bg-sand/70 border border-stoneLine space-y-3.5">
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

        <!-- IDEA 2: Live Bed Size Scale Strip (Brothers + Sister/Parents for Selected Tokyo Hotel) -->
        <div class="pt-3 border-t border-stoneLine/80">
          <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
            <span class="text-[10.5px] uppercase tracking-[0.12em] font-semibold text-inkMuted">
              Live Bed Scale · ${escapeHtml(pickedOpt.shortName)} (vs. SG Queen 152 cm / Super Single 107 cm)
            </span>
            <button type="button" data-bed-guide-stop="7" class="bed-guide-trigger-btn inline-flex items-center gap-1 text-[11px] font-semibold text-pine hover:underline underline-offset-2 cursor-pointer">
              <span aria-hidden="true">📏</span>
              <span>Compare All Beds &amp; Suitcases →</span>
            </button>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div class="p-2.5 rounded-xl bg-white border ${broSg.tone === 'amber' ? 'border-amberWarm-border' : 'border-stoneLine'} flex items-center gap-3">
              <div class="w-28 sm:w-32 shrink-0">${renderBedGroupSvg(specs.brothers.beds, { compact: true })}</div>
              <div class="min-w-0 text-[11px]">
                <div class="font-semibold text-ink">Brothers: ${broTitle} (${specs.brothers.areaM2} m²)</div>
                <div class="mt-0.5 font-medium ${broSg.tone === 'amber' ? 'text-amberWarm' : 'text-pine'}">${broSg.text}</div>
                <div class="text-[10.5px] text-inkMuted mt-0.5 leading-snug">${state.stop7Beds === 'double' ? 'Cozy shoulder-to-shoulder for 2 adults' : 'Separate beds & duvets for both brothers'}</div>
              </div>
            </div>

            <div class="p-2.5 rounded-xl bg-white border border-plum-border/80 flex items-center gap-3">
              <div class="w-28 sm:w-32 shrink-0">${renderBedGroupSvg(sisRoom.beds, { compact: true })}</div>
              <div class="min-w-0 text-[11px]">
                <div class="font-semibold text-ink">${escapeHtml(sisHeading)}</div>
                <div class="mt-0.5 font-medium ${sisSg.tone === 'amber' ? 'text-amberWarm' : 'text-plum'}">Sister: ${sisSg.text}</div>
                <div class="text-[10.5px] text-inkMuted mt-0.5 leading-snug">${escapeHtml(sisSubnote)}</div>
              </div>
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

      const visibleOptions = getVisibleOptionsForStop(stop, state.mode);
      const selectedOpt = getSelectedOptionForStop(stop, state.mode);
      const pickedId = selectedOpt.id;
      const selectedSgd = jpyToSgd(getOptionJpy(selectedOpt, state.mode));

      const optionsHtml = visibleOptions.map((rawOpt) => {
        const opt = resolveOptionData(stop, rawOpt);
        const isSelected = pickedId === opt.id;
        const sgd = jpyToSgd(getOptionJpy(opt, state.mode));
        const diffVsSelected = sgd - selectedSgd;
        const solo = isOptionSolo(opt, state.mode);
        const isConnM2 = state.mode === 'M2' && isOptionConnecting(opt);
        const badgeText = getOptionRoomBadge(opt, state.mode);
        const breakdownText = resolveField(opt.roomBreakdown, state.mode);
        const bullets = resolveField(opt.tradeOffs, state.mode) || [];
        const rawWarningBadge = opt.warningBadge ? resolveField(opt.warningBadge, state.mode) : '';
        // Suppress scarcity/urgency badges (e.g. "1 Twin room left") so they don't distort decisions
        const warningBadgeText = /\b(left|remaining|hurry|almost\s*gone|last\s*room)\b/i.test(rawWarningBadge)
          ? ''
          : rawWarningBadge;

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

        const badgeClass = isConnM2
          ? 'bg-pine-light text-pine border border-pine-border font-semibold'
          : (solo ? 'bg-plum-light text-plum border border-plum-border' : 'bg-paper text-inkSoft border border-stoneLine');

        return `
          <div role="button" tabindex="0" data-stop-id="${stop.id}" data-opt-id="${opt.id}" class="option-card group rounded-2xl border-2 p-4 sm:p-5 transition-all cursor-pointer flex flex-col justify-between gap-3.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-pine ${isSelected ? 'border-pine bg-pine-light/45 shadow-[0_3px_14px_rgba(46,90,71,0.10)]' : 'border-stoneLine bg-white hover:border-inkMuted'}">
            <div>
              <div class="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                <div class="flex flex-wrap items-center gap-1.5">
                  <span class="px-2 py-0.5 rounded-md text-[10.5px] font-semibold bg-sand text-inkSoft">${opt.id}</span>
                  <span class="px-2 py-0.5 rounded-full text-[10.5px] font-medium ${badgeClass}">${badgeText}</span>
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
    container.querySelectorAll('.bed-guide-trigger-btn').forEach((btn) => {
      btn.addEventListener('click', () => openBedGuideModal(Number(btn.dataset.bedGuideStop)));
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
      const isConnM2 = state.mode === 'M2' && isOptionConnecting(opt);
      const breakdown = resolveField(opt.roomBreakdown, state.mode);

      return `
        <div class="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2 text-[11px] text-inkMuted">
              <span class="font-semibold text-maple">Stop ${stop.id} · ${stop.city}</span>
              <span>·</span>
              <span>${stop.dates} (${stop.nights}N)</span>
              ${lockedNow ? '<span class="px-1.5 py-0.5 rounded bg-sand text-inkSoft font-medium">Locked</span>' : ''}
              ${isConnM2 ? '<span class="px-1.5 py-0.5 rounded bg-pine-light text-pine font-medium">Connecting (3+2)</span>' : (solo ? '<span class="px-1.5 py-0.5 rounded bg-plum-light text-plum font-medium">Sister Solo</span>' : '')}
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
        const isConnM2 = state.mode === 'M2' && isOptionConnecting(opt);
        const shortCity = stop.city.split(' ')[0];

        return `
          <button type="button" data-jump-stop="${stop.id}" class="rail-stop-jump w-full text-left px-3 py-2 hover:bg-white transition-colors flex items-center justify-between gap-2 cursor-pointer">
            <div class="min-w-0 flex items-center gap-2">
              <span class="w-4 h-4 rounded-full text-[10px] font-semibold flex items-center justify-center shrink-0 ${lockedNow ? 'bg-ink text-paper' : 'bg-maple/15 text-maple'}">${stop.id}</span>
              <div class="min-w-0">
                <div class="text-xs font-medium text-ink truncate">${opt.shortName}</div>
                <div class="text-[10.5px] text-inkMuted flex items-center gap-1.5">
                  <span>${shortCity} · ${stop.nights}N</span>
                  ${isConnM2 ? '<span class="inline-flex items-center gap-1 text-pine font-medium">Connecting (3+2)</span>' : (solo ? '<span class="inline-flex items-center gap-1 text-plum font-medium"><span class="w-1.5 h-1.5 rounded-full bg-plum"></span>Solo</span>' : '')}
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
    renderModeAndFx();
    renderPresets();
    renderStops();
    renderTotalsAndSummary(animate);
    renderGoogleMapsPanel();
    if (state.bedGuideOpen) renderBedGuideModal();

    if (global.HokkaidoAuditModule) {
      global.HokkaidoAuditModule.syncFx();
      if (state.activeView === 'audit') {
        global.HokkaidoAuditModule.render();
      }
    }
  }

  // ===================================================================
  // TOAST, CLIPBOARD, EXPORT & JSON STATE SYNC API
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

  function openExportModal() {
    document.getElementById('export-textarea').value = buildExportText();
    document.getElementById('export-modal').classList.remove('hidden');
  }

  function closeExportModal() {
    document.getElementById('export-modal').classList.add('hidden');
  }

  /**
   * Returns a plain, JSON-serializable deep-cloned snapshot of the current picker state
   * (rooming mode, FX rate, Stop 7 toggles, and every stop's selected option & meal choices).
   * Per-stop selections are keyed consistently by String(stop.id) inside `picks` and `stops`
   * so individual stop keys can be merged cleanly across saved itineraries.
   */
  function getState() {
    const picksCopy = {};
    const stopsSnapshot = {};

    if (state.dataLoaded && STOPS.length > 0) {
      STOPS.forEach((stop) => {
        const sKey = String(stop.id);
        const opt = getSelectedOptionForStop(stop, state.mode);
        const optId = opt ? opt.id : (state.picks[stop.id] || stop.baselineOptionId || null);
        picksCopy[sKey] = stop.hasStopConfigurator
          ? { optionId: optId, beds: state.stop7Beds, meal: state.stop7Meal }
          : optId;
        const entry = {
          optionId: optId,
          hotel: opt ? opt.name : null,
          mealTag: opt ? opt.mealTag : null,
        };
        if (stop.hasStopConfigurator) {
          entry.beds = state.stop7Beds;
          entry.meal = state.stop7Meal;
        }
        stopsSnapshot[sKey] = entry;
      });
    } else {
      Object.keys(state.picks).forEach((k) => {
        picksCopy[String(k)] = state.picks[k];
      });
    }

    const fxNum = Number(state.fxRate);
    return JSON.parse(JSON.stringify({
      mode: state.mode,
      fx: fxNum,
      fxRate: fxNum,
      stop7Beds: state.stop7Beds,
      stop7Meal: state.stop7Meal,
      picks: picksCopy,
      stops: stopsSnapshot,
    }));
  }

  /**
   * Pure, side-effect-free validator/normalizer for external state snapshots.
   * Never mutates live `state` or touches the DOM.
   * Safely falls back to stop defaults for any missing, unknown, or retired option IDs.
   */
  function normalizeStateSnapshot(inputState, options = {}) {
    const src = (inputState && typeof inputState === 'object') ? inputState : {};
    const fallbackMode = options.fallbackMode || 'M1';
    const fallbackFx = Number.isFinite(options.fallbackFx) ? options.fallbackFx : Number(CONFIG.defaultFxRate);

    // 1. Rooming mode (M1 / M2)
    let resolvedMode = fallbackMode;
    if (typeof src.mode === 'string') {
      const m = src.mode.trim().toUpperCase();
      if (m === 'M1' || m === 'M2') resolvedMode = m;
    }

    // 2. FX rate (optional valid fxOverride takes precedence over src.fx / src.fxRate)
    let resolvedFx = fallbackFx;
    const rawFxCandidates = [options.fxOverride, src.fx, src.fxRate];
    for (let i = 0; i < rawFxCandidates.length; i += 1) {
      const cand = rawFxCandidates[i];
      if (cand !== undefined && cand !== null && cand !== '') {
        const num = Number(cand);
        if (Number.isFinite(num) && num >= 60 && num <= 220) {
          resolvedFx = num;
          break;
        }
      }
    }

    // 3. Stop 7 configurator toggles (beds: twin/double, meal: ro/bf)
    const stop7Data = STOPS.find((s) => s.id === 7);
    const defaultStop7Beds = (stop7Data && stop7Data.defaultVariant && stop7Data.defaultVariant.beds)
      || (PRESETS[0] && PRESETS[0].stop7Beds)
      || 'twin';
    const defaultStop7Meal = (stop7Data && stop7Data.defaultVariant && stop7Data.defaultVariant.meal)
      || (PRESETS[0] && PRESETS[0].stop7Meal)
      || 'ro';

    const inputMap = (src.picks && typeof src.picks === 'object')
      ? src.picks
      : (src.selections && typeof src.selections === 'object')
        ? src.selections
        : null;
    const inputStops = (src.stops && typeof src.stops === 'object' && !Array.isArray(src.stops))
      ? src.stops
      : null;

    const pick7Raw = inputMap ? (inputMap['7'] !== undefined ? inputMap['7'] : inputMap[7]) : undefined;
    const pick7Obj = (pick7Raw && typeof pick7Raw === 'object') ? pick7Raw : null;
    const stop7Entry = inputStops ? (inputStops['7'] || inputStops[7]) : null;

    const rawBeds = (pick7Obj && pick7Obj.beds !== undefined)
      ? pick7Obj.beds
      : src.stop7Beds !== undefined
        ? src.stop7Beds
        : (stop7Entry && stop7Entry.beds !== undefined ? stop7Entry.beds : options.fallbackBeds);
    const rawMeal = (pick7Obj && pick7Obj.meal !== undefined)
      ? pick7Obj.meal
      : src.stop7Meal !== undefined
        ? src.stop7Meal
        : (stop7Entry && stop7Entry.meal !== undefined ? stop7Entry.meal : options.fallbackMeal);

    let resolvedBeds = defaultStop7Beds;
    if (rawBeds !== undefined && rawBeds !== null) {
      const b = String(rawBeds).trim().toLowerCase();
      if (b === 'twin' || b === 'double') resolvedBeds = b;
    }

    let resolvedMeal = defaultStop7Meal;
    if (rawMeal !== undefined && rawMeal !== null) {
      const ml = String(rawMeal).trim().toLowerCase();
      if (ml === 'ro' || ml === 'bf') resolvedMeal = ml;
    }

    // 4. Per-stop validated picks map (numeric stop.id keys for internal computeTotalsForPicks)
    const resolvedPicks = {};
    STOPS.forEach((stop) => {
      const sKey = String(stop.id);
      const defaultOpt = getDefaultOptionForStop(stop, resolvedMode);
      const defaultOptId = (defaultOpt && defaultOpt.id)
        || stop.baselineOptionId
        || (stop.options[0] && stop.options[0].id);

      if (isStopLockedForMode(stop, resolvedMode)) {
        resolvedPicks[stop.id] = (stop.options[0] && stop.options[0].id) || defaultOptId;
        return;
      }

      let requestedId = null;
      if (inputMap && (sKey in inputMap || stop.id in inputMap)) {
        const rawVal = inputMap[sKey] !== undefined ? inputMap[sKey] : inputMap[stop.id];
        if (typeof rawVal === 'string') requestedId = rawVal;
        else if (rawVal && typeof rawVal === 'object' && typeof rawVal.optionId === 'string') requestedId = rawVal.optionId;
      } else if (inputStops && (sKey in inputStops || stop.id in inputStops)) {
        const stObj = inputStops[sKey] !== undefined ? inputStops[sKey] : inputStops[stop.id];
        if (stObj && typeof stObj === 'object' && typeof stObj.optionId === 'string') requestedId = stObj.optionId;
      }

      const matched = typeof requestedId === 'string'
        ? stop.options.find((o) => o.id === requestedId && isOptionAllowedInMode(o, resolvedMode))
        : null;

      resolvedPicks[stop.id] = matched ? matched.id : defaultOptId;
    });

    return {
      mode: resolvedMode,
      fx: resolvedFx,
      stop7Beds: resolvedBeds,
      stop7Meal: resolvedMeal,
      picks: resolvedPicks,
    };
  }

  /**
   * Pure, side-effect-free evaluator for Brother vs. Sister Comparison tab.
   * Evaluates any saved state snapshot (optionally at a shared fxOverride) without
   * mutating live planner state or touching the DOM.
   */
  function evaluateState(inputState, fxOverride) {
    if (!state.dataLoaded || STOPS.length === 0) return null;

    const norm = normalizeStateSnapshot(inputState, {
      fxOverride,
      fallbackMode: 'M1',
      fallbackFx: Number(CONFIG.defaultFxRate),
    });

    const totals = computeTotalsForPicks(
      norm.picks,
      norm.mode,
      norm.fx,
      norm.stop7Beds,
      norm.stop7Meal
    );

    const evaluatedStops = STOPS.map((stop) => {
      const opt = getSelectedOptionForStop(stop, norm.mode, norm.picks, norm.stop7Beds, norm.stop7Meal);
      const roomingLabel = getOptionRoomingLabel(opt, norm.mode);
      const roomingKey = norm.mode === 'M2' && isOptionConnecting(opt)
        ? 'connecting-3+2'
        : (isOptionSolo(opt, norm.mode) ? 'solo' : '3+2');
      const stopJpy = getOptionJpy(opt, norm.mode);
      const perSiblingSgd = Math.round(stopJpy / norm.fx);
      const mealLabel = opt.mealTag || 'Room Only';
      const hotelId = String(opt.id || '').split('_')[0];
      const optionKey = stop.hasStopConfigurator
        ? `${stop.id}|${opt.id}|${norm.stop7Beds}|${norm.stop7Meal}|${roomingKey}`
        : `${stop.id}|${opt.id}|${roomingKey}|${mealLabel}`;
      const optionLabel = stop.hasStopConfigurator
        ? `${norm.stop7Beds === 'double' ? 'Shared Double' : 'Twin (2 Beds)'} · ${mealLabel}`
        : (getOptionRoomBadge(opt, norm.mode) || opt.shortName || opt.name);

      return {
        stopId: String(stop.id),
        city: stop.city,
        dates: stop.dates,
        nights: Number(stop.nights),
        hotelId,
        hotelName: opt.name,
        optionId: opt.id,
        optionKey,
        optionLabel,
        mealLabel,
        roomingLabel,
        perSiblingSgd,
      };
    });

    return {
      mode: norm.mode,
      modeLabel: norm.mode === 'M2' ? 'Mode 2 · Always 3+2' : 'Mode 1 · Hybrid',
      fx: norm.fx,
      hotelTotalSgd: totals.hotelSgd,
      mealsNetSgd: totals.mealsNetSgd,
      fullTripSgd: totals.fullTripSgd,
      soloNights: totals.soloNights,
      stops: evaluatedStops,
    };
  }

  /**
   * Internal validator/applier used both by applyState() and loadTripData() (if buffered pre-load).
   * Safely ignores unknown/retired option IDs (falling back to that stop's default).
   */
  function applyStateInternal(inputState) {
    if (!inputState || typeof inputState !== 'object') return false;

    const norm = normalizeStateSnapshot(inputState, {
      fallbackMode: state.mode,
      fallbackFx: state.fxRate,
      fallbackBeds: state.stop7Beds,
      fallbackMeal: state.stop7Meal,
    });

    state.mode = norm.mode;
    state.fxRate = norm.fx;
    state.stop7Beds = norm.stop7Beds;
    state.stop7Meal = norm.stop7Meal;
    state.picks = norm.picks;

    // Sync FX input element directly so it updates immediately even if focused
    const fxInput = document.getElementById('fx-input');
    if (fxInput) fxInput.value = formatFx(state.fxRate);

    return true;
  }

  /**
   * Public API: Validates and applies a JSON state snapshot (e.g. from getState() / Google Sheets sync)
   * and triggers a full UI re-render. Buffers safely if called before trip_data_2027.json finishes loading.
   */
  function applyState(nextState) {
    if (!nextState || typeof nextState !== 'object') return false;
    const cloned = JSON.parse(JSON.stringify(nextState));

    if (!state.dataLoaded || STOPS.length === 0) {
      pendingExternalState = cloned;
      return true;
    }

    const applied = applyStateInternal(cloned);
    if (applied) {
      renderAll(true);
    }
    return applied ? getState() : false;
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
    ensureBedGuideUI();

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
        const switched = enforceModeCompatibility(state.mode);
        renderAll(true);
        if (switched.length > 0) {
          const detail = switched.map((s) => `${s.fromName} → ${s.toName}`).join('; ');
          showToast(`Mode 2 (3+2): Switched solo-only pick (${detail})`);
        }
      });
    });

    const fxInput = document.getElementById('fx-input');
    if (fxInput) {
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
    }
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

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeExportModal();
        closeMapModal();
        closeBedGuideModal();
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

  function isReady() {
    return Boolean(state.dataLoaded && STOPS.length > 0);
  }

  global.HokkaidoPickerModule = { init, isReady, getState, applyState, evaluateState };
})(window);
