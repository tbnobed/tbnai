import { Router } from "express";
import healthRouter from "./health";
import searchRouter from "./search";
import booksRouter from "./books";
import catalogRouter from "./catalog";

const router = Router();

router.use(healthRouter);
router.use(searchRouter);
router.use(booksRouter);
router.use(catalogRouter);

export default router;
