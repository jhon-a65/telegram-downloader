/* Runtime for the generated i18n.js. Spanish source keys remain stable for the download adapters. */
((scope) => {
  'use strict';
  const catalog = scope.TGLocalEnglish;
  const valid = value => ['auto', 'en', 'es'].includes(value) ? value : 'auto';
  const resolve = (value, browserLanguage) => valid(value) === 'auto'
    ? (/^es(?:[-_]|$)/i.test(browserLanguage || '') ? 'es' : 'en') : value;
  const fill = (text, values = {}) => text.replace(/\{([a-zA-Z0-9_]+)\}/g, (all, name) => Object.hasOwn(values, name) ? String(values[name]) : all);
  const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = Object.entries(catalog).filter(([key]) => /\{\w+\}/.test(key) && !key.startsWith('{')).map(([key, english]) => {
    const names = []; let end = 0, source = '^';
    for (const match of key.matchAll(/\{(\w+)\}/g)) {
      source += escape(key.slice(end, match.index)) + '([\\s\\S]*?)';
      names.push(match[1]); end = match.index + match[0].length;
    }
    return {pattern: new RegExp(source + escape(key.slice(end)) + '$'), names, english};
  });
  function create(preference = 'auto', browserLanguage = 'en') {
    let selected = valid(preference), language = resolve(selected, browserLanguage);
    const bindings = [];
    function text(key, values) { return fill(language === 'en' && Object.hasOwn(catalog, key) ? catalog[key] : key, values); }
    function message(value, depth = 0) {
      const source = String(value || '');
      if (language !== 'en' || !source || source.length > 12000) return source;
      if (Object.hasOwn(catalog, source)) return catalog[source];
      for (const {pattern, names, english} of patterns) {
        const match = source.match(pattern); if (!match) continue;
        const values = {};
        names.forEach((name, index) => { values[name] = name === 'error' && depth < 3 ? message(match[index + 1], depth + 1) : match[index + 1]; });
        return fill(english, values);
      }
      return source;
    }
    function bind(root) {
      const walker = root.ownerDocument.createTreeWalker(root, 4);
      let node;
      while ((node = walker.nextNode())) {
        if (node.parentElement?.closest('[data-user-content],style,script')) continue;
        const key = node.nodeValue.trim();
        if (!Object.hasOwn(catalog, key)) continue;
        const leading = node.nodeValue.slice(0, node.nodeValue.indexOf(key));
        const trailing = node.nodeValue.slice(node.nodeValue.indexOf(key) + key.length);
        const target = node;
        bindings.push(() => { if (root.contains(target)) target.nodeValue = leading + text(key) + trailing; });
      }
      for (const element of root.querySelectorAll('[title],[aria-label],[placeholder]')) {
        for (const attribute of ['title', 'aria-label', 'placeholder']) {
          const key = element.getAttribute(attribute);
          if (key && Object.hasOwn(catalog, key)) bindings.push(() => { if (root.contains(element)) element.setAttribute(attribute, text(key)); });
        }
      }
      refresh();
    }
    function refresh() { for (const apply of bindings) apply(); }
    function set(value) { selected = valid(value); language = resolve(selected, browserLanguage); refresh(); return language; }
    return {text, message, bind, set, refresh, get language() { return language; }, get preference() { return selected; }};
  }
  scope.TGLocalI18n = Object.freeze({create, resolve, valid});
})(globalThis);
