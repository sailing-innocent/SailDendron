import _ from "lodash";
import type {
  NotePropsByIdDict,
  DuplicateNoteBehavior,
  DNodePointer,
} from "./types";
import type { Option } from "./utils";
import { PublishUtils, err, fromThrowable, Result } from "./utils";
import { z, parse } from "./parse";
import type { IDendronError } from "./error";
import { DendronError, assertUnreachable } from "./error";
import { ERROR_STATUS } from "./constants";

export type SidebarResult<T> = Result<T, IDendronError>;

const noteLiteral = z.literal("note");
const autogeneratedLiteral = z.literal("autogenerated");
const categoryLiteral = z.literal("category");

const idSchema = z.string();

const sidebarItemNote = z.object({
  type: noteLiteral,
  id: idSchema,
  label: z.string(),
});

const sidebarItemAutogenerated = z.object({
  type: autogeneratedLiteral,
  id: idSchema,
});

const sidebarItemCategoryLinkNote = z.object({
  type: noteLiteral,
  id: idSchema,
});

const sidebarItemCategoryLink = sidebarItemCategoryLinkNote;

type SidebarItemCategoryConfig = {
  type: "category";
  label: string;
  items: SidebarItemConfig[];
  link: SidebarItemCategoryLink;
};
const sidebarItemCategoryConfig: z.ZodType<SidebarItemCategoryConfig> = z.lazy(
  () =>
    z
      .object({
        type: categoryLiteral,
        label: z.string(),
        items: z.array(z.lazy(() => sidebarItemConfig)),
        link: sidebarItemCategoryLink,
      })
      .refine(
        (item) => {
          return !(item.items.length === 0 && !item.link);
        },
        (item) => {
          return {
            message: `Sidebar category '${item.label}' has neither any subitem nor a link. This makes this item not able to link to anything.`,
          };
        }
      )
);

const sidebarItemCategory: z.ZodType<SidebarItemCategory> = z.lazy(() =>
  z.object({
    type: categoryLiteral,
    label: z.string(),
    items: z.array(z.lazy(() => sidebarItem)),
    link: sidebarItemCategoryLink,
  })
);

// `discriminatedUnion` currently does not work with recursive types.
// see: https://github.com/colinhacks/zod/issues/1384
// using `union` instead for now with the side-effect of a less clear error message
const sidebarItemConfig = z.union([
  sidebarItemCategoryConfig,
  sidebarItemNote,
  sidebarItemAutogenerated,
]);
const sidebarConfig = z.array(sidebarItemConfig);

const sidebarItem = z.union([sidebarItemCategory, sidebarItemNote]);

type SidebarItemConfig = z.infer<typeof sidebarItemConfig>;
type SidebarConfig = z.infer<typeof sidebarConfig>;

type SidebarItemNote = z.infer<typeof sidebarItemNote>;
type SidebarItemAutogenerated = z.infer<typeof sidebarItemAutogenerated>;
type SidebarItemCategoryLink = z.infer<typeof sidebarItemCategoryLink>;
type SidebarItemCategory = {
  type: "category";
  label: string;
  items: SidebarItem[];
  link: SidebarItemCategoryLink;
};
export type SidebarItem = z.infer<typeof sidebarItem>;
export type Sidebar = Array<SidebarItem>;

type SidebarItemsGeneratorParams = {
  item: SidebarItemAutogenerated;
  notes: NotePropsByIdDict;
};
type SidebarItemsGenerator = (
  params: SidebarItemsGeneratorParams
) => SidebarItem[];

type SidebarOptions = {
  duplicateNoteBehavior?: DuplicateNoteBehavior;
  notes: NotePropsByIdDict;
};

type WithPosition<T> = T & {
  position?: number;
  fname?: string;
  reverse?: boolean;
};

const ROOT_KEYWORD = "root";

export const DefaultSidebar: SidebarConfig = [
  {
    type: "autogenerated",
    id: ROOT_KEYWORD,
  },
];

export const DisabledSidebar: SidebarConfig = [];

