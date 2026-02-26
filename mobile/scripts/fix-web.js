// Post-export: inject dark background + PWA meta into index.html
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'dist', 'index.html');
let html = fs.readFileSync(file, 'utf8');

// Dark background on body
html = html.replace(
  'body {\n        overflow: hidden;\n      }',
  'body {\n        overflow: hidden;\n        background-color: #09090F;\n      }'
);

// Add PWA meta tags
const pwaMeta = `
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <meta name="mobile-web-app-capable" content="yes">
    <link rel="manifest" href="/manifest.json">
    <style>
      #root { background-color: #09090F; min-height: 100vh; }
    </style>`;

html = html.replace('</head>', pwaMeta + '\n  </head>');

fs.writeFileSync(file, html);

// Copy manifest to dist
const manifest = path.join(__dirname, '..', 'web', 'manifest.json');
if (fs.existsSync(manifest)) {
  fs.copyFileSync(manifest, path.join(__dirname, '..', 'dist', 'manifest.json'));
}

console.log('Web fixes applied');
