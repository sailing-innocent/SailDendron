import { getAllImportPods, PROMPT } from "@saili/pods-core";
import yargs from "yargs";
import { CLICommand, CommandCommonProps } from "./base";
import { enrichPodArgs, handleConflict, PodCLIOpts, setupPodArgs } from "./pod";
import { setupEngineArgs, SetupEngineCLIOpts, SetupEngineResp } from "./utils";
import prompts from "prompts";
import { DendronError } from "@saili/common-all";

export { CommandCLIOpts as ExportPodCLIOpts };

type CommandCLIOpts = {} & SetupEngineCLIOpts & PodCLIOpts;

type CommandOpts = CommandCLIOpts &
  CommandCommonProps & {
    podClass: any;
    config: any;
    onPrompt?: (
      arg0?: PROMPT
    ) => Promise<string | { title: string } | undefined>;
  } & SetupEngineResp;

type CommandOutput = CommandCommonProps;

export class ImportPodCLICommand extends CLICommand<
  CommandOpts,
  CommandOutput
> {
  constructor() {
    super({
      name: "importPod",
      desc: "use a pod to import notes",
    });
  }

  buildArgs(args: yargs.Argv<CommandCLIOpts>) {
    super.buildArgs(args);
    setupEngineArgs(args);
    setupPodArgs(args);
  }

  async enrichArgs(args: CommandCLIOpts) {
    this.addArgsToPayload({ podId: args.podId });
    return enrichPodArgs({ pods: getAllImportPods(), podType: "import" })(args);
  }

  async execute(opts: CommandOpts): Promise<CommandOutput> {
    const { podClass: PodClass, config, wsRoot, engine, server } = opts;
    const vaults = engine.vaults;
    const pod = new PodClass();
    const utilityMethods = {
      handleConflict,
    };
    await pod.execute({
      wsRoot,
      config,
      engine,
      vaults,
      utilityMethods,
      onPrompt: async (type?: PROMPT) => {
        const resp =
          type === PROMPT.USERPROMPT
            ? await prompts({
                type: "text",
                name: "title",
                message: "Do you want to overwrite: Yes/No",
                validate: (title) =>
                  ["yes", "no"].includes(title.toLowerCase())
                    ? true
                    : `Enter either Yes or No`,
              })
            : // eslint-disable-next-line no-console
              console.log("Note is already in sync with the google doc");

        return resp;
      },
    });
    return new Promise((resolve) => {
      server.close((err: any) => {
        if (err) {
          const error = new DendronError({
            message: "error closing server",
            payload: err,
          });
          return resolve({ error });
        }
        resolve({});
      });
    });
  }
}
