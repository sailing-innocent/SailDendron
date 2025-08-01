import {
  DendronError,
  DNodePointer,
  DNodeUtils,
  DStore,
  DVault,
  ERROR_STATUS,
  ErrorFactory,
  genUUID,
  SchemaModuleOpts,
  SchemaModuleProps,
  SchemaOpts,
  SchemaProps,
  SchemaPropsDict,
  SchemaRaw,
  SchemaUtils,
} from "@saili/common-all";
import _ from "lodash";
import path from "path";
import { file2Schema, vault2Path } from "./filesv2";
import { createLogger, DLogger } from "./logger";
import Ajv from "ajv";
import AjvErrors from "ajv-errors";

class AJVProvider {
  static ajv: Ajv;

  static getAjv() {
    if (this.ajv === undefined) {
      this.ajv = new Ajv({ allErrors: true, allowUnionTypes: true });
      // Allows custom error messages to be specified within the ajv-schema definition.
      AjvErrors(this.ajv);
    }
    return this.ajv;
  }
}

let _LOGGER: DLogger | undefined;

function getLogger() {
  if (!_LOGGER) {
    _LOGGER = createLogger();
  }
  return _LOGGER;
}

export class ParserBaseV2 {
  constructor(public opts: { store: DStore; logger: any }) {}

  get logger() {
    return this.opts.logger;
  }
}

const DEFAULT_LOG_CTX = "parsingSchemas";

async function getSchemasFromImport(
  imports: string[] | undefined,
  opts: { fname: string; root: DVault; wsRoot: string }
) {
  const vpath = vault2Path({ vault: opts.root, wsRoot: opts.wsRoot });
  let schemaModulesFromImport: SchemaModuleProps[] = [];
  await Promise.all(
    _.map(imports, async (ent) => {
      const fpath = path.join(vpath, ent + ".schema.yml");
      schemaModulesFromImport.push(await file2Schema(fpath, opts.wsRoot));
    })
  );
  const schemaPropsFromImport = schemaModulesFromImport.flatMap((mod) => {
    const domain = mod.fname;
    return _.values(mod.schemas).map((ent) => {
      ent.data.pattern = ent.data.pattern || ent.id;
      ent.id = `${domain}.${ent.id}`;
      ent.fname = opts.fname;
      ent.parent = null;
      ent.children = ent.children.map((ent) => `${domain}.${ent}`);
      ent.vault = opts.root;
      return ent;
    });
  });

  getLogger().debug({ ctx: DEFAULT_LOG_CTX, schemaPropsFromImport });

  return schemaPropsFromImport;
}

/** AJV (https://ajv.js.org/) schemas for schema validation. */
const AJV_SCHEMAS = {
  SCHEMA_OBJ: {
    type: "object",
    properties: {
      id: { type: "string" },
      desc: { type: "string" },
      parent: { type: "string" },
      namespace: { type: "boolean" },
      children: { type: "array" },
      pattern: { type: "string" },
      title: { type: "string" },
      fname: { type: "string" },
      template: { type: ["string", "object"] },
      vault: { type: "object" },
      isIdAutoGenerated: { type: "boolean" },
    },
    required: [],
    additionalProperties: {
      not: true,
      errorMessage: "Detected invalid property ${0#}",
    },
    errorMessage: {
      properties: {
        id: "Id should be unique string value, found value='${/id}'",
        desc: "Description should be string value, found value='${/desc}'",
        parent:
          "Parent should be id of the parent schema, found value='${/parent}'",
        namespace:
          "Namespace should be a boolean flag, found value='${/namespace}'",
        pattern:
          "Pattern should be a string value, (preferably surrounded by quotes), found value='${/pattern}'",
        title: "Title should be a string value, found value='${/title}'",
        template:
          "Template should either be string id to the note OR typed template object, found value='${/template}'",
      },
    },
  },
};

export class SchemaParserV2 extends ParserBaseV2 {
  static async parseRaw(
    schemaOpts: SchemaModuleOpts,
    opts: { root: DVault; fname: string; wsRoot: string }
  ): Promise<SchemaModuleProps> {
    const version = _.isArray(schemaOpts) ? 0 : 1;
    if (version > 0) {
      return SchemaParserV2.parseSchemaModuleOpts(
        schemaOpts as SchemaModuleOpts,
        opts
      );
    } else {
      // TODO: legacy
      const schemaDict: SchemaPropsDict = {};
      (schemaOpts as unknown as SchemaOpts[]).map((ent) => {
        const schema = SchemaUtils.createFromSchemaOpts(ent);
        schemaDict[schema.id] = schema;
      });
      const maybeRoot = _.find(_.values(schemaDict), {
        parent: "root",
      }) as SchemaProps;
      return {
        version: 0,
        root: maybeRoot,
        schemas: schemaDict,
        fname: opts.fname,
        vault: opts.root,
      };
    }
  }

  private static noInlineChildren(ent: SchemaOpts) {
    return (
      !ent.children || ent.children.length === 0 || _.isString(ent.children[0])
    );
  }

  static validateTopSchemasHaveIds(schemas: SchemaOpts[]) {
    schemas.forEach((schema: any) => {
      if (_.isUndefined(schema.id)) {
        throw ErrorFactory.createSchemaValidationError({
          message: `Schema id is missing from top level schema. Schema at fault: '${JSON.stringify(
            schema
          )}'`,
        });
      }
    });
  }

