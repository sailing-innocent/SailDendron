import React from "react";
import { DendronComponent } from "../types";
import {
  DMessageEnum,
  DMessageSource,
  GraphThemeEnum,
  GraphViewMessageEnum,
  LookupViewMessageEnum,
  NoteViewMessageEnum,
  NoteUtils,
  OnDidChangeActiveTextEditorMsg,
  SeedBrowserMessageType,
  OnUpdatePreviewHTMLMsg,
} from "@saili/common-all";
import {
  combinedStore,
  createLogger,
  engineHooks,
  engineSlice,
  ideHooks,
  ideSlice,
  LOG_LEVEL,
  Provider,
  setLogLevel,
} from "@saili/common-frontend";
import { useWorkspaceProps } from "../hooks";

const { useEngineAppSelector } = engineHooks;
import { postVSCodeMessage, useVSCodeMessage } from "../utils/vscode";

function DendronVSCodeApp({ Component }: { Component: DendronComponent }) {
  const ctx = "DendronVSCodeApp";
  // const ideDispatch = ideHooks.useIDEAppDispatch();
  // const [workspace] = useWorkspaceProps();
  // const logger = createLogger("DendronApp");
  // logger.info({ ctx, msg: "enter", workspace });
  const props = {
  };

  // TODO: register a listener for vscode messages

  return <Component {...props} />;
}

export type DendronAppProps = {
  opts: { padding: "inherit" | number | string };
  Component: DendronComponent;
};

function DendronApp(props: DendronAppProps) {
  return (
    <DendronVSCodeApp {...props} />
  );
}

export default DendronApp;