const defaultSidebarItemsGenerator: SidebarItemsGenerator = ({
  item,
  notes: notesById,
}) => {
  function findHierarchySources() {
    const isTopLevel = item.id === ROOT_KEYWORD;

    // 1. if item-pointer to root find all root notes
    if (isTopLevel) {
      return Object.values(notesById)
        .filter((note) => {
          const { fname } = note;
          if (fname === "root") {
            return false;
          }
          const hierarchyPath = fname.split(".");
          if (hierarchyPath.length === 1) {
            return true;
          }
          return false;
        })
        .map(({ id }) => id);
    }

    const note = notesById[item.id];

    if (!note) {
      throw DendronError.createFromStatus({
        message: `SidebarItem \`${item.id}\` does not exist`,
        status: ERROR_STATUS.DOES_NOT_EXIST,
      });
    }

    return note.children;
  }

  function generateSidebar(
    noteIds: DNodePointer[]
  ): WithPosition<SidebarItem>[] {
    return noteIds
      .map((noteId) => {
        const note = notesById[noteId];
        const fm = PublishUtils.getPublishFM(note);
        const { children } = note;
        const hasChildren = children.length > 0;
        const isCategory = hasChildren;
        const isNote = !hasChildren;

        if (!note || fm.nav_exclude) {
          return undefined;
        }

        const positionalProps = {
          position: fm.nav_order,
          fname: note.fname,
          reverse: fm.sort_order === "reverse",
        };

        if (isNote) {
          return {
            type: "note",
            id: note.id,
            label: note.title,
            ...positionalProps,
          } as SidebarItemNote;
        }

        if (isCategory) {
          const shouldIgnoreChildren =
            fm.nav_exclude_children || fm.has_collection;
          return {
            type: "category",
            label: note.title,
            items: shouldIgnoreChildren ? [] : generateSidebar(children),
            link: { type: "note", id: note.id },
            ...positionalProps,
          } as SidebarItemCategory;
        }

        return undefined;
      })
      .filter((maybeSidebarItem): maybeSidebarItem is SidebarItem =>
        Boolean(maybeSidebarItem)
      );
  }

  function sortItems(sidebarItems: WithPosition<SidebarItem>[]): Sidebar {
    const processedSidebarItems = sidebarItems.map((item) => {
      if (item.type === "category") {
        const sortedItems = sortItems(item.items);
        if (item.reverse) {
          sortedItems.reverse();
        }
        return { ...item, items: sortedItems };
      }
      return item;
    });
    const sortedSidebarItems = _.sortBy(processedSidebarItems, [
      "position",
      "fname",
    ]);
    return sortedSidebarItems.map(
      ({ position, fname, reverse, ...item }) => item
    );
  }

  const hierarchySource = findHierarchySources();

  return _.flow(generateSidebar, sortItems)(hierarchySource);
};

export function processSidebar(
  sidebarResult: SidebarResult<SidebarConfig>,
  { notes, duplicateNoteBehavior }: SidebarOptions
): SidebarResult<Sidebar> {
  function processAutoGeneratedItem(item: SidebarItemAutogenerated) {
    return (
      // optional future feature to control sidebarItems generation
      defaultSidebarItemsGenerator({ item, notes })
    );
  }

  function resolveItem(item: SidebarItemConfig): SidebarItemConfig {
    function resolveItemId(sidebarId: string) {
      const realizableNotes = [
        // 1. check if associated using note id.
        notes[sidebarId] ??
          // 2. find note based on `fname`
          Object.values(notes).filter((note) => {
            return note.fname === sidebarId;
          }),
      ].flat();

      const getPrioritizedRealizableNotes = () => {
        const map = new Map(
          realizableNotes.map((note) => [
            note.vault.name ?? note.vault.fsPath,
            note,
          ])
        );
        return getPriorityVaults(duplicateNoteBehavior)
          ?.filter((vaultName) => map.has(vaultName))
          .map((vaultName) => map.get(vaultName));
      };

      const hasDuplicates = realizableNotes.length > 1;
      const note = _.first(
        (hasDuplicates && getPrioritizedRealizableNotes()) || realizableNotes
      );

      if (!note) {
        throw DendronError.createFromStatus({
          message: `SidebarItem \`${sidebarId}\` does not exist`,
          status: ERROR_STATUS.DOES_NOT_EXIST,
        });
      }
      return note.id;
    }

    const { type } = item;
    switch (type) {
      case "category": {
        const { link } = item;
        return {
          ...item,
          link: { type: "note", id: resolveItemId(link.id) },
        };
      }
      case "autogenerated": {
        return {
          ...item,
          id: item.id === ROOT_KEYWORD ? item.id : resolveItemId(item.id),
        };
      }
      case "note": {
        return {
          ...item,
          id: resolveItemId(item.id),
        };
      }
      default:
        assertUnreachable(type);
    }
  }

  function processItem(_item: SidebarItemConfig): SidebarItem[] {
    const item = resolveItem(_item);
    const { type } = item;
    switch (type) {
      case "category": {
        return [
          {
            ...item,
            items: item.items.map(processItem).flat(),
          },
        ];
      }
      case "autogenerated":
        return processAutoGeneratedItem(item);
      case "note": {
        return [item];
      }
      default:
        assertUnreachable(type);
    }
  }

  const safeProcessItem = fromThrowable(processItem, (error: unknown) =>
    DendronError.isDendronError(error)
      ? error
      : DendronError.createFromStatus({
          message: "Error when processing sidebarItem",
          status: ERROR_STATUS.INVALID_CONFIG,
        })
  );

  return sidebarResult
    .andThen((sidebar) => Result.combine(sidebar.map(safeProcessItem)))
    .map((x) => (x as SidebarItem[]).flat());
}

