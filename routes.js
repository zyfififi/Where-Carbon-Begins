(function (global) {
  'use strict';
  function create({ onNavigate }) {
    const sections = Array.from(document.querySelectorAll('main > section[id]'));
    const links = Array.from(document.querySelectorAll('.chapters a'));
    const positions = new Map();
    const toggle = document.querySelector('.nav-toggle');
    const scrim = document.querySelector('.nav-scrim');
    const sidebar = document.querySelector('.side-nav');
    const narrow = global.matchMedia('(max-width:760px)');
    function updateSidebarAccess() { sidebar.inert = narrow.matches && !document.body.classList.contains('nav-open'); }
    narrow.addEventListener('change', updateSidebarAccess);
    let active = null;
    function closeMenu() {
      document.body.classList.remove('nav-open');
      toggle.setAttribute('aria-expanded', 'false');
      scrim.hidden = true;
      updateSidebarAccess();
    }
    function locationTarget() {
      let id;
      try { id = decodeURIComponent(location.hash.slice(1)); } catch (_) { id = 'cover'; }
      const target = document.getElementById(id || 'cover');
      const section = target?.matches('main > section') ? target : target?.closest('main > section');
      return { target: section ? target : document.getElementById('cover'), section: section || sections[0] };
    }
    function activate({ focus = false } = {}) {
      const { target, section } = locationTarget();
      if (active) positions.set(active, global.scrollY);
      const changed = active !== section.id;
      active = section.id;
      sections.forEach(page => {
        const selected = page === section;
        page.hidden = !selected;
        page.setAttribute('aria-hidden', String(!selected));
      });
      links.forEach(link => {
        const selected = link.hash === '#' + active;
        link.classList.toggle('active', selected);
        if (selected) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      });
      document.body.dataset.page = active;
      const title = links.find(link => link.hash === '#' + active)?.querySelector('div')?.childNodes[0]?.textContent || '碳从哪里来';
      document.title = `${title} · 碳从哪里来`;
      closeMenu();
      // In-page jumps do not change data. Rebuilding every chart here would
      // restart animations and delay the very anchor the reader just chose.
      if (changed) onNavigate(active);
      requestAnimationFrame(() => {
        const pageNav = section.querySelector('.reading-nav');
        const headerOffset = document.querySelector('.site-header').getBoundingClientRect().height + (pageNav?.getBoundingClientRect().height || 0) + 28;
        const destination = target === section ? positions.get(active) || 0 : target.getBoundingClientRect().top + global.scrollY - headerOffset;
        // Use the numeric overload for broad file:// and browser compatibility;
        // a smooth scroll would make the active-zone marker race the click.
        global.scrollTo(0, Math.max(0, destination));
        global.dispatchEvent(new Event('readingupdate'));
        // Chromium may apply a hash scroll after this frame; sample once more after layout settles.
        global.setTimeout(() => global.dispatchEvent(new Event('readingupdate')), 40);
        if (focus && changed) {
          const heading = section.querySelector('h1,h2');
          heading?.setAttribute('tabindex', '-1');
          heading?.focus({ preventScroll: true });
        }
      });
    }
    function go(id) {
      if (!document.getElementById(id)) return;
      if (location.hash === '#' + id) activate({ focus: true });
      else { history.pushState(null, '', '#' + id); activate({ focus: true }); }
    }
    document.addEventListener('click', event => {
      const anchor = event.target.closest('a[href^="#"]');
      if (!anchor || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const id = anchor.getAttribute('href').slice(1);
      if (!document.getElementById(id)) return;
      event.preventDefault(); go(id);
    });
    toggle.addEventListener('click', () => {
      const open = document.body.classList.toggle('nav-open');
      toggle.setAttribute('aria-expanded', String(open)); scrim.hidden = !open;
      updateSidebarAccess();
      if (open) sidebar.querySelector('[aria-current="page"]')?.focus();
    });
    scrim.addEventListener('click', closeMenu);
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && document.body.classList.contains('nav-open')) { closeMenu(); toggle.focus(); } });
    global.addEventListener('hashchange', () => activate());
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    activate();
    return { go };
  }
  global.CarbonRoutes = { create };
})(window);
