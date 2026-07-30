import { Router } from "express";
import healthRouter from "./health";
import searchRouter from "./search";
import chatRouter from "./chat";
import booksRouter from "./books";
import catalogRouter from "./catalog";
import invitationsRouter from "./invitations";
import uploadRouter from "./upload";
import adminLogsRouter from "./admin-logs";

const router = Router();

router.use(healthRouter);
router.use(searchRouter);
router.use(chatRouter);
router.use(booksRouter);
router.use(catalogRouter);
router.use(invitationsRouter);
router.use(uploadRouter);
router.use(adminLogsRouter);

export default router;
