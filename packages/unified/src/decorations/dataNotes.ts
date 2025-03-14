import {
  ConfigUtils,
  DendronConfig,
  ReducedDEngine,
  TaskNoteUtils,
  VaultUtils,
  VSRange,
} from "@dendronhq/common-all";
import _ from "lodash";
import { Decoration, DECORATION_TYPES } from "./utils";

export type DecorationDataNote = Decoration & {
  type: DECORATION_TYPES.dataNote;
  beforeText?: string;
  afterText?: string;
};

/** Decorates the note `fname` in vault `vaultName` if the note is a data note. */
export async function decorateDataNote({
  engine,
  range,
  fname,
  vaultName,
  config,
}: {
  engine: ReducedDEngine;
  range: VSRange;
  fname: string;
  vaultName?: string;
  config: DendronConfig;
}) {
  const decoration: DecorationDataNote = {
    type: DECORATION_TYPES.dataNote,
    range,
    data: {},
  };
  return decoration;
}