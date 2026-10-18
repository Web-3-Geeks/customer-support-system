// The lists must be answered from an index, in index order, with no collection scan and no in-memory sort. With a few
// thousand tickets nobody would notice a problem; with a few hundred thousand the admin's default list would read every
// ticket on every page. MongoDB's own query plan (explain) tells us which strategy it picks, so we assert on that.
const mongoose = require("mongoose");
const Ticket = require("../src/models/Ticket");
const TicketMessage = require("../src/models/TicketMessage");
const Notification = require("../src/models/Notification");

const customerId = new mongoose.Types.ObjectId();
const agentId = new mongoose.Types.ObjectId();
const ticketId = new mongoose.Types.ObjectId();

beforeEach(async () => {
  await Promise.all([Ticket.init(), TicketMessage.init(), Notification.init()]);

  const statuses = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"];
  await Ticket.collection.insertMany(
    Array.from({ length: 200 }, (_, i) => ({
      ticketNumber: `TKT-${String(i + 1).padStart(6, "0")}`,
      subject: `Subject ${i}`,
      description: `Description ${i}`,
      createdBy: i % 2 === 0 ? customerId : new mongoose.Types.ObjectId(),
      assignedTo: i % 3 === 0 ? agentId : null,
      status: statuses[i % 4],
      priority: "MEDIUM",
      category: "GENERAL",
      createdAt: new Date(Date.now() - i * 3600000),
      updatedAt: new Date(Date.now() - i * 1800000),
    }))
  );
  await TicketMessage.collection.insertMany(
    Array.from({ length: 200 }, (_, i) => ({
      ticketId: i % 4 === 0 ? ticketId : new mongoose.Types.ObjectId(),
      senderId: customerId,
      message: `m${i}`,
      messageType: "TEXT",
    }))
  );
  await Notification.collection.insertMany(
    Array.from({ length: 200 }, (_, i) => ({
      userId: i % 2 === 0 ? customerId : new mongoose.Types.ObjectId(),
      ticketId: new mongoose.Types.ObjectId(),
      type: "NEW_REPLY",
      title: "t",
      message: "m",
      isRead: i % 3 === 0,
      lastEventAt: new Date(Date.now() - i * 1000),
      createdAt: new Date(),
    }))
  );
});

// Every stage of the winning plan, from the outside in.
const stagesOf = (plan, found = []) => {
  if (!plan) return found;
  found.push(plan.stage);
  stagesOf(plan.inputStage, found);
  (plan.inputStages || []).forEach((stage) => stagesOf(stage, found));
  return found;
};

const expectIndexedPage = async (cursor) => {
  const explained = await cursor.explain("executionStats");
  const stages = stagesOf(explained.queryPlanner.winningPlan);

  expect(stages).toContain("IXSCAN");
  expect(stages).not.toContain("COLLSCAN");
  expect(stages).not.toContain("SORT"); // SORT is the in-memory sort; with a good index it never appears
  // Only the page that was asked for is read, not everything that matches.
  expect(explained.executionStats.totalDocsExamined).toBeLessThanOrEqual(10);
};

const pageOf = (query) => query.skip(0).limit(10);

describe.each([
  ["createdAt", -1],
  ["createdAt", 1],
  ["updatedAt", -1],
  ["updatedAt", 1],
  ["ticketNumber", 1],
  ["ticketNumber", -1],
])("ticket lists sorted by %s (direction %i)", (sortBy, direction) => {
  const sort = { [sortBy]: direction, _id: direction };

  it("serves the admin's list of all tickets from an index", async () => {
    await expectIndexedPage(pageOf(Ticket.find({ $and: [{}] }).sort(sort)));
  });

  // A customer's or an agent's own tickets are few, so reading them all is acceptable for the less common sorts;
  // only the default sort (newest first) must be fully indexed for them.
  if (sortBy === "createdAt") {
    it("serves a customer's own list from an index", async () => {
      await expectIndexedPage(pageOf(Ticket.find({ $and: [{ createdBy: customerId }] }).sort(sort)));
    });

    it("serves an agent's assigned list from an index", async () => {
      await expectIndexedPage(pageOf(Ticket.find({ $and: [{ assignedTo: agentId }] }).sort(sort)));
    });
  }
});

describe("filtered ticket lists", () => {
  const newest = { createdAt: -1, _id: -1 };

  it("serves the status filter from an index", async () => {
    await expectIndexedPage(pageOf(Ticket.find({ $and: [{ status: "OPEN" }] }).sort(newest)));
  });

  it("serves the unassigned list from an index", async () => {
    await expectIndexedPage(pageOf(Ticket.find({ $and: [{ assignedTo: null }] }).sort(newest)));
  });

  it("serves a date range from an index", async () => {
    const range = { $gte: new Date(Date.now() - 30 * 24 * 3600000), $lte: new Date() };
    await expectIndexedPage(pageOf(Ticket.find({ $and: [{ createdAt: range }] }).sort(newest)));
  });
});

describe("messages and notifications", () => {
  it("reads a conversation page by ticket, newest first, from an index", async () => {
    await expectIndexedPage(TicketMessage.find({ ticketId }).sort({ _id: -1 }).limit(10));
  });

  it("reads the page of older messages from an index", async () => {
    await expectIndexedPage(
      TicketMessage.find({ ticketId, _id: { $lt: new mongoose.Types.ObjectId() } }).sort({ _id: -1 }).limit(10)
    );
  });

  it("reads a user's notifications from an index", async () => {
    await expectIndexedPage(pageOf(Notification.find({ userId: customerId }).sort({ lastEventAt: -1, _id: -1 })));
  });

  it("reads a user's unread notifications from an index", async () => {
    await expectIndexedPage(
      pageOf(Notification.find({ userId: customerId, isRead: false }).sort({ lastEventAt: -1, _id: -1 }))
    );
  });
});

describe("index inventory", () => {
  it("keeps the unique ticket number and the notification expiry", async () => {
    const ticketIndexes = await Ticket.collection.indexes();
    const notificationIndexes = await Notification.collection.indexes();

    expect(ticketIndexes.find((index) => index.key.ticketNumber === 1 && index.unique)).toBeDefined();
    expect(notificationIndexes.find((index) => index.expireAfterSeconds !== undefined)).toBeDefined();
  });
});
