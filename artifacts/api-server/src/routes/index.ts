import { Router, type IRouter } from "express";
import healthRouter from "./health";
import kaspaRouter from "./kaspa";

const router: IRouter = Router();

router.use(healthRouter);
router.use('/kaspa', kaspaRouter);

export default router;
