/* Exercise CRA's actual SVG + file-loader contract after SVGR upgrades. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
process.env.NODE_ENV = 'production';
const root = path.resolve(__dirname, '..');
process.chdir(root);
const webpack = require('webpack');
const config = require('react-scripts/config/webpack.config')('production');
const svgRule = config.module.rules.flatMap(rule => rule.oneOf || []).find(rule => rule.test instanceof RegExp && rule.test.test('fixture.svg'));
assert(svgRule, 'CRA SVG loader rule must exist');
const dir = fs.mkdtempSync(path.join(root, '.svg-compat-'));
async function main() {
  try {
    fs.writeFileSync(path.join(dir, 'fixture.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M1 2h3v4H1z"/></svg>');
    fs.writeFileSync(path.join(dir, 'entry.js'), "export {default as url, ReactComponent as Icon} from './fixture.svg';");
    const compiler = webpack({mode:'production', target:'node', entry:path.join(dir,'entry.js'), output:{path:path.join(dir,'out'),filename:'bundle.cjs',library:{type:'commonjs2'},publicPath:'/assets/'}, module:{rules:[svgRule]}, externals:{react:'commonjs react'}, optimization:{minimize:false}});
    await new Promise((resolve,reject) => compiler.run((error,stats) => compiler.close(closeError => error || closeError || stats?.hasErrors() ? reject(error || closeError || new Error(stats.toString({all:false,errors:true}))) : resolve())));
    const {url, Icon} = require(path.join(dir,'out/bundle.cjs'));
    assert.match(url, /^\/assets\/static\/media\/fixture\.[a-z0-9]+\.svg$/i);
    const React = require('react');
    const html = require('react-dom/server').renderToStaticMarkup(React.createElement(Icon,{title:'Game icon',titleId:'game-icon-title','aria-label':'Game',className:'game-icon'}));
    assert.match(html,/viewBox="0 0 24 24"/);
    assert.match(html,/<title id="game-icon-title">Game icon<\/title>/);
    assert.match(html,/class="game-icon"/);
    assert.match(html,/aria-label="Game"/);
    assert.match(html,/fill="currentColor"/);
    assert.equal(Icon.$$typeof, Symbol.for('react.forward_ref'));
    console.log('PASS SVG URL export, ReactComponent, viewBox, accessible title, props, currentColor and forwarded ref');
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
