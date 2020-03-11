import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import livereload from "rollup-plugin-livereload";
import json from "@rollup/plugin-json";
import { name } from "./package.json";

export default [
  {
    input: "./index.js",
    output: {
      file: "dist/app.js",
      type: "iife",
      name
    },
    plugins: [
      resolve(),
      commonjs(),
      json(),
      process.env.ROLLUP_WATCH ? livereload() : null
    ]
  }
];
