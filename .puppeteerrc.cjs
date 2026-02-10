const { join } = require('path');

/**
 * Puppeteer конфигурация — Chrome binary хадгалах directory-г тогтмол заана.
 * Энэ файл install (npm install) болон runtime (puppeteer.launch()) хоёуланд ижил directory ашиглахыг баталгаажуулна.
 * PUPPETEER_CACHE_DIR env var байвал тэрийг ашиглана (Render.com дээр /opt/render/project/.puppeteer).
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  cacheDirectory: process.env.PUPPETEER_CACHE_DIR || join(__dirname, '.cache', 'puppeteer'),
};
