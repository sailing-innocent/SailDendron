import {
  assert,
  ConfigUtils,
  DendronError,
  DendronPublishingConfig,
  DNodeUtils,
  DuplicateNoteBehavior,
  DVault,
  DVaultVisibility,
  getSlugger,
  HierarchyConfig,
  IDendronError,
  DendronConfig,
  isBlockAnchor,
  NoteDicts,
  NoteDictsUtils,
  NoteProps,
  NotePropsMeta,
  NoteUtils,
  UseVaultBehavior,
  VaultUtils,
} from "@saili/common-all";

import _ from "lodash";

// const LOGGER_NAME = "SiteUtils";

export class SiteUtils {
  static canPublish(opts: {
    note: NoteProps;
    config: DendronConfig;
    wsRoot: string;
    vaults: DVault[];
  }) {
    const { note, config, wsRoot, vaults } = opts;

    // not private note
    if (note.custom?.published === false) {
      return false;
    }
    // check if note is note blocked
    const hconfig = this.getConfigForHierarchy({
      config,
      noteOrName: note,
    });
    const noteVault = VaultUtils.matchVault({
      vault: note.vault,
      vaults,
      wsRoot,
    });
    assert(noteVault !== false, `noteVault ${note.vault.fsPath} should exist`);
    const cNoteVault = noteVault as DVault;
    // not from private vault
    if (
      (noteVault as DVault).visibility &&
      (noteVault as DVault).visibility === DVaultVisibility.PRIVATE
    ) {
      return false;
    }

    // check if allowed in hconfig
    let publishByDefault;
    if (!_.isUndefined(hconfig?.publishByDefault)) {
      // handle property being a boolean or an object
      publishByDefault = _.isBoolean(hconfig.publishByDefault)
        ? hconfig.publishByDefault
        : hconfig.publishByDefault[VaultUtils.getName(cNoteVault)];
    }
    if (!publishByDefault && !(note.custom?.published === true)) {
      return false;
    }

    return true;
  }

  static isPublished(opts: {
    note: NoteProps;
    config: DendronConfig;
    wsRoot: string;
    vaults: DVault[];
  }) {
    const { note, config } = opts;
    // check if note is in index
    const domain = DNodeUtils.domainName(note.fname);
    const publishingConfig = ConfigUtils.getPublishing(config);
    if (
      publishingConfig.siteHierarchies[0] !== "root" &&
      publishingConfig.siteHierarchies.indexOf(domain) < 0
    ) {
      return false;
    }
    return this.canPublish(opts);
  }

  // static async copyAssets(opts: {
  //   wsRoot: string;
  //   vault: DVault;
  //   siteAssetsDir: string;
  //   /**
  //    * Delete existing siteAssets
  //    */
  //   deleteSiteAssetsDir?: boolean;
  // }) {
  //   const { wsRoot, vault, siteAssetsDir, deleteSiteAssetsDir } = opts;
  //   const vaultAssetsDir = path.join(vault2Path({ wsRoot, vault }), "assets");
  //   if (fs.existsSync(siteAssetsDir) && deleteSiteAssetsDir) {
  //     console.log("removing existing assets");
  //     fs.removeSync(siteAssetsDir);
  //   }
  //   if (fs.existsSync(vaultAssetsDir)) {
  //     // TODO: be smarter about this
  //     return fs.copy(path.join(vaultAssetsDir), siteAssetsDir, {
  //       overwrite: true,
  //       errorOnExist: false,
  //     });
  //   }
  //   return;
  // }

  /**
   * Creates a placeholder note that can be used for rendering a 403 error
   * message.
   */
  static create403StaticNote(opts: { vaults: DVault[] }) {
    return NoteUtils.create({
      vault: opts.vaults[0],
      fname: "403",
      id: "403",
      title: "This page has not yet sprouted",
      body: [
        "[Dendron](https://dendron.so/) (the tool used to generate this site) lets authors selective publish content. You will see this page whenever you click on a link to an unpublished page",
        "",
        "![](https://foundation-prod-assetspublic53c57cce-8cpvgjldwysl.s3-us-west-2.amazonaws.com/assets/images/not-sprouted.png)",
      ].join("\n"),
    });
  }

  static createSiteOnlyNotes(opts: { vaults: DVault[] }) {
    const note403 = this.create403StaticNote({ vaults: opts.vaults });
    return [note403];
  }

  // static async filterByConfig(opts: {
  //   engine: DEngineClient;
  //   config: IntermediateDendronConfig;
  //   noExpandSingleDomain?: boolean;
  // }): Promise<{ notes: NotePropsByIdDict; domains: NoteProps[] }> {
  //   const logger = createLogger(LOGGER_NAME);
  //   const { engine, config } = opts;

