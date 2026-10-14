const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../src/app");
const TicketMessage = require("../src/models/TicketMessage");
const messageService = require("../src/services/message.service");
const { ROLES } = require("../src/utils/constants");
const { MESSAGE_EDIT_WINDOW_MS } = require("../src/utils/messageRules");
const {
  createUserWithToken,
  authHeader,
  createTicketAs,
  assignTicketAs,
  setStatusAs,
} = require("./helpers");

const setupUsers = async () => ({
  customer: await createUserWithToken(ROLES.CUSTOMER, "customer@example.com", "Carol Customer"),
  other: await createUserWithToken(ROLES.CUSTOMER, "other@example.com", "Otto Other"),
  agent: await createUserWithToken(ROLES.AGENT, "agent@example.com", "Aisha Agent"),
  agent2: await createUserWithToken(ROLES.AGENT, "agent2@example.com", "Adam Agent"),
  admin: await createUserWithToken(ROLES.ADMIN, "admin@example.com", "Ada Admin"),
});

// A ticket created by `customer` and assigned to `agent`.
const setupTicket = async () => {
  const users = await setupUsers();
  const created = await createTicketAs(users.customer.token);
  const ticketId = created.body.data.ticket._id;
  await assignTicketAs(users.admin.token, ticketId, users.agent.user._id);
  // Assigning writes a system line; these tests start from an empty conversation.
  await TicketMessage.deleteMany({});
  return { ...users, ticketId };
};

const postMessage = (token, ticketId, message) =>
  request(app)
    .post(`/api/tickets/${ticketId}/messages`)
    .set(authHeader(token))
    .send({ message });

const listMessages = (token, ticketId, query = "") =>
  request(app).get(`/api/tickets/${ticketId}/messages${query}`).set(authHeader(token));

const patchMessage = (token, ticketId, messageId, message) =>
  request(app)
    .patch(`/api/tickets/${ticketId}/messages/${messageId}`)
    .set(authHeader(token))
    .send({ message });

