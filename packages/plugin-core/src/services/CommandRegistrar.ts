import { NoteTrait } from "@saili/common-all";
import * as vscode from "vscode";
import { CreateNoteWithTraitCommand } from "../commands/CreateNoteWithTraitCommand";
import { IDendronExtension } from "../dendronExtensionInterface";

/**
 * Manages registration of new VS Code commands. This service is intended for
 * use of dynamically created (and registered) commands. Static commands that
 * are registered onActivate() should not use this class
 */
export class CommandRegistrar {
  private _extension: IDendronExtension;
  private context: vscode.ExtensionContext;

  private disposables: {
    [traitId: string]: vscode.Disposable;
  };

  public CUSTOM_COMMAND_PREFIX = "dendron.customCommand.";

  readonly registeredCommands: {
    [traitId: string]: string;
  };

  constructor(extension: IDendronExtension) {
    this._extension = extension;
    this.context = extension.context;
    this.registeredCommands = {};
    this.disposables = {};
  }

  registerCommandForTrait(trait: NoteTrait): string {
    const commandId = trait.id;
    const cmd = new CreateNoteWithTraitCommand(
      this._extension,
      commandId,
      trait
    );

    const registeredCmdName = this.CUSTOM_COMMAND_PREFIX + commandId;
    this.registeredCommands[commandId] = registeredCmdName;
    const disp = vscode.commands.registerCommand(
      registeredCmdName,
      () => cmd.run(),
      this
    );
    this.context.subscriptions.push(disp);

    this.disposables[commandId] = disp;

    return registeredCmdName;
  }

  unregisterTrait(trait: NoteTrait): void {
    if (trait.id in this.registeredCommands) {
      delete this.registeredCommands[trait.id];
    }

    if (trait.id in this.disposables) {
      this.disposables[trait.id]?.dispose();
      delete this.disposables[trait.id];
    }
  }
}