  //   const cleanPublishingConfig = configIsV4(config)
  //     ? DConfig.cleanSiteConfig(
  //         ConfigUtils.getSite(config) as DendronSiteConfig
  //       )
  //     : DConfig.cleanPublishingConfig(ConfigUtils.getPublishing(config));

  //   DConfig.setCleanPublishingConfig({
  //     config,
  //     cleanConfig: cleanPublishingConfig,
  //   });

  //   const { siteHierarchies } = cleanPublishingConfig;
  //   logger.info({ ctx: "filterByConfig", config });
  //   let domains: NoteProps[] = [];
  //   const hiearchiesToPublish: NotePropsByIdDict[] = [];

  //   // async pass to process all notes
  //   const domainsAndhiearchiesToPublish = await Promise.all(
  //     siteHierarchies.map(async (domain, idx) => {
  //       const out = await SiteUtils.filterByHierarchy({
  //         domain,
  //         config,
  //         engine,
  //         navOrder: idx,
  //       });
  //       if (_.isUndefined(out)) {
  //         return undefined;
  //       }
  //       return out;
  //     })
  //   );

  //   // synchronous pass to add notes in order
  //   _.forEach(domainsAndhiearchiesToPublish, (ent) => {
  //     if (_.isUndefined(ent)) {
  //       return;
  //     }
  //     const { domain, notes } = ent;
  //     domains.push(domain);
  //     hiearchiesToPublish.push(notes);
  //   });
  //   // if single hierarchy, domain includes all immediate children
  //   if (
  //     !opts.noExpandSingleDomain &&
  //     siteHierarchies.length === 1 &&
  //     domains.length === 1
  //   ) {
  //     const rootDomain = domains[0];
  //     // special case, check if any of these children were supposed to be hidden
  //     domains = domains
  //       .concat(rootDomain.children.map((id) => notes[id]))
  //       .filter((note) => this.canPublish({ note, config, engine }));
  //   }
  //   logger.info({
  //     ctx: "filterByConfig",
  //     domains: domains.map((ent) => ent.fname),
  //   });

  //   return {
  //     notes: _.reduce(
  //       hiearchiesToPublish,
  //       (ent, acc) => {
  //         return _.merge(acc, ent);
  //       },
  //       {}
  //     ),
  //     domains,
  //   };
  // }

  // /**
  //  * Filter notes to be published using hierarchy
  //  */
  // static async filterByHierarchy(opts: {
  //   domain: string;
  //   config: IntermediateDendronConfig;
  //   engine: DEngineClient;
  //   navOrder: number;
  // }): Promise<{ notes: NotePropsByIdDict; domain: NoteProps } | undefined> {
  //   const { domain, engine, navOrder, config } = opts;
  //   // const logger = createLogger(LOGGER_NAME);
  //   // logger.info({ ctx: "filterByHierarchy:enter", domain, config });
  //   const hConfig = this.getConfigForHierarchy({
  //     config,
  //     noteOrName: domain,
  //   });
  //   const notesForHierarchy = _.clone(engine.notes);

  //   // get the domain note
  //   const notes = await engine.findNotes({ fname: domain });
  //   // logger.info({
  //   //   ctx: "filterByHierarchy:candidates",
  //   //   domain,
  //   //   hConfig,
  //   //   notes: notes.map((ent) => ent.id),
  //   // });

  //   let domainNote: NoteProps | undefined;
  //   const publishingConfig = ConfigUtils.getPublishingConfig(config);
  //   const duplicateNoteBehavior = publishingConfig.duplicateNoteBehavior;
  //   // duplicate notes found with same name, need to intelligently resolve
  //   if (notes.length > 1) {
  //     domainNote = SiteUtils.handleDup({
  //       allowStubs: false,
  //       dupBehavior: duplicateNoteBehavior,
  //       engine,
  //       config,
  //       fname: domain,
  //       noteCandidates: notes,
  //       noteDict: notesForHierarchy,
  //     });
  //     // no note found
  //   } else if (notes.length < 1) {
  //     // logger.error({
  //     //   ctx: "filterByHierarchy",
  //     //   msg: "note not found",
  //     //   domain,
  //     // });
  //     // TODO: add warning
  //     return;
  //   } else {
  //     // get the note
  //     domainNote = { ...notes[0] };
  //   }

  //   // if no note found or can't publish, then stop here
  //   if (
  //     _.isUndefined(domainNote) ||
  //     !this.canPublish({ note: domainNote, config, engine })
  //   ) {
  //     return;
  //   }

  //   // correct metadata since `custom` is an optional prop
  //   if (!domainNote.custom) {
  //     domainNote.custom = {};
  //   }
  //   // set domain note settings
  //   // navOrder is the same order that is in dendron.yml
  //   domainNote.custom.nav_order = navOrder;
  //   domainNote.parent = null;

