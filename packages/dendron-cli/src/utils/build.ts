/* eslint-disable no-console */
import { DendronError, error2PlainObject } from "@saili/common-all";
import { createLogger, findUpTo } from "@saili/common-server";
import { Result, SyncOptions, Options, ExecaError, Message } from "execa";
import fs from "fs-extra";
import _ from "lodash";
import path from "path";
import semver from "semver";

type PkgJson = {
  name: string;
  displayName: string;
  description: string;
  main: string;
  version: string;
  repository: PkgRepository;
  devDependencies: { [key: string]: string };
  icon: string;
};

type PkgRepository = {
  type: "git";
  url: string;
  directory?: string;
};

export enum SemverVersion {
  MAJOR = "major",
  MINOR = "minor",
  PATCH = "patch",
  PRERELEASE = "prerelease",
}

export enum PublishEndpoint {
  LOCAL = "local",
  REMOTE = "remote",
}

export enum ExtensionType {
  DENDRON = "sail-dendron",
  NIGHTLY = "nightly",
}

const LOCAL_NPM_ENDPOINT = "http://localhost:4873";
const REMOTE_NPM_ENDPOINT = "https://registry.npmjs.org";

const $ = async (cmd: string, opts?: SyncOptions) => {
  const execa = await import("execa");
  return execa.execaSync(cmd, { shell: true, ...opts });
};
const $$ = async (cmd: string, opts?: Options & { quiet?: boolean }) => {
  const execa = await import("execa");
  const out = execa.execaCommand(cmd, { shell: true, ...opts });
  if (!opts?.quiet) {
    out.stdout?.pipe(process.stdout);
  }
  return out;
};

export class LernaUtils {
  static bumpVersion(version: SemverVersion) {
    $(`lerna version ${version} --no-git-tag-version`);
    $(`git add .`);
    $(`git commit -m "chore: publish ${version}"`);
  }

  static async publishVersion(endpoint: PublishEndpoint) {
    const url =
      endpoint === PublishEndpoint.LOCAL
        ? LOCAL_NPM_ENDPOINT
        : REMOTE_NPM_ENDPOINT;
    await $$(`lerna publish from-package --ignore-scripts --registry ${url}`);
    $(`node bootstrap/scripts/genMeta.js`);
  }
}

export class BuildUtils {
  static getLernaRoot() {
    const maybeRoot = findUpTo({
      base: process.cwd(),
      fname: "lerna.json",
      returnDirPath: true,
      maxLvl: 4,
    });
    if (!maybeRoot) {
      throw new DendronError({
        message: `no lerna root found from ${process.cwd()}`,
      });
    }
    return maybeRoot;
  }

  static getCurrentVersion(): string {
    return fs.readJSONSync(path.join(this.getLernaRoot(), "lerna.json"))
      .version;
  }

  static getPluginRootPath() {
    return path.join(this.getLernaRoot(), "packages", "plugin-core");
  }

  // static getPluginViewsRootPath() {
  //   return path.join(this.getLernaRoot(), "packages", "dendron-plugin-views");
  // }

  static getPkgMeta({ pkgPath }: { pkgPath: string }) {
    return fs.readJSONSync(pkgPath) as PkgJson;
  }

  static restorePluginPkgJson() {
    const pkgPath = path.join(this.getPluginRootPath(), "package.json");
    $(`git checkout -- ${pkgPath}`);
  }

  static setRegLocal() {
    $(`yarn config set registry ${LOCAL_NPM_ENDPOINT}`);
    $(`npm set registry ${LOCAL_NPM_ENDPOINT}`);
  }

  static setRegRemote() {
    $(`yarn config set registry ${REMOTE_NPM_ENDPOINT}`);
    $(`npm set registry ${REMOTE_NPM_ENDPOINT}`);
  }

  static genNextVersion(opts: {
    currentVersion: string;
    upgradeType: SemverVersion;
  }) {
    return semver.inc(opts.currentVersion, opts.upgradeType) as string;
  }

  // static buildPluginViews() {
  //   const root = this.getPluginViewsRootPath();
  //   $(`yarn build:prod`, { cwd: root });
  // }

  static async installPluginDependencies(): Promise<Result> {
    // remove root package.json before installing locally
    fs.removeSync(path.join(this.getLernaRoot(), "package.json"));
    return $(`yarn install --no-lockfile --update-checksums`, {
      cwd: this.getPluginRootPath(),
    });
  }

