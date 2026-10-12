const express = require("express");
const { listUsers, changeUserRole } = require("../controllers/admin.controller");
const { protect, authorize } = require("../middleware/auth");
const validate = require("../middleware/validate");
const { updateRoleSchema } = require("../validators/admin.validator");
const { ROLES } = require("../utils/constants");

const router = express.Router();

router.use(protect, authorize(ROLES.ADMIN));

router.get("/users", listUsers);
router.patch("/users/:id/role", validate(updateRoleSchema), changeUserRole);

module.exports = router;