  //   // if note is hoempage, set permalink to indicate this
  //   if (domainNote.fname === publishingConfig.siteIndex) {
  //     domainNote.custom.permalink = "/";
  //   }

  //   // logger.info({
  //   //   ctx: "filterByHierarchy",
  //   //   domainNote: NoteUtils.toNoteLoc(domainNote),
  //   // });

  //   // gather all the children of this hierarchy
  //   const out: NotePropsByIdDict = {};
  //   const processQ = [domainNote];

  //   while (!_.isEmpty(processQ)) {
  //     // we cast because the `_.isEmpty` check guarantees that this is not undefined
  //     let note = processQ.pop() as NoteProps;

  //     // logger.debug({
  //     //   ctx: "filterByHierarchy",
  //     //   maybeNote: NoteUtils.toNoteLoc(note),
  //     // });

  //     // add custom metadata to note
  //     note = SiteUtils.cleanNote({ note, hConfig });
  //     const siteFM = note.custom || ({} as DendronSiteFM);

  //     // TODO: legacy behavior around stubs, will need to remove
  //     if (publishingConfig.writeStubs && note.stub) {
  //       delete note.stub;
  //       // eslint-disable-next-line no-await-in-loop
  //       await engine.writeNote(note);
  //     } else {
  //       // eslint-disable-next-line no-await-in-loop
  //       await engine.writeNote(note, { metaOnly: true });
  //     }

  //     // if `skipLevels` is enabled, the children of the current note are descendants
  //     // further down
  //     let children = HierarchyUtils.getChildren({
  //       skipLevels: siteFM.skipLevels || 0,
  //       note,
  //       notes: notesForHierarchy,
  //     });
  //     if (siteFM.skipLevels && siteFM.skipLevels > 0) {
  //       note.children = children.map((ent) => ent.id);
  //       children.forEach((ent) => {
  //         ent.parent = note.id;
  //       });
  //     }

  //     // remove any children that shouldn't be published
  //     children = _.filter(children, (note: NoteProps) =>
  //       SiteUtils.canPublish({
  //         note,
  //         config,
  //         engine,
  //       })
  //     );
  //     // logger.debug({
  //     //   ctx: "filterByHierarchy:post-filter-children",
  //     //   note: NoteUtils.toNoteLoc(note),
  //     //   children: children.map((ent) => ent.id),
  //     // });
  //     // TODO: handle dups

  //     // add children to Q to be processed
  //     children.forEach((child: NoteProps) => {
  //       // update parent to be current note
  //       // dup merging at the top could cause children from multiple vaults
  //       // to be present
  //       child.parent = note.id;
  //       processQ.push(child);
  //     });

  //     // updated children
  //     out[note.id] = {
  //       ...note,
  //       children: children.map((ent) => ent.id),
  //     };
  //   }
  //   return { notes: out, domain: domainNote };
  // }

  /**
   * Apply custom frontmatter and formatting to note
   */
  static cleanNote({
    note,
    hConfig,
  }: {
    note: NoteProps;
    hConfig: HierarchyConfig;
  }) {
    hConfig.customFrontmatter?.forEach((fm) => {
      const { key, value } = fm;
      _.set(note, `custom.${key}`, value);
    });
    return {
      ...note,
      // body: stripLocalOnlyTags(note.body),
    };
  }

  static getConfigForHierarchy(opts: {
    config: DendronConfig;
    noteOrName: NoteProps | string;
  }) {
    const { config, noteOrName } = opts;
    const fname = _.isString(noteOrName) ? noteOrName : noteOrName.fname;
    const domain = DNodeUtils.domainName(fname);

    const hierarchyConfig = ConfigUtils.getHierarchyConfig(config);
    const rConfig: HierarchyConfig = _.defaults(
      _.get(hierarchyConfig, "root", {
        publishByDefault: true,
        customFrontmatter: [],
      })
    );
    const hConfig: HierarchyConfig = _.defaults(
      _.get(hierarchyConfig, domain),
      rConfig
    );
    return hConfig;
  }

  static getSiteUrlRootForVault({
    vault,
    config,
  }: {
    vault: DVault;
    config: DendronConfig;
  }): { url?: string; index?: string } {
    if (vault.seed) {
      const seeds = ConfigUtils.getWorkspace(config).seeds;
      if (seeds && seeds[vault.seed]) {
        const maybeSite = seeds[vault.seed]?.site;
        if (maybeSite) {
          return { url: maybeSite.url, index: maybeSite.index };
        }
      }
    }
    if (vault.siteUrl) {
      return { url: vault.siteUrl, index: vault.siteIndex };
    }
    const { siteUrl, siteIndex } = ConfigUtils.getPublishing(config);
    return { url: siteUrl, index: siteIndex };
  }

