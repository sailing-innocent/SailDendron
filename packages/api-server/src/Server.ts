import {
  AppNames,
  error2PlainObject,
  getStage,
  StatusCodes,
} from "@saili/common-all";
import {
  findInParent,
  SegmentClient,
  initializeSentry,
  NodeJSUtils,
} from "@saili/common-server";
import * as Sentry from "@sentry/node";
import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import asyncHandler from "express-async-handler";
import fs from "fs-extra";
import morgan from "morgan";
import path from "path";
import querystring from "querystring";
import { getLogger } from "./core";
import { GoogleAuthController } from "./modules/oauth";
import { baseRouter } from "./routes";
import {
  oauthRouter,
  OauthService,
  registerOauthHandler,
} from "./routes/oauth";

function getSentryRelease() {
  return `${AppNames.EXPRESS_SERVER}@${NodeJSUtils.getVersionFromPkg()}`;
}

import { Application } from "express";

export function appModule({
  logPath,
  nextServerUrl,
  nextStaticRoot,
  googleOauthClientId,
  googleOauthClientSecret,
}: {
  logPath: string;
  nextServerUrl?: string;
  nextStaticRoot?: string;
  googleOauthClientId?: string;
  googleOauthClientSecret: string;
}): Application {
  const ctx = "appModule:start";
  const logger = getLogger();
  const app = express();
  const corsOptions = {
    origin: '*', 
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true, // If you need to send cookies or auth headers
  };
  app.use(cors(corsOptions));
  app.use(express.json({ limit: "500mb" }));
  app.use(express.urlencoded({ extended: true }));
  if (logPath !== "stdout") {
    const accessLogStream = fs.createWriteStream(logPath, { flags: "a" });
    app.use(
      morgan(
        ":method :url :status :response-time ms - :res[content-length] - :req[content-length]",
        {
          stream: accessLogStream,
        }
      )
    );
  }

  logger.info(googleOauthClientId);
  logger.info({ ctx, dirPath: __dirname });
  const staticDir = path.join(__dirname, "static");
  app.use(express.static(staticDir));

  // this is the first time we are accessing the segment client instance (when this is run as a separate process).
  // unlock Segment client.
  SegmentClient.unlock();

  if (!SegmentClient.instance().hasOptedOut && getStage() === "prod") {
    initializeSentry({ environment: getStage(), release: getSentryRelease() });
  }

  // Re-use the id for error reporting too:
  Sentry.setUser({ id: SegmentClient.instance().anonymousId });

  app.use(Sentry.Handlers.requestHandler() as express.RequestHandler);

  if (nextStaticRoot) {
    logger.info({ ctx, msg: "nextStaticRoot:add", nextStaticRoot });
    app.use(express.static(nextStaticRoot));
  }

  if (nextServerUrl) {
    logger.info({ ctx, msg: "adding nextServerUrl", nextServerUrl });
    app.use("/vscode", (req, res) => {
      const redirectUrl =
        nextServerUrl +
        "/vscode" +
        req.path.replace(/.html/, "") +
        "?" +
        querystring.stringify(req.query as any);
      logger.info({ ctx, msg: "redirecting", redirectUrl });
      return res.redirect(redirectUrl);
    });
  }

  app.get("/health", async (_req: Request, res: Response) => {
    return res.json({ ok: 1 });
  });

  app.get(
    "/version",
    // @ts-ignore
    asyncHandler(async (_req: Request, res: Response) => {
      const pkg = findInParent(__dirname, "package.json");
      if (!pkg) {
        throw Error("no pkg found");
      }
      const version = fs.readJSONSync(path.join(pkg, "package.json")).version;
      return res.json({ version });
    })
  );

  registerOauthHandler(
    OauthService.GOOGLE,
    new GoogleAuthController(googleOauthClientId!, googleOauthClientSecret)
  );
  baseRouter.use("/oauth", oauthRouter);

  app.use("/api", baseRouter);

  // The error handler must be before any other error middleware and after all controllers
  // app.use(Sentry.Handlers.errorHandler() as express.ErrorRequestHandler);
  app.use(
    Sentry.Handlers.errorHandler({
      shouldHandleError() {
        // Upload all exceptions
        return true;
      },
    }) as express.ErrorRequestHandler
  );

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    const flattenedError = error2PlainObject(err);
    logger.error({
      ctx: "appModule:ErrorHandler",
      error: flattenedError,
      nextStaticRoot,
    });
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json(flattenedError);
  });

  return app;
}
