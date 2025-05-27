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
  $(`npx lerna run build --scope @saili/common-all`);
  $(
    `npx lerna run build --parallel --scope "@saili/{unified,common-server}"`
  );
  $(`npx lerna run build --scope @saili/dendron-viz `);
  $(`npx lerna run build --scope @saili/engine-server `);
  $(`npx lerna run build --scope @saili/pods-core `);
  $(
    `npx lerna run build --parallel --scope "@saili/{common-test-utils,api-server,common-assets}"`
  );
  $(
    `npx lerna run build --parallel --scope "@saili/{common-frontend,dendron-cli}"`
  );
  $(`npx lerna run build --scope "@saili/dendron-plugin-views"`);
  $(`npx lerna run build --scope "sail-dendron"`);
  $(`npx yarn dendron dev sync_assets --fast`);
  console.log("done");

}

run();