  static getSitePrefixForNote(config: DendronConfig) {
    const assetsPrefix = ConfigUtils.getAssetsPrefix(config);
    return assetsPrefix ? assetsPrefix + "/notes/" : "/notes/";
  }

  static getSiteUrlPathForNote({
    pathValue,
    pathAnchor,
    config,
    addPrefix,
    note,
  }: {
    pathValue?: string;
    pathAnchor?: string;
    config: DendronConfig;
    addPrefix?: boolean;
    note?: NoteProps;
  }): string {
    // add path prefix if valid
    let pathPrefix: string = "";
    if (addPrefix) {
      pathPrefix = this.getSitePrefixForNote(config);
    }

    // slug anchor if it is not a block anchor
    if (pathAnchor && !isBlockAnchor(pathAnchor)) {
      pathAnchor = `${getSlugger().slug(pathAnchor)}`;
    }

    // no prefix if we are at the index note
    const isIndex: boolean = _.isUndefined(note)
      ? false
      : SiteUtils.isIndexNote({
          indexNote: config.publishing?.siteIndex,
          note,
        });
    if (isIndex) {
      return `/`;
    }
    // remove extension for pretty links
    const usePrettyLinks = ConfigUtils.getEnablePrettlyLinks(config);
    const pathExtension =
      _.isBoolean(usePrettyLinks) && usePrettyLinks ? "" : ".html";

    // put together the url path
    return `${pathPrefix || ""}${pathValue}${pathExtension}${
      pathAnchor ? "#" + pathAnchor : ""
    }`;
  }

  // TODO: Delete duplicate version in engine-server's SiteUtils.
  static handleDup(opts: {
    dupBehavior?: DuplicateNoteBehavior;
    fname: string;
    config: DendronConfig;
    noteCandidates: NoteProps[];
    noteDict: NoteDicts;
    vaults: DVault[];
    wsRoot: string;
  }) {
    const {
      vaults,
      wsRoot,
      fname,
      noteCandidates,
      noteDict,
      config,
      dupBehavior,
    } = _.defaults(opts, {
      dupBehavior: {
        action: "useVault",
        payload: [],
      } as UseVaultBehavior,
      allowStubs: true,
    });
    // const ctx = "handleDup";
    let domainNote: NoteProps | undefined;

    if (_.isArray(dupBehavior.payload)) {
      const vaultNames = dupBehavior.payload;
      _.forEach(vaultNames, (vname) => {
        if (domainNote) {
          return;
        }
        const vault = VaultUtils.getVaultByNameOrThrow({
          vname,
          vaults,
        });

        const maybeNote = NoteDictsUtils.findByFname({
          fname,
          noteDicts: noteDict,
          vault,
        })[0];
        if (
          maybeNote &&
          this.canPublish({
            config,
            note: maybeNote,
            wsRoot,
            vaults,
          })
        ) {
          domainNote = maybeNote;
        }
      });
      if (!domainNote) {
        throw new DendronError({
          message: `no notes found for ${fname} in vaults ${vaultNames}`,
        });
      }
    } else {
      const vault = dupBehavior.payload.vault;
      const maybeDomainNotes = noteCandidates.filter((n) =>
        VaultUtils.isEqual(n.vault, vault, wsRoot)
      );
      if (maybeDomainNotes.length < 1) {
        throw new DendronError({
          message: `no notes found for ${fname} in vault ${vault.fsPath}`,
        });
      }
      if (
        !this.canPublish({
          config,
          note: maybeDomainNotes[0],
          wsRoot,
          vaults,
        })
      ) {
        return;
      }
      domainNote = maybeDomainNotes[0];
    }
    const domainId = domainNote.id;
    // merge children
    domainNote.children = getUniqueChildrenIds(noteCandidates);
    // update parents
    domainNote.children.forEach((id) => {
      const maybeNote = noteDict.notesById[id];
      if (maybeNote) {
        maybeNote.parent = domainId;
      }
    });
    return domainNote;
  }

  /**
   * Is the current note equivalent ot the index of the published site?
   * @returns
   */
  static isIndexNote({
    indexNote,
    note,
  }: {
    indexNote?: string;
    note: NotePropsMeta;
  }): boolean {
    return indexNote ? note.fname === indexNote : DNodeUtils.isRoot(note);
  }

  static validateConfig(sconfig: DendronPublishingConfig): {
    error?: IDendronError;
  } {
    // asset prefix needs one slash
    if (!_.isUndefined(sconfig.assetsPrefix)) {
      if (!sconfig.assetsPrefix.startsWith("/")) {
        return {
          error: new DendronError({
            message: "assetsPrefix requires a '/' in front of the path",
          }),
        };
      }
    }
    return { error: undefined };
  }
}

function getUniqueChildrenIds(notes: NoteProps[]): string[] {
  return _.uniq(notes.flatMap((ent) => ent.children));
}
