import { Router } from "express";
import { getAllUsers, deleteUser } from "../controllers/admin.controller";
import {
  getModelSettings,
  setModelSettings,
} from "../controllers/settings.controller";
import { protect, adminOnly } from "../middleware/auth";

const router = Router();

// All admin routes require authentication AND admin role
router.use(protect, adminOnly);

// GET /api/admin/users
router.get("/users", getAllUsers);

// DELETE /api/admin/users/:id
router.delete("/users/:id", deleteUser);

// GET /api/admin/settings/model
router.get("/settings/model", getModelSettings);

// POST /api/admin/settings/model
router.post("/settings/model", setModelSettings);

export default router;
