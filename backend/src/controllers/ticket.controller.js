const ticketService = require("../services/ticket.service");

const createTicket = async (req, res) => {
  const ticket = await ticketService.createTicket(req.user, req.body);
  res.status(201).json({ success: true, data: { ticket } });
};

const listTickets = async (req, res) => {
  const { tickets, pagination } = await ticketService.listTickets(req.user, req.validated.query);
  res.status(200).json({
    success: true,
    results: tickets.length,
    pagination,
    data: { tickets },
  });
};

const getTicket = async (req, res) => {
  const ticket = await ticketService.getTicket(req.user, req.params.id);
  res.status(200).json({ success: true, data: { ticket } });
};

const updateTicket = async (req, res) => {
  const ticket = await ticketService.updateTicket(req.user, req.params.id, req.body);
  res.status(200).json({ success: true, data: { ticket } });
};

const changeStatus = async (req, res) => {
  const ticket = await ticketService.changeStatus(req.user, req.params.id, req.body.status);
  res.status(200).json({ success: true, data: { ticket } });
};

module.exports = { createTicket, listTickets, getTicket, updateTicket, changeStatus };
