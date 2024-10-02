import fs from "fs-extra";
import { findUpTo } from "./filesv2";

export class NodeJSUtils {
  static getVersionFromPkg(): string | undefined {
    const packageJsonPath = findUpTo({
      base: __dirname,
      fname: "package.json",
      maxLvl: 5,
    });
    if (!packageJsonPath) return undefined;
    try {
      const pkgJSON = fs.readJSONSync(packageJsonPath);
      if (!pkgJSON?.version) return undefined;
      return `${pkgJSON.version}`;
    } catch {
      // There may be errors if we couldn't read the file
      return undefined;
    }
  }
}

export type WebViewThemeMap = {
  dark: string;
  light: string;
  custom?: string;
};

function nothing(item: any) {
  return item;
}

export class WebViewCommonUtils {
  /**
   *
   * @param param0
   * @returns
   */
  static genVSCodeHTMLIndex = ({
    name,
    jsSrc,
    cssSrc,
    url,
    wsRoot,
    browser,
    acquireVsCodeApi,
    themeMap,
    initialTheme,
  }: {
    name: string;
    jsSrc: string;
    cssSrc: string;
    url: string;
    wsRoot: string;
    browser: boolean;
    acquireVsCodeApi: string;
    themeMap: WebViewThemeMap;
    initialTheme?: string;
  }) => {
    nothing(jsSrc);
    nothing(cssSrc);
    nothing(url);
    nothing(wsRoot);
    nothing(browser);
    nothing(acquireVsCodeApi);
    nothing(themeMap);
    nothing(initialTheme);

    const builtinStyle = "dendron-editor-follow-style";
    const defaultStyle = "dendron-editor-default-style";
    const overrideStyle = "dendron-editor-override-style";
    return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${name}</title>
        <link rel="stylesheet" href="${cssSrc}">
        <link rel="stylesheet" href="${builtinStyle}">
        <link rel="stylesheet" href="${defaultStyle}">
        <link rel="stylesheet" href="${overrideStyle}">
      </head>
      <body>
        Hello, ${name}
      </body>
    <html/>
    `;
  };
}
