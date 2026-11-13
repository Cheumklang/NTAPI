/**
 * Offline check for src/renderer/markdown.js — no Electron, no network, no credits.
 * Run: node scripts/selftest-markdown.js
 */
'use strict';

require('../src/renderer/markdown.js');
const md = globalThis.FPMarkdown;

let failures = 0;
function check(name, condition, detail) {
  if (condition) {
    console.log(`ok   ${name}`);
    return;
  }
  failures += 1;
  console.log(`FAIL ${name}${detail ? `\n     ${detail}` : ''}`);
}

const render = (text, streaming) => md.parse(text, streaming);

// 1. headings, bold, italic, inline code
{
  const r = render('## Result\n\nThis is **bold** and *it* with `code` inside.');
  check('heading level 3', r.html.includes('<h3>Result</h3>'), r.html);
  check('bold', r.html.includes('<strong>bold</strong>'), r.html);
  check('italic', r.html.includes('<em>it</em>'), r.html);
  check('inline code', r.html.includes('<code class="md-code-inline">code</code>'), r.html);
}

// 2. escaping / XSS
{
  const r = render('<img src=x onerror="alert(1)"> and <script>bad()</script>');
  check('no raw img tag', !r.html.includes('<img'), r.html);
  check('no raw script tag', !r.html.includes('<script'), r.html);
  check('escaped onerror', r.html.includes('&lt;img'), r.html);
}

// 3. fenced code block, language badge and highlighting
{
  const r = render('```js\nconst x = "hi"; // note\nfunction f(a) { return a + 1 }\n```');
  const codeBlocks = r.blocks.filter((b) => b.type === 'code');
  check('one code block', codeBlocks.length === 1, JSON.stringify(r.blocks));
  check('language kept', codeBlocks[0].lang === 'js', codeBlocks[0].lang);
  check('code text exact', codeBlocks[0].code === 'const x = "hi"; // note\nfunction f(a) { return a + 1 }', codeBlocks[0].code);
  const hl = md.highlight(codeBlocks[0].code, 'js');
  check('keyword highlighted', hl.includes('hl-kw'), hl);
  check('string highlighted', hl.includes('hl-str'), hl);
  check('comment highlighted', hl.includes('hl-com'), hl);
}

// 4. streaming: an unclosed fence is code, not raw backticks
{
  const r = render('Here you go:\n```py\nprint("hi")\n', true);
  const codeBlocks = r.blocks.filter((b) => b.type === 'code');
  check('open fence rendered as code', codeBlocks.length === 1, JSON.stringify(r.blocks));
  check('open fence flagged open', codeBlocks[0].open === true, JSON.stringify(codeBlocks[0]));
  check('open fence keeps body', codeBlocks[0].code.includes('print("hi")'), codeBlocks[0].code);
  const done = render('Here you go:\n```py\nprint("hi")\n', false);
  check('closed-only mode drops dangling fence text', done.blocks.every((b) => b.type !== 'code' || !b.open));
}

// 5. lists
{
  const r = render('- one\n- two\n  - nested\n1. first\n2. second');
  check('unordered list', r.html.includes('<ul><li>one</li><li>two</li></ul>') || r.html.includes('<li>one</li>'), r.html);
  check('nested list', r.html.includes('<ul><li>nested</li></ul>'), r.html);
  check('ordered list with start', r.html.includes('<ol><li>first</li><li>second</li></ol>'), r.html);
}

// 6. table
{
  const r = render('| Tool | Status |\n| --- | ---: |\n| read | ok |\n| bash | failed |');
  check('table wrapper', r.html.includes('md-table-wrap'), r.html);
  check('table header cells', r.html.includes('<th>Tool</th>'), r.html);
  check('table body cells', r.html.includes('>failed</td>'), r.html);
  check('right alignment', r.html.includes('text-align:right'), r.html);
}

// 7. blockquote, hr, links
{
  const r = render('> quoted **line**\n\n---\n\nSee [docs](https://pi.dev/docs) and https://example.com/x');
  check('blockquote', r.html.includes('<blockquote>') && r.html.includes('<strong>line</strong>'), r.html);
  check('hr', r.html.includes('<hr>'), r.html);
  check('markdown link', r.html.includes('href="https://pi.dev/docs"'), r.html);
  check('bare url link', r.html.includes('href="https://example.com/x"'), r.html);
}

// 8. diff block
{
  const r = render('```diff\n-old line\n+new line\n@@ -1 +1 @@\n```');
  const hl = md.highlight(r.blocks[0].code, 'diff');
  check('diff add line', hl.includes('hl-diff-add'), hl);
  check('diff del line', hl.includes('hl-diff-del'), hl);
  check('diff hunk line', hl.includes('hl-diff-hunk'), hl);
}

// 9. plain text extraction (session titles)
{
  check(
    'plain text strips markers',
    md.toPlainText('## Hi\n\n**Build** a `thing`') === 'Hi Build a thing',
    JSON.stringify(md.toPlainText('## Hi\n\n**Build** a `thing`'))
  );
}

// 10. renderInto bookkeeping (DOM-free stub)
{
  const el = {
    __html: '',
    set innerHTML(v) {
      this.__html = v;
    },
    get innerHTML() {
      return this.__html;
    },
    querySelectorAll() {
      return [];
    },
  };
  md.renderInto(el, '# Title\n\n```js\nconst a = 1\n```');
  check('renderInto writes html', el.innerHTML.includes('<h2>Title</h2>'), el.innerHTML);
  check('renderInto builds copy button', el.innerHTML.includes('data-copy-block'), el.innerHTML);
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall markdown checks passed');
process.exit(failures ? 1 : 0);
