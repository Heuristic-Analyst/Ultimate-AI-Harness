/* fingerprint.js - makes the JS-visible fingerprint agree with a Windows Chrome UA.
 *
 * Registered by agent-browser so it runs BEFORE any page script, in every frame:
 *   config: {"initScripts": ["/opt/fingerprint/fingerprint.js"]}
 *   env:    AGENT_BROWSER_INIT_SCRIPTS=/opt/fingerprint/fingerprint.js
 *   flag:   agent-browser open <url> --init-script /opt/fingerprint/fingerprint.js
 *
 * It reads the version straight out of navigator.userAgent, so change the UA in
 * the config and this file follows. Nothing here is site-specific.
 */
(function () {
  if (window.__fpDone) return;
  window.__fpDone = true;

  var define = function (obj, prop, value) {
    try {
      Object.defineProperty(obj, prop, { get: function () { return value; }, configurable: true, enumerable: true });
    } catch (e) {}
  };

  /* Since Chrome 101 the UA string carries only the major version (158.0.0.0). The real
   * full version lives in Client Hints, so it has to be kept here by hand: update both
   * this line and the userAgent in agent-browser.json when you move to a new Chrome. */
  var CHROME_FULL = '156.0.8078.79';

  var ua = navigator.userAgent || '';
  var m = /Chrome\/(\d+)/.exec(ua);
  var uaMajor = m ? m[1] : null;
  // a reduced UA ("158.0.0.0") must not be reported as a full version
  var FULL = (uaMajor && CHROME_FULL.indexOf(uaMajor + '.') !== 0) ? uaMajor + '.0.0.0' : CHROME_FULL;
  var MAJOR = FULL.split('.')[0];
  var isWin = /Windows NT/.test(ua);

  /* 1. navigator.platform / navigator.webdriver ------------------------- */
  if (isWin) define(Navigator.prototype, 'platform', 'Win32');
  define(Navigator.prototype, 'webdriver', false);

  /* 2. navigator.userAgentData (Client Hints, JS side) ------------------- */
  if (isWin) {
    var brands = [
      { brand: 'Chromium', version: MAJOR },
      { brand: 'Google Chrome', version: MAJOR },
      { brand: ';Not A Brand', version: '99' }
    ];
    var uaData = {
      brands: brands,
      mobile: false,
      platform: 'Windows',
      getHighEntropyValues: function () {
        return Promise.resolve({
          architecture: 'x86',
          bitness: '64',
          brands: brands,
          fullVersionList: [
            { brand: 'Chromium', version: FULL },
            { brand: 'Google Chrome', version: FULL },
            { brand: ';Not A Brand', version: '99.0.0.0' }
          ],
          mobile: false,
          model: '',
          platform: 'Windows',
          platformVersion: '10.0.0',
          uaFullVersion: FULL,
          wow64: false
        });
      },
      toJSON: function () { return { brands: brands, mobile: false, platform: 'Windows' }; }
    };
    define(Navigator.prototype, 'userAgentData', uaData);
  }

  /* 3. window.chrome.runtime: real Chrome has it, headless Chromium may not */
  try {
    if (window.chrome && !window.chrome.runtime) {
      window.chrome.runtime = {
        id: undefined,
        connect: function () {},
        sendMessage: function () {},
        onMessage: { addListener: function () {}, removeListener: function () {} }
      };
    }
  } catch (e) {}

  /* 4. WebGL: headless reports "SwiftShader", i.e. "a Linux VM" ---------- */
  var FAKE_VENDOR = 'Google Inc. (NVIDIA)';
  var FAKE_RENDERER = 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1050 Ti Direct3D11 vs_5_0 ps_5_0, D3D11-27.21.14.5671)';
  var patchGL = function (Ctx) {
    if (!Ctx || !Ctx.prototype) return;
    var orig = Ctx.prototype.getParameter;
    Ctx.prototype.getParameter = function (p) {
      if (p === 37445) return FAKE_VENDOR;    // UNMASKED_VENDOR_WEBGL
      if (p === 37446) return FAKE_RENDERER;  // UNMASKED_RENDERER_WEBGL
      return orig.apply(this, arguments);
    };
  };
  patchGL(window.WebGLRenderingContext);
  patchGL(window.WebGL2RenderingContext);

  /* 5. Permissions: headless answers "denied" for notifications ---------- */
  try {
    var q = Permissions.prototype.query;
    Permissions.prototype.query = function (p) {
      if (p && p.name === 'notifications') {
        return Promise.resolve({ state: Notification.permission, onchange: null });
      }
      return q.apply(this, arguments);
    };
  } catch (e) {}

  /* 6. Screen: headless claims an 800x600 screen, smaller than its own window */
  try {
    var w = window.innerWidth || 1366;
    var h = window.innerHeight || 768;
    if (w <= 1920 && h <= 1040) {
      define(screen, 'width', 1920); define(screen, 'height', 1080);
      define(screen, 'availWidth', 1920); define(screen, 'availHeight', 1040);
    } else {
      define(screen, 'width', w); define(screen, 'height', h + 140);
      define(screen, 'availWidth', w); define(screen, 'availHeight', h + 100);
    }
    define(screen, 'colorDepth', 24);
    define(screen, 'pixelDepth', 24);
    define(window, 'outerWidth', w);
    define(window, 'outerHeight', h + 90);
  } catch (e) {}
})();
