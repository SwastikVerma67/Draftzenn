/**
 * Draftzenn — Content Plan store
 * ---------------------------------------------------------------------------
 * DEMO / LOCAL-ONLY STORE.
 *
 * Tracks which opportunities (by id) a creator has added to their content
 * plan. This is intentionally just an id -> { plannedAt, status,
 * statusUpdatedAt } map persisted to localStorage — there is no separate
 * "planned opportunity" data system. The opportunity content itself always
 * comes from js/radar-data.js (DraftzennRadarData.opportunities); this
 * store only remembers *which* ids are planned (and their workflow status),
 * and getPlannedOpportunities() cross-references the two.
 *
 * Workflow status moves an opportunity through STATUSES (Planned -> In
 * Progress -> Published -> Tested). Changing status never removes the
 * opportunity from the plan — only removeFromPlan() does that.
 *
 * When a real backend exists, this whole file can be replaced with one that
 * reads/writes a `content_plan` table instead — nothing else needs to
 * change, since every consumer only talks to the DraftzennPlan interface
 * below.
 * ---------------------------------------------------------------------------
 */

(function (global) {
  'use strict';

  var STORAGE_KEY = 'draftzenn_content_plan_v1';
  var CHANGE_EVENT = 'draftzenn:plan-changed';
  var STATUSES = ['Planned', 'In Progress', 'Published', 'Tested'];
  var DEFAULT_STATUS = STATUSES[0];

  function readStore() {
    try {
      var raw = global.localStorage.getItem(STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : {};
      return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function writeStore(store) {
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch (e) {
      // localStorage unavailable (private browsing, quota, etc.) — the plan
      // just won't persist across reloads this session.
    }
  }

  function emitChange() {
    try {
      document.dispatchEvent(new CustomEvent(CHANGE_EVENT));
    } catch (e) {
      // no-op on environments without CustomEvent support
    }
  }

  function isPlanned(id) {
    if (!id) return false;
    return !!readStore()[id];
  }

  function addToPlan(id) {
    if (!id) return;
    var store = readStore();
    if (!store[id]) {
      store[id] = { plannedAt: new Date().toISOString(), status: DEFAULT_STATUS };
      writeStore(store);
      emitChange();
    }
  }

  function removeFromPlan(id) {
    if (!id) return;
    var store = readStore();
    if (store[id]) {
      delete store[id];
      writeStore(store);
      emitChange();
    }
  }

  function getPlannedIds() {
    return Object.keys(readStore());
  }

  /**
   * Current workflow status for a planned id. Entries created before the
   * status workflow existed have no `status` field yet — those (and any
   * unrecognized value) fall back to DEFAULT_STATUS so old plan data keeps
   * working.
   */
  function getStatus(id) {
    if (!id) return DEFAULT_STATUS;
    var entry = readStore()[id];
    if (!entry) return DEFAULT_STATUS;
    return STATUSES.indexOf(entry.status) !== -1 ? entry.status : DEFAULT_STATUS;
  }

  /**
   * Moves a planned opportunity to a new workflow status. No-ops for ids
   * that aren't currently planned, and for unrecognized status values —
   * this never removes the id from the plan, so Published/Tested content
   * stays visible in My Content Plan.
   */
  function setStatus(id, status) {
    if (!id || STATUSES.indexOf(status) === -1) return;
    var store = readStore();
    if (!store[id]) return;
    if (store[id].status === status) return;
    store[id].status = status;
    store[id].statusUpdatedAt = new Date().toISOString();
    writeStore(store);
    emitChange();
  }

  /**
   * Cross-references the planned-id map against `allOpportunities` (the
   * single source of truth for opportunity content) and returns full
   * opportunity objects, each annotated with `plannedAt`, `planStatus`
   * (the workflow status — kept as a distinct key from the opportunity's
   * own `status` field, which is its Emerging/Rising/Hot trend label) and
   * `planStatusUpdatedAt`. Most-recently planned first. Ids with no
   * matching opportunity are skipped.
   */
  function getPlannedOpportunities(allOpportunities) {
    var store = readStore();
    var byId = {};
    (allOpportunities || []).forEach(function (o) { byId[o.id] = o; });

    return Object.keys(store)
      .map(function (id) {
        var opportunity = byId[id];
        if (!opportunity) return null;
        var merged = {};
        for (var key in opportunity) {
          if (Object.prototype.hasOwnProperty.call(opportunity, key)) merged[key] = opportunity[key];
        }
        merged.plannedAt = store[id].plannedAt;
        merged.planStatus = getStatus(id);
        merged.planStatusUpdatedAt = store[id].statusUpdatedAt || null;
        return merged;
      })
      .filter(Boolean)
      .sort(function (a, b) {
        return new Date(b.plannedAt) - new Date(a.plannedAt);
      });
  }

  function onChange(callback) {
    if (typeof callback !== 'function') return;
    document.addEventListener(CHANGE_EVENT, callback);
  }

  global.DraftzennPlan = {
    isPlanned: isPlanned,
    addToPlan: addToPlan,
    removeFromPlan: removeFromPlan,
    getPlannedIds: getPlannedIds,
    getPlannedOpportunities: getPlannedOpportunities,
    getStatus: getStatus,
    setStatus: setStatus,
    STATUSES: STATUSES,
    DEFAULT_STATUS: DEFAULT_STATUS,
    onChange: onChange,
    CHANGE_EVENT: CHANGE_EVENT
  };
})(window);
