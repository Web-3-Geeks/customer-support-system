const adminService = require("../services/admin.service");

const listUsers = async (req, res) => {
  const users = await adminService.getAllUsers();
  res.status(200).json({ success: true, results: users.length, data: { users } });
};

const changeUserRole = async (req, res) => {
  const user = await adminService.updateUserRole(req.params.id, req.body.role, req.user._id);
  res.status(200).json({ success: true, data: { user } });
};

module.exports = { listUsers, changeUserRole };
