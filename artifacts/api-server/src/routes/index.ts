import { Router, type IRouter } from "express";
import healthRouter from "./health";
import aiRouter from "./ai";
import dataRouter from "./data";
import chatRouter from "./chat";

const router: IRouter = Router();

router.use(healthRouter);
router.use(aiRouter);
router.use("/data", dataRouter);
router.use("/chat", chatRouter);

export default router;
