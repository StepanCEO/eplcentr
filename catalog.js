/* Каталог из data/products.json: страница каталога и блок «Популярные товары» на главной.
   Файл с товарами обновляет tools/update_catalog.py (раз в сутки). */
(function () {
  'use strict';

  var DATA_URL = 'data/products.json';
  var PHONE = '+79188888077';
  var PAGE_SIZE = 24;
  // подсказки к коротким подписям вариантов
  var HINTS = {
    'SIM+eSIM': 'Слот для SIM-карты и eSIM',
    'eSIM': 'Только eSIM, без слота для SIM-карты'
  };

  var priceFormat = new Intl.NumberFormat('ru-RU');
  var dateFormat = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow'
  });

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function icon(id) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    var use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#' + id);
    svg.appendChild(use);
    svg.setAttribute('aria-hidden', 'true');
    return svg;
  }

  function formatPrice(value) {
    return priceFormat.format(value) + ' ₽';
  }

  var loading = null;
  function load() {
    if (!loading) {
      loading = fetch(DATA_URL, { cache: 'no-cache' }).then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      });
    }
    return loading;
  }

  function minPrice(product) {
    var prices = product.variants.filter(function (v) { return v.available && v.price; })
      .map(function (v) { return v.price; });
    return prices.length ? Math.min.apply(null, prices) : null;
  }

  // «mac:macbook-air|mac» — сначала подраздел macbook-air, если там пусто — весь раздел mac
  function pickProducts(data, key) {
    var options = key.split('|');
    for (var i = 0; i < options.length; i++) {
      var parts = options[i].split(':');
      var list = data.products.filter(function (p) {
        return p.available && p.image && p.category === parts[0] && (!parts[1] || p.subcategory === parts[1]);
      });
      if (list.length) return list;
    }
    return [];
  }

  /* ----- Главная: плитки разделов, слайды и баннер берут фото и цены из каталога ----- */
  function initHome() {
    var images = document.querySelectorAll('[data-home-img]');
    var prices = document.querySelectorAll('[data-home-price]');
    if (!images.length && !prices.length) return;
    load().then(function (data) {
      Array.prototype.forEach.call(images, function (img) {
        var list = pickProducts(data, img.getAttribute('data-home-img'));
        if (!list.length) return;
        img.decoding = 'async';
        img.referrerPolicy = 'no-referrer';
        img.src = list[0].image;
        if (!img.alt) img.alt = '';
        img.classList.add('is-loaded');
      });
      Array.prototype.forEach.call(prices, function (node) {
        var list = pickProducts(data, node.getAttribute('data-home-price'));
        var values = list.map(minPrice).filter(Boolean);
        if (!values.length) return;
        node.textContent = 'от ' + formatPrice(Math.min.apply(null, values)) + ' · в наличии в Пятигорске';
      });
    }).catch(function () { /* без данных остаются нейтральные подписи */ });
  }

  /* ----- Карточка товара ----- */
  var suppressEnter = false;  // во время плавной смены карточек своя анимация появления не нужна

  // Имена для view transitions даём карточкам только на время смены фильтра:
  // одинаковые товары плавно переезжают на новые места, а переходам между страницами имена не мешают.
  function nameCard(card, on) {
    card.style.viewTransitionName = on ? 'p-' + String(card.getAttribute('data-id')).replace(/[^a-zA-Z0-9_-]/g, '') : '';
    if (on) card.style.setProperty('view-transition-class', 'card');
    else card.style.removeProperty('view-transition-class');
  }

  function renderCard(product, index) {
    var card = el('article', 'product product--live' + (suppressEnter ? ' no-enter' : ''));
    card.style.setProperty('--i', String(index % PAGE_SIZE));
    card.setAttribute('data-id', product.id);
    if (suppressEnter) nameCard(card, true);

    if (product.badge) card.appendChild(el('span', 'badge badge--new', product.badge));

    var media = el('div', 'product__media');
    if (product.image) {
      var img = el('img', 'product__img');
      img.src = product.image;
      img.alt = product.name;
      img.loading = 'lazy';
      img.decoding = 'async';
      img.referrerPolicy = 'no-referrer';
      img.addEventListener('error', function () { media.classList.add('is-broken'); img.remove(); });
      media.appendChild(img);
    }
    card.appendChild(media);

    card.appendChild(el('h3', 'product__name', product.name));

    var variants = product.variants;
    var current = variants.filter(function (v) { return v.available; })[0] || variants[0];

    var stock = el('p', 'stock');
    var foot = el('div', 'product__foot');
    var price = el('span', 'price');
    var order = el('a', 'go');
    order.href = 'tel:' + PHONE;
    order.setAttribute('aria-label', 'Заказать по телефону: ' + product.name);
    order.appendChild(icon('i-arrow'));
    foot.appendChild(price);
    foot.appendChild(order);

    var switcher = null;
    if (variants.length > 1) {
      switcher = el('div', 'variant-switch');
      switcher.setAttribute('role', 'group');
      switcher.setAttribute('aria-label', 'Вариант');
      variants.forEach(function (variant) {
        var button = el('button', null, variant.label);
        button.type = 'button';
        if (HINTS[variant.label]) button.title = HINTS[variant.label];
        button.addEventListener('click', function () { current = variant; update(); });
        variant._button = button;
        switcher.appendChild(button);
      });
      card.appendChild(switcher);
    }
    card.appendChild(stock);
    card.appendChild(foot);

    function update() {
      price.textContent = current.price ? formatPrice(current.price) : 'Цена по запросу';
      price.classList.toggle('price--ask', !current.price);
      stock.textContent = current.available ? 'В наличии' : 'Нет в наличии';
      stock.classList.toggle('stock--out', !current.available);
      card.classList.toggle('is-out', !current.available);
      if (switcher) {
        variants.forEach(function (variant) {
          variant._button.setAttribute('aria-pressed', variant === current ? 'true' : 'false');
        });
      }
    }
    update();
    return card;
  }

  function skeletons(container, count) {
    container.textContent = '';
    for (var i = 0; i < count; i++) {
      var card = el('div', 'product product--skeleton');
      card.setAttribute('aria-hidden', 'true');
      card.appendChild(el('div', 'product__media'));
      card.appendChild(el('div', 'skeleton-line'));
      card.appendChild(el('div', 'skeleton-line skeleton-line--short'));
      container.appendChild(card);
    }
  }

  /* ----- Главная: «Популярные товары» ----- */
  function initPopular(root) {
    var grid = root.querySelector('[data-popular-grid]');
    // по одному товару из разделов, первый в наличии в порядке поставщика (новинки идут первыми)
    var slots = [
      { category: 'iphone', subcategory: 'iphone-18-pro' },
      { category: 'airpods' },
      { category: 'iwatch' },
      { category: 'mac', subcategory: 'macbook-air' }
    ];
    skeletons(grid, 4);
    load().then(function (data) {
      grid.textContent = '';
      var used = {};
      slots.forEach(function (slot) {
        var pick = null;
        data.products.some(function (p) {
          if (p.category !== slot.category || used[p.id] || !p.available) return false;
          if (slot.subcategory && p.subcategory !== slot.subcategory) return false;
          pick = p;
          return true;
        });
        if (!pick) {
          data.products.some(function (p) {
            if (p.category === slot.category && p.available && !used[p.id]) { pick = p; return true; }
            return false;
          });
        }
        if (pick) {
          used[pick.id] = true;
          grid.appendChild(renderCard(pick, grid.children.length));
        }
      });
      if (!grid.children.length) root.hidden = true;
    }).catch(function () {
      root.hidden = true;
    });
  }

  /* ----- Страница каталога ----- */
  function initCatalog(root) {
    var catsBox = root.querySelector('[data-cats]');
    var subsBox = root.querySelector('[data-subs]');
    var grid = root.querySelector('[data-grid]');
    var more = root.querySelector('[data-more]');
    var empty = root.querySelector('[data-empty]');
    var count = root.querySelector('[data-count]');
    var search = root.querySelector('[data-search]');
    var inStock = root.querySelector('[data-instock]');
    var updated = document.querySelector('[data-updated]');

    var data = null;
    var state = { category: null, subcategory: '', query: '', inStock: true, shown: PAGE_SIZE };

    skeletons(grid, 8);

    function readHash() {
      var parts = decodeURIComponent(window.location.hash.replace(/^#/, '')).split('/');
      var known = data.categories.some(function (c) { return c.slug === parts[0]; });
      state.category = known ? parts[0] : data.categories[0].slug;
      state.subcategory = known && parts[1] ? parts[1] : '';
    }

    function writeHash() {
      var hash = '#' + state.category + (state.subcategory ? '/' + state.subcategory : '');
      if (window.location.hash !== hash) history.replaceState(null, '', hash);
    }

    function chip(label, active, onClick, small, countValue) {
      var button = el('button', 'chip' + (small ? ' chip--sm' : '') + (active ? ' is-active' : ''));
      button.type = 'button';
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
      button.appendChild(document.createTextNode(label));
      if (countValue != null) button.appendChild(el('span', 'chip__count', String(countValue)));
      button.addEventListener('click', onClick);
      return button;
    }

    function renderChips() {
      catsBox.textContent = '';
      data.categories.forEach(function (c) {
        // пустые разделы не показываем (выбранный — оставляем, чтобы было понятно, где находишься)
        var visibleCount = state.inStock ? c.available : c.count;
        if (!visibleCount && c.slug !== state.category) return;
        catsBox.appendChild(chip(c.title, !state.query && c.slug === state.category, function () {
          state.category = c.slug;
          state.subcategory = '';
          state.query = '';
          search.value = '';
          state.shown = PAGE_SIZE;
          writeHash();
          transitionRender();
        }, false, state.inStock ? c.available : c.count));
      });

      subsBox.textContent = '';
      var category = data.categories.filter(function (c) { return c.slug === state.category; })[0];
      var subs = category ? category.subcategories : [];
      subsBox.hidden = !!state.query || subs.length < 2;
      if (subsBox.hidden) return;
      subsBox.appendChild(chip('Все модели', !state.subcategory, function () {
        state.subcategory = '';
        state.shown = PAGE_SIZE;
        writeHash();
        transitionRender();
      }, true));
      subs.forEach(function (s) {
        subsBox.appendChild(chip(s.title, s.slug === state.subcategory, function () {
          state.subcategory = s.slug;
          state.shown = PAGE_SIZE;
          writeHash();
          transitionRender();
        }, true));
      });
    }

    function filtered() {
      var words = state.query.toLowerCase().split(/\s+/).filter(Boolean);
      var list = data.products.filter(function (p) {
        if (state.inStock && !p.available) return false;
        if (words.length) {
          var name = p.name.toLowerCase();
          return words.every(function (w) { return name.indexOf(w) !== -1; });
        }
        if (p.category !== state.category) return false;
        return !state.subcategory || p.subcategory === state.subcategory;
      });
      // товары в наличии — первыми, внутри группы сохраняем порядок поставщика
      return list.map(function (p, i) { return [p, i]; }).sort(function (a, b) {
        return (b[0].available - a[0].available) || (a[1] - b[1]);
      }).map(function (pair) { return pair[0]; });
    }

    function plural(n, one, few, many) {
      var mod10 = n % 10, mod100 = n % 100;
      if (mod10 === 1 && mod100 !== 11) return one;
      if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
      return many;
    }

    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Смена раздела, модели, поиска или «в наличии»: старые карточки гаснут, общие переезжают, новые выезжают
    function transitionRender() {
      if (!document.startViewTransition || reduceMotion || !grid.children.length) {
        render();
        return;
      }
      var root = document.documentElement;
      root.classList.add('vt-filter');
      Array.prototype.forEach.call(grid.children, function (card) { nameCard(card, true); });
      var transition = document.startViewTransition(function () {
        suppressEnter = true;
        render();
        suppressEnter = false;
      });
      var cleanup = function () {
        root.classList.remove('vt-filter');
        Array.prototype.forEach.call(grid.children, function (card) { nameCard(card, false); });
      };
      transition.finished.then(cleanup, cleanup);
    }

    function render() {
      renderChips();
      var list = filtered();
      grid.textContent = '';
      list.slice(0, state.shown).forEach(function (p, i) { grid.appendChild(renderCard(p, i)); });
      var left = list.length - state.shown;
      more.hidden = left <= 0;
      if (left > 0) more.textContent = 'Показать ещё ' + Math.min(left, PAGE_SIZE) + ' из ' + left;
      empty.hidden = list.length > 0;
      count.textContent = list.length + ' ' + plural(list.length, 'товар', 'товара', 'товаров');
      root.setAttribute('aria-busy', 'false');
    }

    more.addEventListener('click', function () {
      var start = state.shown;
      state.shown += PAGE_SIZE;
      var list = filtered();
      list.slice(start, state.shown).forEach(function (p, i) { grid.appendChild(renderCard(p, i)); });
      var left = list.length - state.shown;
      more.hidden = left <= 0;
      if (left > 0) more.textContent = 'Показать ещё ' + Math.min(left, PAGE_SIZE) + ' из ' + left;
    });

    var searchTimer = null;
    search.addEventListener('input', function () {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () {
        state.query = search.value.trim();
        state.shown = PAGE_SIZE;
        transitionRender();
      }, 180);
    });

    inStock.addEventListener('change', function () {
      state.inStock = inStock.checked;
      state.shown = PAGE_SIZE;
      transitionRender();
    });

    window.addEventListener('hashchange', function () {
      if (!data) return;
      readHash();
      state.query = '';
      search.value = '';
      state.shown = PAGE_SIZE;
      transitionRender();
    });

    if (/[?&](search|q)(=|&|$)/.test(window.location.search)) {
      var q = new URLSearchParams(window.location.search).get('q');
      if (q) { search.value = q; state.query = q.trim(); }
      setTimeout(function () { search.focus(); }, 300);
    }

    load().then(function (json) {
      data = json;
      if (updated && data.updatedAt) {
        updated.textContent = 'Обновлено ' + dateFormat.format(new Date(data.updatedAt)) + '.';
      }
      readHash();
      render();
    }).catch(function () {
      grid.textContent = '';
      empty.hidden = false;
      empty.textContent = 'Не удалось загрузить каталог. Позвоните нам — подскажем цену и наличие.';
      root.setAttribute('aria-busy', 'false');
    });
  }

  var catalogRoot = document.querySelector('[data-catalog]');
  if (catalogRoot) initCatalog(catalogRoot);
  var popularRoot = document.querySelector('[data-popular]');
  if (popularRoot) initPopular(popularRoot);
  initHome();
})();
