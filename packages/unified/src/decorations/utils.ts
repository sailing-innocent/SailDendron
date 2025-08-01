import type {
  IDendronError,
  NonOptional,
  NoteProps,
  Decoration,
  DendronConfig,
  ReducedDEngine,
} from "@saili/common-all";
import { Node } from "hast";
import { DendronASTNode } from "../types";

export { DECORATION_TYPES } from "@saili/common-all";
export type { Decoration };

export type DecoratorOut<D extends Decoration = Decoration> = {
  decorations: D[];
  errors?: IDendronError[];
};

export type DecoratorIn<N extends Omit<DendronASTNode, "children"> = DendronASTNode> = {
  node: NonOptional<N, "position">;
  note: NoteProps;
  noteText: string;
  engine: ReducedDEngine;
  config: DendronConfig;
};

export type Decorator<
  N extends Omit<DendronASTNode, "children">,
  D extends Decoration = Decoration
> = (opts: DecoratorIn<N>) => DecoratorOut<D> | Promise<DecoratorOut<D>>;
