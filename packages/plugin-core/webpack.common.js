const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");
// const SentryWebpackPlugin = require("@sentry/webpack-plugin");
const BundleAnalyzerPlugin =
  require("webpack-bundle-analyzer").BundleAnalyzerPlugin;
const CircularDependencyPlugin = require("circular-dependency-plugin");

/**@type {import('webpack').Configuration}*/
const config = {
  target: "node",
  entry: {
    extension: "./src/extension.ts",
    server: "./src/server.ts",
  },
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "[name].js",
    // commonjs2 is like commonjs but also includes the module.exports
    // see https://github.com/webpack/webpack/issues/1114
    libraryTarget: "commonjs2",
    devtoolModuleFilenameTemplate: "../[resource-path]",
  },
  node: {
    __dirname: false,
  },
  devtool: "source-map",
  externals: [
    {
      vscode: "commonjs vscode", // the vscode-module is created on-the-fly and must be excluded
      "pino-pretty": "pino-pretty",
    },
    // see [[../packages/plugin-core/webpack-require-hack.js]] for more details
    /\.\/webpack-require-hack/,
    /\.\/prisma-shim/,
    /\.\/adm-zip/,
    /\.\/sqlite3-binding/,
  ],
  resolve: {
    extensions: [".tsx", ".ts", ".js"],
  },
  plugins: [
    new CopyPlugin({
      patterns: [{ from: path.join("assets", "static"), to: "static" }],
    }),
    new CopyPlugin({
      patterns: [{ from: path.join("assets", "dendron-ws"), to: "dendron-ws" }],
    }),
    // used for dendron.yml validation at runtime
    new CopyPlugin({
      patterns: [
        {
          from: path.join(
            "..",
            "common-all",
            "data",
            "dendron-yml.validator.json"
          ),
          to: "dendron-yml.validator.json",
        },
      ],
    }),
    new CopyPlugin({
      patterns: [
        { from: "webpack-require-hack.js", to: "webpack-require-hack.js" },
        { from: "sqlite3-binding.js", to: "sqlite3-binding.js" },
        {
          from: path.join("lib", "binding", "*", "node_sqlite3.node"),
          to: "node_sqlite3.node",
          noErrorOnMissing: true,
        },
      ],
    }),
    // see [[dendron://dendron.dendron-site/dendron.topic.dev.cli.package-plugin]] for usage
    ...(process.env.ANALYZE_BUNDLE
      ? [
          new BundleAnalyzerPlugin({
            analyzerMode: "static",
            openAnalyzer: false,
            generateStatsFile: true,
          }),
        ]
      : []),
    ...(process.env.DETECT_CIRCULAR_DEPS
      ? [
          new CircularDependencyPlugin({
            // exclude detection of files based on a RegExp
            exclude: /a\.js|node_modules/,
            // include specific files based on a RegExp
            include: /src/,
            // add warnings to webpack instead of errors
            failOnError: false,
            // allow import cycles that include an asyncronous import,
            // e.g. via import(/* webpackMode: "weak" */ './file.js')
            allowAsyncCycles: false,
            // set the current working directory for displaying module paths
            cwd: process.cwd(),
          }),
        ]
      : []),
  ],
  module: {
    rules: [
      {
        include: /node_modules/,
        test: /\.mjs$/,
        type: "javascript/auto",
      },
      // don't handle the following files - causes errors
      { test: /\.node$/, loader: "ignore-loader" },
      { test: /\.d\.ts$/, loader: "ignore-loader" },
      { test: /\.js\.map$/, loader: "ignore-loader" },
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: [
          {
            loader: "ts-loader",
            options: {
              ignoreDiagnostics: [
                6196,
                // never read
                6133,
                // import not used
                6192,
                // cannot find namespace jest
                2503,
              ],
              configFile: "tsconfig.build.json",
              transpileOnly: true,
              compilerOptions: {
                module: "es6", // override `tsconfig.json` so that TypeScript emits native JavaScript modules.
              },
            },
          },
        ],
      },
    ],
  },
};
module.exports = config;
