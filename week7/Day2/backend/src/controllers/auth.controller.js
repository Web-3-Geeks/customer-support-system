const authService = require("../services/auth.service");

const register = async (req, res) => {
  const { user, token } = await authService.registerUser(req.body);
  res.status(201).json({ success: true, data: { user, token } });
};

const login = async (req, res) => {
  const { user, token } = await authService.loginUser(req.body);
  res.status(200).json({ success: true, data: { user, token } });
};

const logout = (req, res) => {
  res.status(200).json({ success: true, message: "Logged out successfully" });
};

const getMe = (req, res) => {
  res.status(200).json({ success: true, data: { user: req.user } });
};

module.exports = { register, login, logout, getMe };