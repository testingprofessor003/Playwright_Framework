'use strict';

require('tsx/cjs');

const loaded = require('./ExtentFormatter.ts');
module.exports = loaded.default || loaded;
