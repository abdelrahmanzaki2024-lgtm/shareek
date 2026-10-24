#!/bin/bash
cd /tmp/claude-0/work/app
cat src/01_base.js src/02_content.js src/03_logic.js src/04_service.js src/04b_fleet.js src/04c_fcm.js src/04d_ops.js src/05_extras.js src/06_seed.js > dist/core_nogas.js
cp dist/core_nogas.js dist/core.js
echo ";if (typeof module!=='undefined') module.exports = C3A;" >> dist/core.js
cat dist/core_nogas.js src/07_gas.js > dist/core_gas.js
