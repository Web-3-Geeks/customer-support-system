const User = require("../models/User");
const AppError = require("../utils/AppError");

const getAllUsers = async () => {
  return User.find().sort({ createdAt: -1 });
};

const updateUserRole = async (targetUserId, newRole, currentUserId) => {
  if (targetUserId === String(currentUserId)) {
    throw new AppError("You cannot change your own role", 400);
  }

  const user = await User.findByIdAndUpdate(
    targetUserId,
    { role: newRole },
    { new: true, runValidators: true }
  );

  if (!user) {
    throw new AppError("User not found", 404);
  }

  return user;
};

module.exports = { getAllUsers, updateUserRole };
