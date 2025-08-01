import {
  DendronError,
  ERROR_SEVERITY,
  SEED_REGISTRY,
} from "@saili/common-all";
import { SeedSvcResp } from "@saili/engine-server";
import * as vscode from "vscode";
import { DENDRON_COMMANDS } from "../constants";
import { SeedCommandBase } from "./SeedCommandBase";

type CommandOpts = {
  seedId: Extract<keyof typeof SEED_REGISTRY, string>;
};

type CommandInput = {
  seedId: Extract<keyof typeof SEED_REGISTRY, string>;
};

type CommandOutput = SeedSvcResp;

export class SeedAddCommand extends SeedCommandBase<
  CommandOpts,
  CommandOutput
> {
  key = DENDRON_COMMANDS.SEED_ADD.key;

  async gatherInputs(): Promise<CommandInput | undefined> {
    // Don't allow users to add a seed that has already been added:
    const qpItems: vscode.QuickPickItem[] = Object.keys(SEED_REGISTRY)
      .filter((key) => !this.getSeedSvc().isSeedInWorkspace(key))
      .map((key) => {
        const value = SEED_REGISTRY[key];

        return {
          label: key,
          description: value?.description,
          detail: value?.site?.url,
        };
      });

    const selected = vscode.window.showQuickPick(qpItems).then((value) => {
      if (!value) {
        return;
      }
      return { seedId: value.label };
    });

    return selected;
  }

  async execute(_opts: CommandOpts): Promise<CommandOutput> {
    if (this.getSeedSvc().isSeedInWorkspace(_opts.seedId)) {
      return {
        error: new DendronError({
          message: "seed already added to workspace",
          severity: ERROR_SEVERITY.MINOR,
        }),
      };
    }

    const response = vscode.window
      .withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Adding Seed...",
          cancellable: false,
        },
        async () => {
          return this.getSeedSvc().addSeed({
            id: _opts.seedId,
            onUpdatingWorkspace: this.onUpdatingWorkspace,
            onUpdatedWorkspace: this.onUpdatedWorkspace,
          });
        }
      )
      .then((resp) => {
        if (resp?.error) {
          vscode.window.showErrorMessage("Error: ", resp.error.message);
        }

        return resp;
      });

    return response;
  }
}
