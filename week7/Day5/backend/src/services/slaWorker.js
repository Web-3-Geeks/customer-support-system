const Ticket = require("../models/Ticket");
const { ACTIVE_STATUSES, SLA_CLOCK } = require("../utils/slaRules");
const { notifySlaAlert } = require("./notification.service");

// How often the worker looks for deadlines that are close or have passed.
const logger = require("../utils/logger");
const DEFAULT_INTERVAL_MS = 60 * 1000;

// A safety limit for one run, so a long outage cannot turn into one endless loop.
const MAX_ALERTS_PER_CHECK = 200;

// Each check finds tickets whose clock entered a window and whose alert has not been sent yet.
// An alert is "claimed" by setting its flag in the same atomic update that finds the ticket, so
// a second worker (or an overlapping run) can never send the same alert twice.
const CHECKS = [
  {
    clock: SLA_CLOCK.FIRST_RESPONSE,
    breached: false,
    flag: "slaAlerts.firstResponseAtRisk",
    match: (now) => ({
      firstResponseAt: null,
      firstResponseWarnAt: { $lte: now },
      firstResponseDueAt: { $gte: now },
    }),
  },
  {
    clock: SLA_CLOCK.FIRST_RESPONSE,
    breached: true,
    flag: "slaAlerts.firstResponseBreached",
    match: (now) => ({ firstResponseAt: null, firstResponseDueAt: { $lt: now } }),
  },
  {
    clock: SLA_CLOCK.RESOLUTION,
    breached: false,
    flag: "slaAlerts.resolutionAtRisk",
    match: (now) => ({
      resolvedAt: null,
      resolutionWarnAt: { $lte: now },
      resolutionDueAt: { $gte: now },
    }),
  },
  {
    clock: SLA_CLOCK.RESOLUTION,
    breached: true,
    flag: "slaAlerts.resolutionBreached",
    match: (now) => ({ resolvedAt: null, resolutionDueAt: { $lt: now } }),
  },
];

const runCheck = async (check, now) => {
  const filter = { status: { $in: ACTIVE_STATUSES }, ...check.match(now), [check.flag]: null };
  let sent = 0;

  while (sent < MAX_ALERTS_PER_CHECK) {
    const ticket = await Ticket.findOneAndUpdate(filter, { $set: { [check.flag]: now } }, { new: true });
    if (!ticket) break;

    await notifySlaAlert(ticket, check.clock, check.breached);
    sent += 1;
  }
  return sent;
};

// `now` can be passed in, so tests can check any moment in time without waiting for it.
// Deadlines shown in the API never depend on this worker; it only sends the alerts.
const runSlaCheck = async (now = new Date()) => {
  const result = { atRisk: 0, breached: 0 };

  for (const check of CHECKS) {
    const sent = await runCheck(check, now);
    if (check.breached) result.breached += sent;
    else result.atRisk += sent;
  }
  return result;
};

let timer = null;
let running = false;

const stopSlaWorker = () => {
  if (timer) clearInterval(timer);
  timer = null;
};

const startSlaWorker = ({ intervalMs = Number(process.env.SLA_CHECK_INTERVAL_MS) || DEFAULT_INTERVAL_MS } = {}) => {
  if (timer) return stopSlaWorker;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const result = await runSlaCheck();
      if (result.atRisk || result.breached) {
        logger.info("SLA check", { atRisk: result.atRisk, breached: result.breached });
      }
    } catch (error) {
      logger.error("SLA check failed", { err: error });
    } finally {
      running = false;
    }
  };

  tick();
  timer = setInterval(tick, intervalMs);
  timer.unref();
  return stopSlaWorker;
};

module.exports = { runSlaCheck, startSlaWorker, stopSlaWorker };