describe("POST /api/tickets/:id/messages", () => {
  it("lets the customer post a message with the sender details", async () => {
    const { customer, ticketId } = await setupTicket();

    const res = await postMessage(customer.token, ticketId, "  Any update on this?  ");

    expect(res.status).toBe(201);
    const { message } = res.body.data;
    expect(message.message).toBe("Any update on this?");
    expect(message.messageType).toBe("TEXT");
    expect(message.ticketId).toBe(ticketId);
    expect(message.senderId.name).toBe("Carol Customer");
    expect(message.senderId.role).toBe("CUSTOMER");
    expect(message.editedAt).toBeNull();
    expect(new Date(message.editableUntil).getTime()).toBe(
      new Date(message.createdAt).getTime() + MESSAGE_EDIT_WINDOW_MS
    );
  });

  it("lets the assigned agent and an admin post", async () => {
    const { agent, admin, ticketId } = await setupTicket();

    const fromAgent = await postMessage(agent.token, ticketId, "Looking into it.");
    const fromAdmin = await postMessage(admin.token, ticketId, "Please keep me posted.");

    expect(fromAgent.status).toBe(201);
    expect(fromAgent.body.data.message.senderId.role).toBe("AGENT");
    expect(fromAdmin.status).toBe(201);
    expect(fromAdmin.body.data.message.senderId.role).toBe("ADMIN");
  });

  it("returns 404 to another customer and to an agent who is not assigned", async () => {
    const { other, agent2, ticketId } = await setupTicket();

    const fromOther = await postMessage(other.token, ticketId, "Hello");
    const fromAgent2 = await postMessage(agent2.token, ticketId, "Hello");

    expect(fromOther.status).toBe(404);
    expect(fromAgent2.status).toBe(404);
    expect(await TicketMessage.countDocuments()).toBe(0);
  });

  it("rejects empty, whitespace-only and too long messages", async () => {
    const { customer, ticketId } = await setupTicket();

    const empty = await postMessage(customer.token, ticketId, "");
    const blank = await postMessage(customer.token, ticketId, "    ");
    const long = await postMessage(customer.token, ticketId, "a".repeat(2001));
    const missing = await request(app)
      .post(`/api/tickets/${ticketId}/messages`)
      .set(authHeader(customer.token))
      .send({});

    expect(empty.status).toBe(400);
    expect(blank.status).toBe(400);
    expect(long.status).toBe(400);
    expect(long.body.message).toMatch(/2000/);
    expect(missing.status).toBe(400);
  });

  it("accepts a message of exactly 2000 characters", async () => {
    const { customer, ticketId } = await setupTicket();

    const res = await postMessage(customer.token, ticketId, "a".repeat(2000));

    expect(res.status).toBe(201);
  });

  it("ignores senderId and messageType sent in the body", async () => {
    const { customer, agent, ticketId } = await setupTicket();

    const res = await request(app)
      .post(`/api/tickets/${ticketId}/messages`)
      .set(authHeader(customer.token))
      .send({
        message: "I am pretending",
        senderId: String(agent.user._id),
        messageType: "SYSTEM",
      });

    expect(res.status).toBe(201);
    expect(res.body.data.message.senderId._id).toBe(String(customer.user._id));
    expect(res.body.data.message.messageType).toBe("TEXT");
  });

  it("does not accept messages on a closed ticket", async () => {
    const { customer, ticketId } = await setupTicket();
    await setStatusAs(customer.token, ticketId, "CLOSED");

    const res = await postMessage(customer.token, ticketId, "One more thing");

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/closed/i);
  });

  it("returns 400 for an invalid ticket id and 404 for an unknown one", async () => {
    const { customer } = await setupTicket();

    const invalid = await postMessage(customer.token, "not-an-id", "Hello");
    const unknown = await postMessage(
      customer.token,
      String(new mongoose.Types.ObjectId()),
      "Hello"
    );

    expect(invalid.status).toBe(400);
    expect(unknown.status).toBe(404);
  });

  it("requires authentication", async () => {
    const { ticketId } = await setupTicket();

    const res = await request(app).post(`/api/tickets/${ticketId}/messages`).send({ message: "Hi" });

    expect(res.status).toBe(401);
  });
});

