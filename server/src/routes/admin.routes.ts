import { Router } from "express";
import {
  getAllUsers,
  deleteUser,
  getManagers,
  createManagerHandler,
  deleteManagerHandler,
} from "../controllers/admin.controller";
import {
  getModelSettings,
  setModelSettings,
} from "../controllers/settings.controller";
import { protect, adminOnly } from "../middleware/auth";
import { validateId } from "../middleware/validateId";

const router = Router();
router.param("id", validateId);

// All admin routes require authentication AND admin role
router.use(protect, adminOnly);

// Managers
// GET /api/admin/managers
router.get("/managers", getManagers);

// POST /api/admin/managers
router.post("/managers", createManagerHandler);

// DELETE /api/admin/managers/:id
router.delete("/managers/:id", deleteManagerHandler);

// Users
// GET /api/admin/users
router.get("/users", getAllUsers);

// DELETE /api/admin/users/:id
router.delete("/users/:id", deleteUser);

// Settings
// GET /api/admin/settings/model
router.get("/settings/model", getModelSettings);

// POST /api/admin/settings/model
router.post("/settings/model", setModelSettings);

export default router;
