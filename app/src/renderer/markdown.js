/**
 * Mini Markdown renderer for FreePi Desktop.
 *
 * Deliberately dependency-free and CSP-safe: the file is loaded as a plain
 * classic script, never injects inline handlers, and escapes every character it
 * did not produce itself. It is also loadable from Node so the renderer logic
 * can be tested without Electron (see scripts/selftest-markdown.js).
 *
 * Supported: fenced code (with a language badge, syntax highlighting and a copy
 * button), headings, ordered/unordered lists (one nesting level), tables,
 * blockquotes, horizontal rules, inline code, bold, italic, strikethrough and
 * links. Partial fences are rendered as code while a reply is still streaming,
 * so the user never sees raw backticks flicker.
 */
(function (root) {
  'use strict';

  const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESCAPES[c]);

  /* ------------------------------ highlight ------------------------------ */

  const KEYWORDS = new Set(
    (
      'const let var function return if else for while class new await async import from export default ' +
      'extends super this typeof instanceof try catch finally throw switch case break continue do ' +
      'interface type enum implements public private protected readonly static abstract declare ' +
      'def elif lambda with as in not and or is pass raise yield global nonlocal assert del print ' +
      'fn pub mut struct impl match use mod crate where let ref dyn trait unsafe loop move ' +
      'fun val object when package namespace void null nil true false undefined NaN None True False ' +
      'echo fi done then esac local export unset eval exec set source elif ' +
      'select insert update delete create table index into values join left right inner outer on group ' +
      'order by limit offset having distinct union all alter drop where and or not exists ' +
      'string number boolean any unknown never keyof infer satisfies'
    ).split(/\s+/)
  );

  const C_COMMENT = /\/(?:[/*][\s\S]*?)?/; // handled through family patterns below

  const FAMILIES = {
    hash: new Set(['py', 'python', 'sh', 'bash', 'zsh', 'shell', 'yaml', 'yml', 'toml', 'ini', 'ps', 'powershell', 'rb', 'ruby', 'dockerfile', 'makefile', 'perl', 'r']),
    dash: new Set(['sql', 'lua', 'haskell']),
    markup: new Set(['html', 'xml', 'svg', 'vue', 'svelte']),
    css: new Set(['css', 'scss', 'less']),
    diff: new Set(['diff', 'patch']),
  };

  const STRING_RE = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/;
  const NUMBER_RE = /\b(?:0[xX][0-9a-fA-F]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b/;
  const WORD_RE = /[A-Za-z_$][\w$]*/;

  function escapeCodeLine(line) {
    return esc(line);
  }

  /** Tokenise one line of code. Returns highlighted HTML for that line. */
  function highlightLine(line, lang, family) {
    let out = '';
    let i = 0;
    const lineComment =
      family === 'markup'
        ? null
        : family === 'hash'
        ? /#(?!include\b)[^\n]*/
        : family === 'dash'
        ? /--[^\n]*/
        : /\/\/[^\n]*/;

    while (i < line.length) {
      const rest = line.slice(i);

      // Block comment continuation is rare in chat output; treat /* ... */ inline.
      if (family !== 'markup' && rest.startsWith('/*')) {
        const end = rest.indexOf('*/');
        const chunk = end === -1 ? rest : rest.slice(0, end + 2);
        out += `<span class="hl-com">${esc(chunk)}</span>`;
        i += chunk.length;
        continue;
      }
      if (lineComment) {
        const m = lineComment.exec(rest);
        if (m && m.index === 0) {
          out += `<span class="hl-com">${esc(m[0])}</span>`;
          i += m[0].length;
          continue;
        }
      }
      if (family === 'markup' && rest.startsWith('<!--')) {
        const end = rest.indexOf('-->');
        const chunk = end === -1 ? rest : rest.slice(0, end + 3);
        out += `<span class="hl-com">${esc(chunk)}</span>`;
        i += chunk.length;
        continue;
      }
      // strings
      const sm = STRING_RE.exec(rest);
      if (sm && sm.index === 0) {
        out += `<span class="hl-str">${esc(sm[0])}</span>`;
        i += sm[0].length;
        continue;
      }
      // numbers
      const nm = NUMBER_RE.exec(rest);
      if (nm && nm.index === 0) {
        out += `<span class="hl-num">${esc(nm[0])}</span>`;
        i += nm[0].length;
        continue;
      }
      // words: keyword, function call, plain
      const wm = WORD_RE.exec(rest);
      if (wm && wm.index === 0) {
        const word = wm[0];
        const after = rest.slice(word.length);
        if (KEYWORDS.has(word)) out += `<span class="hl-kw">${esc(word)}</span>`;
        else if (/^\s*\(/.test(after)) out += `<span class="hl-fn">${esc(word)}</span>`;
        else if (family === 'markup' && /^[^<]*>/.test(after)) out += `<span class="hl-tag">${esc(word)}</span>`;
        else out += escapeCodeLine(word);
        i += word.length;
        continue;
      }
      // punctuation / whitespace
      out += esc(line[i]);
      i += 1;
    }
    return out;
  }

  function familyOf(lang) {
    const key = String(lang || '').toLowerCase();
    for (const [name, set] of Object.entries(FAMILIES)) if (set.has(key)) return name;
    return 'c';
  }

  function highlight(code, lang) {
    const family = familyOf(lang);
    const lines = String(code).replace(/\n$/, '').split('\n');
    if (family === 'diff') {
      return lines
        .map((line) => {
          let cls = 'hl-diff-ctx';
          if (/^@@/.test(line)) cls = 'hl-diff-hunk';
          else if (/^\+/.test(line)) cls = 'hl-diff-add';
          else if (/^-/.test(line)) cls = 'hl-diff-del';
          else if (/^(diff|index|---|\+\+\+)/.test(line)) cls = 'hl-diff-meta';
          return `<span class="${cls}">${esc(line) || ' '}</span>`;
        })
        .join('\n');
    }
    return lines.map((line) => highlightLine(line, lang, family)).join('\n');
  }

  /* -------------------------------- inline -------------------------------- */

  function inline(raw) {
    const held = [];
    const hold = (html) => `\u0000${held.push(html) - 1}\u0000`;
    let s = esc(raw);

    // inline code first, so its content is never re-interpreted
    s = s.replace(/`([^`\n]+)`/g, (_m, code) => hold(`<code class="md-code-inline">${code}</code>`));

    // links and bare URLs
    s = s.replace(/\[([^\]\n]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)/g, (_m, text, url) =>
      hold(`<a href="${url}" class="md-link" rel="noreferrer">${text}</a>`)
    );
    s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)\]]+)/g, (_m, pre, url) =>
      `${pre}${hold(`<a href="${url}" class="md-link" rel="noreferrer">${url}</a>`)}`
    );

    s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__([^_\n]+)__/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*\w])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    s = s.replace(/(^|[^_\w])_([^_\n]+)_/g, '$1<em>$2</em>');
    s = s.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');

    // restore held fragments (they may nest their own markers)
    return s.replace(/\u0000(\d+)\u0000/g, (_m, i) => held[Number(i)] || '');
  }

  /* -------------------------------- blocks -------------------------------- */

  const RE_FENCE = /^(\s*)(`{3,}|~{3,})\s*([\w+#.-]*)\s*$/;
  const RE_HEADING = /^(#{1,6})\s+(.*)$/;
  const RE_HR = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
  const RE_UL = /^(\s*)[-*+]\s+(.*)$/;
  const RE_OL = /^(\s*)\d+[.)]\s+(.*)$/;
  const RE_QUOTE = /^\s*>\s?(.*)$/;
  const RE_TABLE_DIV = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

  function splitRow(line) {
    return line
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((c) => c.trim());
  }

  const RE_LIST_ITEM = /^([ \t]*)([-*+]|\d+[.)])\s+(.*)$/;

  function listBlock(lines, ordered, start) {
    const items = [];
    for (const line of lines) {
      const m = RE_LIST_ITEM.exec(line);
      if (!m) {
        // continuation of the previous item's text
        if (items.length) items[items.length - 1].text.push(line.trim());
        continue;
      }
      if (m[1].length === 0) {
        items.push({ text: [m[3]], sub: [], subOrdered: false });
      } else if (items.length) {
        const parent = items[items.length - 1];
        parent.sub.push(m[3]);
        parent.subOrdered = /\d/.test(m[2]);
      }
    }
    const tag = ordered ? 'ol' : 'ul';
    const startAttr = ordered && start !== 1 ? ` start="${start}"` : '';
    const body = items
      .map((it) => {
        const subTag = it.subOrdered ? 'ol' : 'ul';
        const sub = it.sub.length
          ? `<${subTag}>${it.sub.map((s) => `<li>${inline(s)}</li>`).join('')}</${subTag}>`
          : '';
        return `<li>${inline(it.text.join(' '))}${sub}</li>`;
      })
      .join('');
    return `<${tag}${startAttr}>${body}</${tag}>`;
  }

  function tableBlock(header, divider, rows) {
    const aligns = splitRow(divider).map((c) => {
      const left = c.startsWith(':');
      const right = c.endsWith(':');
      return left && right ? 'center' : right ? 'right' : left ? 'left' : '';
    });
    const th = splitRow(header)
      .map((c, i) => `<th${aligns[i] ? ` style="text-align:${aligns[i]}"` : ''}>${inline(c)}</th>`)
      .join('');
    const tr = rows
      .map((r) => {
        const cells = splitRow(r);
        return `<tr>${cells
          .map((c, i) => `<td${aligns[i] ? ` style="text-align:${aligns[i]}"` : ''}>${inline(c)}</td>`)
          .join('')}</tr>`;
      })
      .join('');
    return `<div class="md-table-wrap"><table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`;
  }

  /**
   * Parse the message into blocks. `streaming` keeps an unterminated fence as a
   * code block instead of dumping raw backticks into the transcript.
   */
  function parse(text, streaming) {
    const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
    const blocks = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      if (!line.trim()) {
        i += 1;
        continue;
      }

      const fence = RE_FENCE.exec(line);
      if (fence) {
        const marker = fence[2];
        const lang = fence[3] || '';
        const body = [];
        i += 1;
        let closed = false;
        while (i < lines.length) {
          const maybe = /^(\s*)(`{3,}|~{3,})\s*$/.exec(lines[i]);
          if (maybe && maybe[2][0] === marker[0] && maybe[2].length >= marker.length) {
            closed = true;
            i += 1;
            break;
          }
          body.push(lines[i]);
          i += 1;
        }
        blocks.push({ type: 'code', lang, code: body.join('\n'), open: !closed && Boolean(streaming) });
        continue;
      }

      const heading = RE_HEADING.exec(line);
      if (heading) {
        const level = Math.min(6, heading[1].length + 1); // h1 is reserved for the app
        blocks.push({ type: 'html', html: `<h${level}>${inline(heading[2])}</h${level}>` });
        i += 1;
        continue;
      }

      if (RE_HR.test(line)) {
        blocks.push({ type: 'html', html: '<hr>' });
        i += 1;
        continue;
      }

      if (RE_QUOTE.test(line)) {
        const quoted = [];
        while (i < lines.length && (RE_QUOTE.test(lines[i]) || (quoted.length && lines[i].trim()))) {
          const m = RE_QUOTE.exec(lines[i]);
          quoted.push(m ? m[1] : lines[i]);
          i += 1;
        }
        blocks.push({ type: 'html', html: `<blockquote>${parse(quoted.join('\n')).html}</blockquote>` });
        continue;
      }

      if (RE_UL.test(line) || RE_OL.test(line)) {
        const ordered = !RE_UL.test(line) && RE_OL.test(line);
        const group = [];
        while (i < lines.length && lines[i].trim()) {
          const l = lines[i];
          const sameKind = ordered ? RE_OL.test(l) && !RE_UL.test(l) : RE_UL.test(l);
          if (sameKind || /^[ \t]{2,}\S/.test(l)) {
            group.push(l);
            i += 1;
            continue;
          }
          break;
        }
        const first = ordered ? RE_OL.exec(group[0]) : null;
        blocks.push({ type: 'html', html: listBlock(group, ordered, first ? Number((first[0].match(/\d+/) || [1])[0]) : 1) });
        continue;
      }

      if (line.includes('|') && i + 1 < lines.length && RE_TABLE_DIV.test(lines[i + 1])) {
        const header = line;
        const divider = lines[i + 1];
        const rows = [];
        i += 2;
        while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
          rows.push(lines[i]);
          i += 1;
        }
        blocks.push({ type: 'html', html: tableBlock(header, divider, rows) });
        continue;
      }

      // paragraph: consume until a blank line or the start of another block
      const para = [];
      while (
        i < lines.length &&
        lines[i].trim() &&
        !RE_FENCE.test(lines[i]) &&
        !RE_HEADING.test(lines[i]) &&
        !RE_HR.test(lines[i]) &&
        !RE_QUOTE.test(lines[i]) &&
        !RE_UL.test(lines[i]) &&
        !RE_OL.test(lines[i])
      ) {
        para.push(lines[i]);
        i += 1;
      }
      blocks.push({ type: 'html', html: `<p>${inline(para.join('\n')).replace(/\n/g, '<br>')}</p>` });
    }

    return { html: blocks.map((b) => (b.type === 'html' ? b.html : '')).join(''), blocks };
  }

  /* ------------------------------- rendering ------------------------------ */

  /** Copy text to the clipboard, with a fallback for older Electron windows. */
  function copyText(text) {
    try {
      if (root.freepi?.copyText) return root.freepi.copyText(text);
    } catch {}
    try {
      return navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
      } catch {}
      ta.remove();
      return Promise.resolve();
    }
  }

  const rawByCodeEl = new WeakMap();

  function codeBlockHtml(block, index) {
    const lang = block.lang || '';
    const label = lang || 'text';
    return (
      `<div class="md-code${block.open ? ' md-code-open' : ''}" data-block="${index}">` +
      `<div class="md-code-head"><span class="md-lang">${esc(label)}</span>` +
      `<button class="md-copy" type="button" data-copy-block="${index}" title="Copy code">Copy</button></div>` +
      `<pre><code>${highlight(block.code, lang)}</code></pre></div>`
    );
  }

  /**
   * Render markdown into `el`. Only the parts that changed are rebuilt, so a
   * long streaming reply does not reset scroll position or copy buttons.
   */
  function renderInto(el, text, options) {
    const opts = options || {};
    // The stylesheet scopes every markdown rule under `.md`.
    if (el.classList && !el.classList.contains('md')) el.classList.add('md');
    const parsed = parse(text || '', Boolean(opts.streaming));
    const blocks = parsed.blocks;
    const codeBlocks = blocks.filter((b) => b.type === 'code');

    // Build the full HTML; the transcript is small enough for this to be cheap.
    const html = blocks
      .map((b) => (b.type === 'html' ? b.html : codeBlockHtml(b, codeBlocks.indexOf(b))))
      .join('');

    if (el.__fpHtml !== html) {
      el.innerHTML = html;
      el.__fpHtml = html;
    }

    // Wire copy buttons + remember raw code for each one.
    el.querySelectorAll('code').forEach((codeEl) => {
      const wrap = codeEl.closest('.md-code');
      if (!wrap) return;
      const idx = Number(wrap.dataset.block);
      if (Number.isFinite(idx) && codeBlocks[idx]) rawByCodeEl.set(codeEl, codeBlocks[idx].code);
    });
    el.querySelectorAll('[data-copy-block]').forEach((btn) => {
      if (btn.__fpWired) return;
      btn.__fpWired = true;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const wrap = btn.closest('.md-code');
        const codeEl = wrap?.querySelector('code');
        const raw = codeEl ? rawByCodeEl.get(codeEl) : '';
        copyText(raw || codeEl?.textContent || '');
        const label = btn.textContent;
        btn.textContent = opts.copiedLabel || 'Copied';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.textContent = label;
          btn.classList.remove('copied');
        }, 1200);
      });
    });
  }

  /** Strip markdown to plain text (used for session titles and tooltips). */
  function toPlainText(text) {
    return String(text || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`([^`]*)`/g, '$1')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[*_~#>|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  root.FPMarkdown = { renderInto, parse, highlight, inline, toPlainText, copyText, esc };
})(typeof window !== 'undefined' ? window : globalThis);
