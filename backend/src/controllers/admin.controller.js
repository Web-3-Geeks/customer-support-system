const adminService = require("../services/admin.service");
const ticketService = require("../services/ticket.service");

const listUsers = async (req, res) => {
  const users = await adminService.getAllUsers({ role: req.validated.query.role });
  res.status(200).json({ success: true, results: users.length, data: { users } });
};

const changeUserRole = async (req, res) => {
  const user = await adminService.updateUserRole(req.params.id, req.body.role, req.user._id);
  res.status(200).json({ success: true, data: { user } });
};

const listAllTickets = async (req, res) => {
  const { tickets, pagination } = await ticketService.listTickets(req.user, req.validated.query);
  res.status(200).json({
    success: true,
    results: tickets.length,
    pagination,
    data: { tickets },
  });
};

const assignTicket = async (req, res) => {
  const ticket = await ticketService.assignTicket(req.user, req.params.id, req.body.assignedTo);
  res.status(200).json({ success: true, data: { ticket } });
};

module.exports = { listUsers, changeUserRole, listAllTickets, assignTicket };
