const messageService = require("../services/message.service");

const createMessage = async (req, res) => {
  const message = await messageService.createMessage(req.user, req.params.id, req.body.message);
  res.status(201).json({ success: true, data: { message } });
};

const listMessages = async (req, res) => {
  const { messages, hasMore } = await messageService.listMessages(
    req.user,
    req.params.id,
    req.validated.query
  );
  res.status(200).json({
    success: true,
    results: messages.length,
    hasMore,
    data: { messages },
  });
};

const editMessage = async (req, res) => {
  const message = await messageService.editMessage(
    req.user,
    req.params.id,
    req.params.messageId,
    req.body.message
  );
  res.status(200).json({ success: true, data: { message } });
};

module.exports = { createMessage, listMessages, editMessage };