describe("GET /api/tickets/:id/messages", () => {
  it("returns the conversation oldest first for every participant", async () => {
    const { customer, agent, admin, ticketId } = await setupTicket();
    await postMessage(customer.token, ticketId, "first");
    await postMessage(agent.token, ticketId, "second");
    await postMessage(customer.token, ticketId, "third");

    for (const viewer of [customer, agent, admin]) {
      const res = await listMessages(viewer.token, ticketId);

      expect(res.status).toBe(200);
      expect(res.body.data.messages.map((m) => m.message)).toEqual(["first", "second", "third"]);
      expect(res.body.data.messages[1].senderId.name).toBe("Aisha Agent");
      expect(res.body.results).toBe(3);
      expect(res.body.hasMore).toBe(false);
    }
  });

  it("returns an empty list for a ticket with no messages", async () => {
    const { customer, ticketId } = await setupTicket();

    const res = await listMessages(customer.token, ticketId);

    expect(res.status).toBe(200);
    expect(res.body.data.messages).toEqual([]);
    expect(res.body.hasMore).toBe(false);
  });

  it("hides the conversation from users outside the ticket", async () => {
    const { customer, other, agent2, ticketId } = await setupTicket();
    await postMessage(customer.token, ticketId, "private");

    const fromOther = await listMessages(other.token, ticketId);
    const fromAgent2 = await listMessages(agent2.token, ticketId);

    expect(fromOther.status).toBe(404);
    expect(fromAgent2.status).toBe(404);
  });

  it("stops an agent who was unassigned from reading the conversation", async () => {
    const { customer, agent, agent2, admin, ticketId } = await setupTicket();
    await postMessage(customer.token, ticketId, "hello");
    await assignTicketAs(admin.token, ticketId, agent2.user._id);

    const oldAgent = await listMessages(agent.token, ticketId);
    const newAgent = await listMessages(agent2.token, ticketId);

    expect(oldAgent.status).toBe(404);
    expect(newAgent.status).toBe(200);
  });

  it("only returns messages of the requested ticket", async () => {
    const { customer, ticketId } = await setupTicket();
    const second = await createTicketAs(customer.token, { subject: "Another problem" });
    const secondId = second.body.data.ticket._id;
    await postMessage(customer.token, ticketId, "ticket one");
    await postMessage(customer.token, secondId, "ticket two");

    const res = await listMessages(customer.token, ticketId);

    expect(res.body.data.messages.map((m) => m.message)).toEqual(["ticket one"]);
  });

  it("returns the newest page and pages back with before", async () => {
    const { customer, ticketId } = await setupTicket();
    for (let i = 1; i <= 5; i += 1) {
      await postMessage(customer.token, ticketId, `message ${i}`);
    }

    const page1 = await listMessages(customer.token, ticketId, "?limit=2");
    expect(page1.body.data.messages.map((m) => m.message)).toEqual(["message 4", "message 5"]);
    expect(page1.body.hasMore).toBe(true);

    const page2 = await listMessages(
      customer.token,
      ticketId,
      `?limit=2&before=${page1.body.data.messages[0]._id}`
    );
    expect(page2.body.data.messages.map((m) => m.message)).toEqual(["message 2", "message 3"]);
    expect(page2.body.hasMore).toBe(true);

    const page3 = await listMessages(
      customer.token,
      ticketId,
      `?limit=2&before=${page2.body.data.messages[0]._id}`
    );
    expect(page3.body.data.messages.map((m) => m.message)).toEqual(["message 1"]);
    expect(page3.body.hasMore).toBe(false);
  });

  it("returns only newer messages with after, oldest first", async () => {
    const { customer, agent, ticketId } = await setupTicket();
    const first = await postMessage(customer.token, ticketId, "one");
    await postMessage(agent.token, ticketId, "two");
    await postMessage(customer.token, ticketId, "three");

    const res = await listMessages(
      customer.token,
      ticketId,
      `?after=${first.body.data.message._id}`
    );

    expect(res.body.data.messages.map((m) => m.message)).toEqual(["two", "three"]);
    expect(res.body.hasMore).toBe(false);
  });

  it("limits an after request and reports that more is available", async () => {
    const { customer, ticketId } = await setupTicket();
    const first = await postMessage(customer.token, ticketId, "one");
    await postMessage(customer.token, ticketId, "two");
    await postMessage(customer.token, ticketId, "three");

    const res = await listMessages(
      customer.token,
      ticketId,
      `?after=${first.body.data.message._id}&limit=1`
    );

    expect(res.body.data.messages.map((m) => m.message)).toEqual(["two"]);
    expect(res.body.hasMore).toBe(true);
  });

  it("rejects bad query values", async () => {
    const { customer, ticketId } = await setupTicket();
    const id = String(new mongoose.Types.ObjectId());

    const both = await listMessages(customer.token, ticketId, `?before=${id}&after=${id}`);
    const badLimit = await listMessages(customer.token, ticketId, "?limit=101");
    const badCursor = await listMessages(customer.token, ticketId, "?before=abc");

    expect(both.status).toBe(400);
    expect(badLimit.status).toBe(400);
    expect(badCursor.status).toBe(400);
  });

  it("includes system messages with no edit deadline", async () => {
    const { admin, customer, ticketId } = await setupTicket();
    await messageService.createSystemMessage(admin.user, ticketId, "Ticket assigned to Aisha");

    const res = await listMessages(customer.token, ticketId);

    const [system] = res.body.data.messages;
    expect(system.messageType).toBe("SYSTEM");
    expect(system.message).toBe("Ticket assigned to Aisha");
    expect(system.senderId.name).toBe("Ada Admin");
    expect(system.editableUntil).toBeNull();
  });
});

