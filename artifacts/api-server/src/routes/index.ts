import { Router } from "express";
import healthRouter from "./health";
import searchRouter from "./search";
import booksRouter from "./books";
import catalogRouter from "./catalog";
import invitationsRouter from "./invitations";
import uploadRouter from "./upload";

const router = Router();

router.use(healthRouter);
router.use(searchRouter);
router.use(booksRouter);
router.use(catalogRouter);
router.use(invitationsRouter);
router.use(uploadRouter);

export default router;
