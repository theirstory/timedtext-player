/**
 * @license
 * Copyright 2018 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */

import summary from 'rollup-plugin-summary';
import resolve from '@rollup/plugin-node-resolve';
import replace from '@rollup/plugin-replace';
import commonjs from '@rollup/plugin-commonjs'; // <-- add this line
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));

export default {
  input: 'dist/timedtext-player.js',
  output: {
    file: 'dist/timedtext-player.bundled.js',
    format: 'esm',
    sourcemap: 'inline',
  },
  external: [], // <--- Add this line!
  onwarn(warning, warn) {
    // Suppress circular dependency warnings from node_modules
    if (warning.code === 'CIRCULAR_DEPENDENCY' && warning.message.includes('node_modules')) {
      return;
    }
    // Suppress THIS_IS_UNDEFINED warnings
    if (warning.code === 'THIS_IS_UNDEFINED') {
      return;
    }
    // Show all other warnings
    warn(warning);
  },
  plugins: [
    replace({
      'Reflect.decorate': 'undefined',
      '__TIMEDTEXT_PLAYER_VERSION__': JSON.stringify(pkg.version),
      preventAssignment: true
    }),
    resolve(),
    commonjs({ defaultIsModuleExports: true }), // <-- add this line
    summary(),
  ],
};

// TODO: sourcemaps + d.ts? https://gist.github.com/rikkit/b636076740dfaa864ce9ee8ae389b81c
