import { Router, type IRouter } from "express";
import { getOnlineCount, getBufferedMessageCount } from "../chat/chat-ws";

const router: IRouter = Router();

router.get("/health", (_req, res) => {
  res.json({
    ok: true,
    online: getOnlineCount(),
    buffered: getBufferedMessageCount(),
  });
});

export default router;
