import React, { useCallback, useState } from "react";
import {
  DMessageSource,
  FOOTNOTE_DEF_CLASS,
  FOOTNOTE_REF_CLASS,
  NoteViewMessageEnum,
} from "@saili/common-all";
import { createLogger, DendronNote } from "@saili/common-frontend";
import { useCurrentTheme, useMermaid, useRenderedNoteBody } from "../hooks";
import { DendronProps, DendronComponent } from "../types";

const DendronNotePreview: DendronComponent = (props: DendronProps)=>{
  const ctx = "DendronNotePreview";
  const logger = createLogger("DendronNotePreview");
  const noteProps = props.ide.noteActive;
  const [noteRenderedBody] = useRenderedNoteBody({
    ...props,
    noteProps,
    previewHTML: props.ide.previewHTML,
  });
  if (!noteRenderedBody) {
    return <div>Loading...</div>;
  }
  return <>
    <DendronNote noteContent={noteRenderedBody} />
  </>
}

export default DendronNotePreview;