export function parseSidebarConfig(
  input: unknown
): Result<SidebarConfig, IDendronError> {
  if (Array.isArray(input)) {
    const resultList = input.map((maybeSidebarItem) => {
      const { type } = maybeSidebarItem;
      switch (type) {
        case "note":
          return parse(
            sidebarItemNote,
            maybeSidebarItem,
            `SidebarParseError in ${JSON.stringify(maybeSidebarItem)}`
          );
        case "autogenerated":
          return parse(
            sidebarItemAutogenerated,
            maybeSidebarItem,
            `SidebarParseError in ${JSON.stringify(maybeSidebarItem)}`
          );
        case "category":
          return parse(
            sidebarItemConfig,
            maybeSidebarItem,
            `SidebarParseError in ${JSON.stringify(maybeSidebarItem)}`
          );
        default:
          return err(
            new DendronError({
              message: `Invalid sidebar item type in \`${JSON.stringify(
                maybeSidebarItem
              )}\`. Valid are \`${noteLiteral.value}\`, \`${
                categoryLiteral.value
              }\` or \`${autogeneratedLiteral.value}\`.`,
            })
          );
      }
    });
    return Result.combine(resultList) as Result<
      (SidebarItemCategoryConfig | SidebarItemNote | SidebarItemAutogenerated)[],
      IDendronError
    >;
  }

  return err(new DendronError({ message: "Sidebar object is not an array" }));
}

/**

The sidebar gets generated through the following steps:

1. **Parsing**. using [zod](https://github.com/colinhacks/zod) we parse the content of the sidebar config file. Returns `SidbarConfig`.
  - this is inspired by [Parse, don’t validate](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/)
  - If we support shorthand (for now we skip it) parsing would also have a transformation step from shorthand to longhand.
  - here we should also check if the hierarchies that the sidebar config points to are actually going to be published. If not an `Result` type should be returned.
2. **Generate**. Generate domains
  - consists of:
    - processing
      - resolving sidebar item `id` attribute
      - resolve autogenerates
*/
export function getSidebar(
  input: unknown,
  options: SidebarOptions
): SidebarResult<Sidebar> {
  return processSidebar(parseSidebarConfig(input), options);
}

/**
 * Returns list of vault names sorted by `duplicateNoteBehavior`
 */
function getPriorityVaults(
  duplicateNoteBehavior?: DuplicateNoteBehavior
): Option<string[]> {
  if (Array.isArray(duplicateNoteBehavior?.payload)) {
    return [...new Set(duplicateNoteBehavior?.payload)];
  }
  const vaultName = duplicateNoteBehavior?.payload.vault?.name;
  if (vaultName) {
    return [vaultName];
  }
  return undefined;
}
