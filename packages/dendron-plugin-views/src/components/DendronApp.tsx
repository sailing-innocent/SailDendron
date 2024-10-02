import React from "react";
import { DendronComponent } from "../types";
function DendronVSCodeApp({ Component }: { Component: DendronComponent }) {
  const props = {
    name: "dummy"
  };
  return <Component {...props} />;
}

export type DendronAppProps = {
  opts: { padding: "inherit" | number | string };
  Component: DendronComponent;
};

function DendronApp(props: DendronAppProps) {
  return (
    <div style={{ padding: props.opts.padding }}>
      <DendronVSCodeApp Component={props.Component} />
    </div>
  );
}

export default DendronApp;
