import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import applicationsRouter from "./applications";
import cohortsRouter from "./cohorts";
import rolesRouter from "./roles";
import roomsRouter from "./rooms";
import instructionsRouter from "./instructions";
import adminRouter from "./admin";
import storageRouter from "./storage";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/applications", applicationsRouter);
router.use("/cohorts", cohortsRouter);
router.use("/my-role", rolesRouter);
router.use("/rooms", roomsRouter);
router.use("/instructions", instructionsRouter);
router.use("/admin", adminRouter);
router.use(storageRouter);

export default router;