  static async installPluginLocally(version: string): Promise<Result> {
    await $$(
      `code-insiders --install-extension "dendron-${version}.vsix" --force`,
      { cwd: this.getPluginRootPath() }
    );
    return $$(`codium --install-extension "dendron-${version}.vsix" --force`, {
      cwd: this.getPluginRootPath(),
    });
  }

  static async compilePlugin({
    quiet,
    skipSentry,
  }: {
    quiet?: boolean;
    skipSentry?: boolean;
  }) {
    await $$(`yarn build:prod`, {
      cwd: this.getPluginRootPath(),
      env: skipSentry ? { SKIP_SENTRY: "true" } : {},
      quiet,
    });
  }

  /**
   * @param param0
   * @returns
   */
  static async packagePluginDependencies({
    skipSentry,
    quiet,
    extensionTarget,
  }: {
    skipSentry?: boolean;
    quiet?: boolean;
    extensionTarget?: string;
  }) {
    const execOpts = {
      cwd: this.getPluginRootPath(),
      env: skipSentry ? { SKIP_SENTRY: "true" } : {},
      quiet,
    };

    if (extensionTarget) {
      await $$(`vsce package --yarn --target ${extensionTarget}`, execOpts);
    } else {
      await $$(`vsce package --yarn`, execOpts);
    }
  }

  static async prepPluginPkg(target: ExtensionType = ExtensionType.DENDRON) {
    const pkgPath = path.join(this.getPluginRootPath(), "package.json");

    let version;
    let description;
    let icon;

    if (target === ExtensionType.NIGHTLY) {
      version = await this.getIncrementedVerForNightly();
      description =
        "This is a prerelease version of Dendron that may be unstable. Please install the main dendron extension instead.";
      icon = "media/logo-bw.png";
    }

    this.updatePkgMeta({
      pkgPath,
      name: target.toString(),
      displayName: target.toString(),
      description,
      main: "./dist/extension.js",
      repository: {
        url: "https://e.coding.net/sailing-innocents/create/SailDendron.git",
        type: "git",
      },
      version,
      icon,
    });
    this.removeDevDepsFromPkgJson({
      pkgPath,
      dependencies: ["@saili/common-test-utils", "vscode-test"],
    });

    await Promise.all(
      ["prisma-shim.js", "adm-zip.js"].map((ent) => {
        return fs.copy(
          path.join(
            this.getPluginRootPath(),
            "..",
            "engine-server",
            "src",
            "drivers",
            ent
          ),
          path.join(this.getPluginRootPath(), "dist", ent)
        );
      })
    );
  }

  /**
   * Gets the appropriate version to use for nightly ext. Published versions in
   * the marketplace must be monotonically increasing. If current package.json
   * version is greated than the marketplace, use that. Otherwise, just bump the
   * patch version.
   * @returns
   */
  static async getIncrementedVerForNightly() {
    const pkgPath = path.join(this.getPluginRootPath(), "package.json");
    const { version } = this.getPkgMeta({ pkgPath });
    const packageJsonVersion = version;
    console.log("package.json manifest version is " + packageJsonVersion);

    try {
      const extMetadata = await $$(`npx vsce show dendron.nightly --json`, {
        cwd: this.getPluginRootPath(),
      });
      const result = extMetadata.stdout;
      const formatted = result.replace("\t", "").replace("\n", "");
      const json = JSON.parse(formatted);

      const marketplaceVersion = json.versions[0]["version"];
      console.log("Marketplace Version is " + marketplaceVersion);
      const verToUse = semver.lt(marketplaceVersion, packageJsonVersion)
        ? packageJsonVersion
        : semver.inc(marketplaceVersion, "patch");
      return verToUse ?? undefined;
    } catch (err: any) {
      console.error(
        "Unable to fetch current version for nightly ext from VS Code marketplace. Attempting to use version in package.json. Error " +
          error2PlainObject(err)
      );
      return version;
    }
  }

  /**
   * Set NPM to publish locally
   */
  static prepPublishLocal() {
    this.setRegLocal();
  }

  /**
   * Set NPM to publish remotely
   */
  static prepPublishRemote() {
    this.setRegRemote();
  }

  /**
   *
   * @returns
   * @throws Error if typecheck is not successful
   */
  static runTypeCheck() {
    $("yarn lerna:typecheck", { cwd: this.getLernaRoot() });
  }

