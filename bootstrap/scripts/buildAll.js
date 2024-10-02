/* eslint-disable no-console */

/**
 * Compiles all code for Dendron Plugin
 */

async function run() {
  const execa = await import("execa");
  
  const $ = (cmd) => {
    console.log(`$ ${cmd}`);
    return execa.execaCommandSync(cmd, { stdout: process.stdout, buffer: false });
  };

  console.log("building all...");
  $(`npx lerna run build --scope @dendronhq/common-all`);
  $(
    `npx lerna run build --parallel --scope "@dendronhq/{unified,common-server}"`
  );
  $(`npx lerna run build --scope @dendronhq/dendron-viz `);
  $(`npx lerna run build --scope @dendronhq/engine-server `);
  $(`npx lerna run build --scope @dendronhq/pods-core `);
  $(
    `npx lerna run build --parallel --scope "@dendronhq/{common-test-utils,api-server,common-assets}"`
  );
  $(
    `npx lerna run build --parallel --scope "@dendronhq/{common-frontend,dendron-cli}"`
  );
  $(`npx lerna run build --scope "sail-dendron"`);
  $(`npx yarn dendron dev sync_assets --fast`);
  console.log("done");

}

run();