import * as vscode from "vscode";
import { Logger } from "./logger";
import { DWorkspace } from "./workspacev2";
import { activate as activateExt } from "./_extension";

export function activate(context: vscode.ExtensionContext) {
  Logger.configure(context, "debug");
  // require("./_extension").activate(context); // eslint-disable-line global-require
  activateExt(context);
  return {
    DWorkspace,
    Logger,
  };
	// console.log('Congratulations, your extension "dummy" is now active!');  
	// const disposable = vscode.commands.registerCommand('dummy.helloWorld', () => {
	// 	vscode.window.showInformationMessage('Hello World from dummy!');
	// });
	// context.subscriptions.push(disposable);
}

export function deactivate() {
  require("./_extension").deactivate(); // eslint-disable-line global-require
}