describe("PATCH /api/tickets/:id/messages/:messageId", () => {
  it("lets the sender edit their own message and marks it as edited", async () => {
    const { customer, ticketId } = await setupTicket();
    const created = await postMessage(customer.token, ticketId, "Typo hree");
    const messageId = created.body.data.message._id;

    const res = await patchMessage(customer.token, ticketId, messageId, "Typo here");

    expect(res.status).toBe(200);
    const { message } = res.body.data;
    expect(message.message).toBe("Typo here");
    expect(message.editedAt).not.toBeNull();
    expect(message.senderId.name).toBe("Carol Customer");

    const list = await listMessages(customer.token, ticketId);
    expect(list.body.data.messages[0].message).toBe("Typo here");
  });

  it("does not mark a message as edited when the text is unchanged", async () => {
    const { customer, ticketId } = await setupTicket();
    const created = await postMessage(customer.token, ticketId, "Same text");

    const res = await patchMessage(
      customer.token,
      ticketId,
      created.body.data.message._id,
      "Same text"
    );

    expect(res.status).toBe(200);
    expect(res.body.data.message.editedAt).toBeNull();
  });

  it("does not let anyone edit another user's message, admin included", async () => {
    const { customer, agent, admin, ticketId } = await setupTicket();
    const created = await postMessage(customer.token, ticketId, "Original");
    const messageId = created.body.data.message._id;

    const byAgent = await patchMessage(agent.token, ticketId, messageId, "Changed by agent");
    const byAdmin = await patchMessage(admin.token, ticketId, messageId, "Changed by admin");

    expect(byAgent.status).toBe(403);
    expect(byAdmin.status).toBe(403);
    const stored = await TicketMessage.findById(messageId);
    expect(stored.message).toBe("Original");
    expect(stored.editedAt).toBeNull();
  });

  it("lets an agent and an admin edit their own messages", async () => {
    const { agent, admin, ticketId } = await setupTicket();
    const fromAgent = await postMessage(agent.token, ticketId, "agent text");
    const fromAdmin = await postMessage(admin.token, ticketId, "admin text");

    const editedAgent = await patchMessage(
      agent.token,
      ticketId,
      fromAgent.body.data.message._id,
      "agent text v2"
    );
    const editedAdmin = await patchMessage(
      admin.token,
      ticketId,
      fromAdmin.body.data.message._id,
      "admin text v2"
    );

    expect(editedAgent.status).toBe(200);
    expect(editedAdmin.status).toBe(200);
  });

  it("returns 404 to users outside the ticket", async () => {
    const { customer, other, agent2, ticketId } = await setupTicket();
    const created = await postMessage(customer.token, ticketId, "Mine");
    const messageId = created.body.data.message._id;

    const byOther = await patchMessage(other.token, ticketId, messageId, "Hacked");
    const byAgent2 = await patchMessage(agent2.token, ticketId, messageId, "Hacked");

    expect(byOther.status).toBe(404);
    expect(byAgent2.status).toBe(404);
  });

  it("returns 404 when the message belongs to a different ticket", async () => {
    const { customer, ticketId } = await setupTicket();
    const second = await createTicketAs(customer.token, { subject: "Another problem" });
    const secondId = second.body.data.ticket._id;
    const created = await postMessage(customer.token, ticketId, "On ticket one");

    const res = await patchMessage(
      customer.token,
      secondId,
      created.body.data.message._id,
      "Moved"
    );

    expect(res.status).toBe(404);
  });

  it("returns 404 for an unknown message", async () => {
    const { customer, ticketId } = await setupTicket();

    const res = await patchMessage(
      customer.token,
      ticketId,
      String(new mongoose.Types.ObjectId()),
      "Hello"
    );

    expect(res.status).toBe(404);
  });

  it("stops editing after the time limit", async () => {
    const { customer, ticketId } = await setupTicket();
    const created = await postMessage(customer.token, ticketId, "Old message");
    const messageId = created.body.data.message._id;
    const tooOld = new Date(Date.now() - MESSAGE_EDIT_WINDOW_MS - 60 * 1000);
    await TicketMessage.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(messageId) },
      { $set: { createdAt: tooOld } }
    );

    const res = await patchMessage(customer.token, ticketId, messageId, "Too late");

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/15 minutes/);
    const stored = await TicketMessage.findById(messageId);
    expect(stored.message).toBe("Old message");
  });

  it("still allows editing just inside the time limit", async () => {
    const { customer, ticketId } = await setupTicket();
    const created = await postMessage(customer.token, ticketId, "Almost old");
    const messageId = created.body.data.message._id;
    const almost = new Date(Date.now() - MESSAGE_EDIT_WINDOW_MS + 60 * 1000);
    await TicketMessage.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(messageId) },
      { $set: { createdAt: almost } }
    );

    const res = await patchMessage(customer.token, ticketId, messageId, "Just in time");

    expect(res.status).toBe(200);
  });

  it("does not allow edits on a closed ticket", async () => {
    const { customer, ticketId } = await setupTicket();
    const created = await postMessage(customer.token, ticketId, "Before closing");
    await setStatusAs(customer.token, ticketId, "CLOSED");

    const res = await patchMessage(
      customer.token,
      ticketId,
      created.body.data.message._id,
      "After closing"
    );

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/closed/i);
  });

  it("does not allow editing system messages", async () => {
    const { admin, ticketId } = await setupTicket();
    const system = await messageService.createSystemMessage(admin.user, ticketId, "Assigned");

    const res = await patchMessage(admin.token, ticketId, system._id, "Rewritten history");

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/system/i);
  });

  it("validates the new text and the ids", async () => {
    const { customer, ticketId } = await setupTicket();
    const created = await postMessage(customer.token, ticketId, "Hello");
    const messageId = created.body.data.message._id;

    const empty = await patchMessage(customer.token, ticketId, messageId, "   ");
    const long = await patchMessage(customer.token, ticketId, messageId, "a".repeat(2001));
    const badId = await patchMessage(customer.token, ticketId, "nope", "Hello again");

    expect(empty.status).toBe(400);
    expect(long.status).toBe(400);
    expect(badId.status).toBe(400);
  });
});