  static async sleep(ms: number) {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({});
      }, ms);
    });
  }

  static async startVerdaccio() {
    const execa = await import("execa");
    const subprocess = execa.execa("verdaccio");
    const logger = createLogger("verdaccio");
    subprocess.on("close", () => {
      logger.error({ state: "close" });
    });
    subprocess.on("disconnect", () => {
      logger.error({ state: "disconnect" });
    });
    subprocess.on("exit", () => {
      logger.error({ state: "exit" });
    });
    subprocess.on("error", (err: ExecaError) => {
      logger.error({ state: "error", payload: err });
    });
    subprocess.on("message", (message: Message) => {
      logger.info({ state: "message", message });
    });
    if (subprocess.stdout && subprocess.stderr) {
      subprocess.stdout.on("data", (chunk: Buffer) => {
        process.stdout.write(chunk);
        // verdaccio is ready
        // if (chunk.toString().match("http address")) {
        // }
      });
      subprocess.stderr.on("data", (chunk: any) => {
        process.stdout.write(chunk);
      });
    }
    return subprocess;
  }

  /**
   * Migrate assets from next-server, plugin-views, and api-server to plugin-core
   * @returns
   * ^gg4woyhxe1xn
   */
  static async syncStaticAssets() {
    // all assets are stored here
    const commonAssetsRoot = path.join(
      this.getLernaRoot(),
      "packages",
      "common-assets"
    );

    const commonAssetsBuildRoot = path.join(commonAssetsRoot, "build"); // comon-assets/build
    // destination for assets
    const pluginAssetPath = path.join(this.getPluginRootPath(), "assets"); // plugin-core/assets
    const pluginStaticPath = path.join(pluginAssetPath, "static"); // plugin-core/assets/static
    const pluginViewsRoot = path.join(
      this.getLernaRoot(),
      "packages",
      "dendron-plugin-views"
    );

    fs.ensureDirSync(pluginStaticPath);
    fs.emptyDirSync(pluginStaticPath);

    // copy over common assets
    fs.copySync(path.join(commonAssetsRoot, "assets", "css"), pluginStaticPath);

    // copy over katex fonts
    const katexFontsPath = path.join(
      commonAssetsBuildRoot,
      "assets",
      "css",
      "fonts"
    );
    fs.copySync(
      katexFontsPath,
      path.join(pluginStaticPath, "css", "themes", "fonts")
    );

    fs.copySync(
      path.join(commonAssetsRoot, "assets", "js"),
      path.join(pluginStaticPath, "js")
    );

    // copy assets from plugin view
    fs.copySync(
      path.join(pluginViewsRoot, "build", "static", "js"),
      path.join(pluginStaticPath, "js")
    );
  
    return { staticPath: pluginStaticPath };
  }

  static removeDevDepsFromPkgJson({
    pkgPath,
    dependencies,
  }: {
    pkgPath: string;
    dependencies: string[];
  }) {
    const pkg = fs.readJSONSync(pkgPath) as PkgJson;
    _.forEach(pkg.devDependencies, (_v, k) => {
      if (dependencies.includes(k)) {
        delete pkg.devDependencies[k];
      }
    });
    fs.writeJSONSync(pkgPath, pkg, { spaces: 4 });
  }

  static updatePkgMeta({
    pkgPath,
    name,
    displayName,
    description,
    main,
    repository,
    version,
    icon,
  }: {
    pkgPath: string;
    name: string;
    displayName: string;
  } & Partial<PkgJson>) {
    const pkg = fs.readJSONSync(pkgPath) as PkgJson;
    pkg.name = name;
    if (description) {
      pkg.description = description;
    }
    if (displayName) {
      pkg.displayName = displayName;
    }
    if (main) {
      pkg.main = main;
    }
    if (repository) {
      pkg.repository = repository;
    }
    if (version) {
      pkg.version = version;
    }
    if (icon) {
      pkg.icon = icon;
    }
    pkg.main = "dist/extension.js";
    fs.writeJSONSync(pkgPath, pkg, { spaces: 4 });
  }

  static async publish({
    cwd,
    osvxKey,
  }: {
    cwd: string;
    osvxKey: string;
  }): Promise<[Result, Result]> {
    return Promise.all([
      $("vsce publish", { cwd }),
      $("ovsx publish", {
        cwd,
        env: {
          OVSX_PAT: osvxKey,
        },
      }),
    ]);
  }

  static async publishInsider() {
    const pkgPath = this.getPluginRootPath();
    const { name, version } = await this.getPkgMeta({ pkgPath });
    const pkg = `${name}-${version}.vsix`;
    const bucket = "org-dendron-public-assets";
    await $(`aws s3 cp $package s3://${bucket}/publish/$${pkg}`);
    console.log(`https://${bucket}.s3.amazonaws.com/publish/${pkg}`);
  }
}
