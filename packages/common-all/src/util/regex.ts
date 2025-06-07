import _ from "lodash";

/** Kind-of parses a URI and extracts the scheme. Not an actual parser and will accept invalid URIs. */
export const uriRegex = /^(?<scheme>[\w+.-]+):(\/\/)?\S+/;
/** Returns true if this is a non-dendron uri, false if it is dendron://, undefined if it's not a URI */
export const containsNonDendronUri = (uri: string): boolean | undefined => {
  const groups = uriRegex.exec(uri)?.groups;
  if (_.isUndefined(groups) || _.isUndefined(groups.scheme)) return undefined;
  if (groups.scheme === "dendron") return false;
  return true;
};

export function isWebUri(uri: string): boolean {
  const scheme = uri.match(uriRegex)?.groups?.scheme;
  if (scheme === "http" || scheme === "https") return true;
  return false;
}

export function isSrcUri(uri: string): boolean {
  const scheme = uri.match(uriRegex)?.groups?.scheme;
  if (scheme === "src") return true;
  return false;
}

/**
 * Given a uri, determine if it is a [command uri](https://code.visualstudio.com/api/extension-guides/command#command-uris)
 * Command uris have the following scheme
 * `command:{uri}`
 */
export function isVSCodeCommandUri(uri: string): boolean {
  const scheme = uri.match(uriRegex)?.groups?.scheme;
  if (scheme === "command") return true;
  return false;
}