describe("message rate limit", () => {
  // The limiter is switched off while NODE_ENV is "test"; these tests turn it on for their own requests.
  const withLimiterOn = async (run) => {
    process.env.NODE_ENV = "development";
    try {
      await run();
    } finally {
      process.env.NODE_ENV = "test";
    }
  };

  it("blocks a user who sends more than 20 messages in a minute, with a clear message", async () => {
    const { customer, ticketId } = await setupTicket();

    await withLimiterOn(async () => {
      for (let i = 1; i <= 20; i += 1) {
        const res = await postMessage(customer.token, ticketId, `message ${i}`);
        expect(res.status).toBe(201);
      }
      const blocked = await postMessage(customer.token, ticketId, "message 21");

      expect(blocked.status).toBe(429);
      expect(blocked.body).toEqual({
        success: false,
        message: "You are sending messages too fast. Please wait a moment and try again.",
      });
    });
    expect(await TicketMessage.countDocuments({ messageType: "TEXT" })).toBe(20);
  });

  it("counts each user separately and only limits writing, not reading", async () => {
    const { customer, agent, ticketId } = await setupTicket();

    await withLimiterOn(async () => {
      for (let i = 1; i <= 21; i += 1) {
        await postMessage(customer.token, ticketId, `spam ${i}`);
      }

      const agentMessage = await postMessage(agent.token, ticketId, "The agent is not affected");
      const reading = await listMessages(customer.token, ticketId);

      expect(agentMessage.status).toBe(201);
      expect(reading.status).toBe(200);
    });
  });

  it("also limits editing", async () => {
    const { customer, ticketId } = await setupTicket();
    const created = await postMessage(customer.token, ticketId, "to be edited");
    const messageId = created.body.data.message._id;

    await withLimiterOn(async () => {
      let last;
      for (let i = 1; i <= 21; i += 1) {
        last = await patchMessage(customer.token, ticketId, messageId, `edit ${i}`);
      }
      expect(last.status).toBe(429);
    });
  });
});