  private static getSchemasFromFile(schemas: SchemaOpts[], vault: DVault) {
    const collector: SchemaProps[] = [];

    this.validateTopSchemasHaveIds(schemas);

    schemas.forEach((ent) => {
      if (this.noInlineChildren(ent)) {
        // Means we are dealing with non-inline schema and can just collect
        // the parsed value.
        collector.push(this.createFromSchemaOpts({ ...ent, vault }));
      } else {
        // When we are dealing with inline children we need to process/collect
        // the children bottom up from the inline tree and replace the children
        // object with collected/generated ids of the inline children.
        ent.children = this.processChildren(ent.children, collector, vault);

        // No all the entity children objects are collected and they have
        // been replaced with identifiers we can collect the root element itself.
        collector.push(this.createFromSchemaOpts({ ...ent, vault }));
      }
    });

    getLogger().debug({ ctx: DEFAULT_LOG_CTX, schemaPropsFromFile: collector });

    return collector;
  }

  static createFromSchemaRaw(
    opts: SchemaOpts & { vault: DVault }
  ): SchemaProps {
    this.validateSchemaOptsPreCreation(opts);

    return SchemaUtils.createFromSchemaRaw(opts);
  }

  static createFromSchemaOpts(
    opts: SchemaOpts & { vault: DVault }
  ): SchemaProps {
    this.validateSchemaOptsPreCreation(opts);

    return SchemaUtils.createFromSchemaOpts(opts);
  }

  private static validateSchemaOptsPreCreation(
    opts: (SchemaOpts | SchemaRaw) & { vault: DVault }
  ) {
    const validator = AJVProvider.getAjv().compile(AJV_SCHEMAS.SCHEMA_OBJ);
    const isValid = validator(opts);
    if (!isValid) {
      let message = "";
      validator.errors?.forEach((err) => {
        // When our custom AJV error is met the keyword of error will be set to
        // 'errorMessage' Hence in that case we expect the formatted message to
        // contain good enough description for the user.
        // If we encounter the non custom message then as backup we will
        // dump entire JSON error object as reason (which will be not be as pretty
        // but at least communicate the issue to the user).
        if (err.keyword === "errorMessage") {
          message += err.message + " ";
        } else {
          message += JSON.stringify(err) + " ";
        }
      });

      throw ErrorFactory.createSchemaValidationError({
        message: message,
      });
    }
  }

  private static processChildren(
    children: any[] | undefined,
    collector: SchemaProps[],
    vault: DVault
  ): DNodePointer[] {
    if (!children) {
      return [];
    }

    return children.map((child) => {
      // To process the node we need all its children to already be processed
      // hence call process children recursively to process the graph from bottom up.
      child.children = this.processChildren(child.children, collector, vault);

      this.setIdIfMissing(child);

      collector.push(this.createFromSchemaRaw({ ...child, vault }));

      return child.id;
    });
  }

  /**
   * Ids are optional for inline schemas hence if there isn't an id
   * we will generate the identifier. */
  private static setIdIfMissing(ent: SchemaRaw) {
    if (!ent.id) {
      // When id is missing than we must have a pattern for the schema.
      if (!ent.pattern) {
        throw ErrorFactory.createSchemaValidationError({
          message: `Pattern is missing in schema without id. Schema at fault='${JSON.stringify(
            ent
          )}'`,
        });
      }

      ent.isIdAutoGenerated = true;
      ent.id = genUUID();
    }
  }

  static async parseSchemaModuleOpts(
    schemaModuleProps: SchemaModuleOpts,
    opts: { fname: string; root: DVault; wsRoot: string }
  ): Promise<SchemaModuleProps> {
    const { imports, schemas, version } = schemaModuleProps;
    const { fname, root } = opts;
    getLogger().info({ ctx: DEFAULT_LOG_CTX, fname, root, imports });

    const schemasAll = [
      ...(await getSchemasFromImport(imports, opts)),
      ...this.getSchemasFromFile(schemas, root),
    ];

    const schemasDict: SchemaPropsDict = {};
    schemasAll.forEach((ent) => {
      schemasDict[ent.id] = ent;
    });

    const addConnections = (parent: SchemaProps) => {
      _.forEach(parent.children, (childId) => {
        const child = schemasDict[childId];

        if (child) {
          if (child.parent === null) {
            // Child does not have a parent pointers hence we can linkup the parent child as is.
            DNodeUtils.addChild(parent, child);
            addConnections(child);
          } else {
            // Child already contains a parent pointer hence we need to create a schema clone
            // otherwise we would end up writing over the already existing parent pointer.
            const childClone = _.cloneDeep(child);
            // We use a dictionary hence we need to generate a brand new identifier for our clone.
            childClone.id = `${childId}_${genUUID()}`;
            schemasDict[childClone.id] = childClone;

            // When it comes to schemas we often use the id as a matching pattern
            // unless there is a pattern explicitly specified. Since we created a randomized
            // identifier the id of our clone no longer can be used for pattern matching.
            // Hence if there isn't a pattern we will set the pattern to match original id.
            if (
              childClone.data === undefined ||
              childClone.data.pattern === undefined
            ) {
              _.set(childClone, "data.pattern", childId);
            }

            // Parent likely already has a reference to the original child identifier
            // so for us to be able to add new generated child id without creating duplicates
            // in the parent we will need to take out the original child id.
            if (parent.children.includes(childId)) {
              parent.children = parent.children.filter((ch) => ch !== childId);
            }

            // Finally we can create the connection between parent and the child clone.
            DNodeUtils.addChild(parent, childClone);
            addConnections(childClone);
          }
        } else {
          throw new DendronError({
            status: ERROR_STATUS.MISSING_SCHEMA,
            message: JSON.stringify({ parent, missingChild: childId }),
          });
        }
      });
    };

    // add parent relationship
    const rootModule = SchemaUtils.getModuleRoot(schemaModuleProps);
    addConnections(rootModule);

    return {
      version,
      imports,
      root: rootModule,
      schemas: schemasDict,
      fname,
      vault: root,
    };
  }
}
