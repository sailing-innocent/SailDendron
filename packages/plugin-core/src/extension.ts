import * as vscode from "vscode";
import { Logger } from "./logger";
import { DWorkspace } from "./workspacev2";

export function activate(context: vscode.ExtensionContext) {
  // vscode.window.showInformationMessage("Hello World from Sail Dendron!");
	// const disposable = vscode.commands.registerCommand('dummy.helloWorld', () => {
	// 	vscode.window.showInformationMessage('Hello World from dummy!');
	// });
	// context.subscriptions.push(disposable);

  Logger.configure(context, "debug");
  require("./_extension").activate(context); // eslint-disable-line global-require
  return {
    DWorkspace,
    Logger,
  };
}

export function deactivate() {
  require("./_extension").deactivate(); // eslint-disable-line global-require
}
