// Deployment config.
//  - Normal server hosting: leave as is (the page talks to /api/... on the same server).
//  - Static hosting (GitHub Pages etc.): the build script overwrites this file with { STATIC: true, DATA_BASE: 'data/' }.
//  - Frontend on one host, Node API on another: set API_BASE to the API address, e.g. 'https://my-api.example.com'
window.BD_CONFIG = { API_BASE: '' };
