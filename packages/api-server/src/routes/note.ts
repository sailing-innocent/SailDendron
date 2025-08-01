import {
  EngineBulkAddRequest,
  EngineDeleteRequest,
  EngineRenameNoteRequest,
  EngineWriteRequest,
  GetDecorationsRequest,
  GetNoteBlocksResp,
  GetNoteBlocksRequest,
  NoteQueryRequest,
  RenderNoteOpts,
  WriteNoteResp,
  BulkWriteNotesResp,
  FindNotesResp,
  RespV3,
  FindNoteOpts,
  APIRequest,
  FindNotesMetaResp,
  GetNoteResp,
  EngineGetNoteRequest,
  GetNoteMetaResp,
  BulkGetNoteResp,
  EngineBulkGetNoteRequest,
  BulkGetNoteMetaResp,
} from "@saili/common-all";
import { ExpressUtils } from "@saili/common-server";
import { Request, Response, Router } from "express";
import asyncHandler from "express-async-handler";
import { NoteController } from "../modules/notes";
import { getWSEngine } from "../utils";

const router: Router = Router();

router.get(
  "/get",
  asyncHandler(async (req: Request, res: Response<GetNoteResp>) => {
    const { id, ws } = req.query as unknown as EngineGetNoteRequest;
    const engine = await getWSEngine({ ws: ws || "" });
    ExpressUtils.setResponse(res, await engine.getNote(id));
  })
);

router.get(
  "/getMeta",
  asyncHandler(async (req: Request, res: Response<GetNoteMetaResp>) => {
    const { id, ws } = req.query as unknown as EngineGetNoteRequest;
    const engine = await getWSEngine({ ws: ws || "" });
    ExpressUtils.setResponse(res, await engine.getNoteMeta(id));
  })
);

router.get(
  "/bulkGet",
  asyncHandler(async (req: Request, res: Response<BulkGetNoteResp>) => {
    const { ids, ws } = req.query as unknown as EngineBulkGetNoteRequest;
    const engine = await getWSEngine({ ws: ws || "" });
    ExpressUtils.setResponse(res, await engine.bulkGetNotes(ids));
  })
);

router.get(
  "/bulkGetMeta",
  asyncHandler(async (req: Request, res: Response<BulkGetNoteMetaResp>) => {
    const { ids, ws } = req.query as unknown as EngineBulkGetNoteRequest;
    const engine = await getWSEngine({ ws: ws || "" });
    ExpressUtils.setResponse(res, await engine.bulkGetNotesMeta(ids));
  })
);

router.post(
  "/delete",
  asyncHandler(async (req: Request, res: Response) => {
    const { ws, id, opts } = req.body as EngineDeleteRequest;
    const engine = await getWSEngine({ ws: ws || "" });
    ExpressUtils.setResponse(res, await engine.deleteNote(id, opts));
  })
);

router.get(
  "/info",
  asyncHandler(async (_req: Request, res: Response) => {
    const resp = await NoteController.instance().info();
    res.json(resp);
  })
);

router.post(
  "/rename",
  asyncHandler(async (req: Request, res: Response) => {
    const resp = await NoteController.instance().rename(
      req.body as EngineRenameNoteRequest
    );
    ExpressUtils.setResponse(res, resp);
  })
);

router.post(
  "/render",
  asyncHandler(async (req: Request, res: Response) => {
    const resp = await NoteController.instance().render(
      req.body as RenderNoteOpts & { ws: string }
    );
    ExpressUtils.setResponse(res, resp);
  })
);

router.get(
  "/query",
  asyncHandler(async (req: Request, res: Response) => {
    const resp = await NoteController.instance().query(
      req.query as unknown as NoteQueryRequest
    );
    ExpressUtils.setResponse(res, { data: resp });
  })
);

router.post(
  "/find",
  asyncHandler(async (req: Request, res: Response<RespV3<FindNotesResp>>) => {
    const { ws, ...opts } = req.body as APIRequest<FindNoteOpts>;
    const engine = await getWSEngine({ ws: ws || "" });
    const out = await engine.findNotes(opts);
    ExpressUtils.setResponse(res, { data: out });
  })
);

router.post(
  "/findMeta",
  asyncHandler(
    async (req: Request, res: Response<RespV3<FindNotesMetaResp>>) => {
      const { ws, ...opts } = req.body as APIRequest<FindNoteOpts>;
      const engine = await getWSEngine({ ws: ws || "" });
      const out = await engine.findNotesMeta(opts);
      ExpressUtils.setResponse(res, { data: out });
    }
  )
);

router.post(
  "/write",
  asyncHandler(async (req: Request, res: Response<WriteNoteResp>) => {
    const { ws, node, opts } = req.body as EngineWriteRequest;
    const engine = await getWSEngine({ ws: ws || "" });
    const out = await engine.writeNote(node, opts);
    ExpressUtils.setResponse(res, out);
  })
);

router.post(
  "/bulkAdd",
  asyncHandler(async (req: Request, res: Response<BulkWriteNotesResp>) => {
    const { ws, opts } = req.body as EngineBulkAddRequest;
    const engine = await getWSEngine({ ws: ws || "" });
    const out = await engine.bulkWriteNotes(opts);
    ExpressUtils.setResponse(res, out);
  })
);

router.get(
  "/blocks",
  asyncHandler(async (req: Request, res: Response<GetNoteBlocksResp>) => {
    const { id, ws, filterByAnchorType } = req.query as GetNoteBlocksRequest;
    const engine = await getWSEngine({ ws: ws || "" });
    ExpressUtils.setResponse(
      res,
      await engine.getNoteBlocks({ id, filterByAnchorType })
    );
  })
);

router.post(
  "/decorations",
  asyncHandler(async (req: Request, res: Response<GetNoteBlocksResp>) => {
    const opts = req.body as any as GetDecorationsRequest;
    const { ws } = opts;
    const engine = await getWSEngine({ ws: ws || "" });
    ExpressUtils.setResponse(res, await engine.getDecorations(opts));
  })
);

export { router as noteRouter };
