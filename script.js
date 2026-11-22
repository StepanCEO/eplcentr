(function () {
  'use strict';

  /* ----- Слайдер первого экрана ----- */
  var hero = document.querySelector('.hero');
  var slides = Array.prototype.slice.call(document.querySelectorAll('.slide'));
  var dots = Array.prototype.slice.call(document.querySelectorAll('.dot'));
  var current = 0;
  var timer = null;
  var INTERVAL = 6000;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function show(index) {
    current = (index + slides.length) % slides.length;
    slides.forEach(function (slide, i) {
      var active = i === current;
      slide.classList.toggle('is-active', active);
      slide.setAttribute('aria-hidden', active ? 'false' : 'true');
      slide.querySelectorAll('a').forEach(function (link) {
        link.tabIndex = active ? 0 : -1;
      });
    });
    dots.forEach(function (dot, i) {
      var active = i === current;
      dot.classList.toggle('is-active', active);
      dot.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  function start() {
    stop();
    if (reduceMotion) return;
    timer = setInterval(function () { show(current + 1); }, INTERVAL);
  }

  dots.forEach(function (dot, i) {
    dot.addEventListener('click', function () { show(i); start(); });
  });

  if (hero) {
    hero.addEventListener('mouseenter', stop);
    hero.addEventListener('mouseleave', start);
    hero.addEventListener('focusin', stop);
    hero.addEventListener('focusout', start);
  }
  document.addEventListener('visibilitychange', function () {
    if (!slides.length) return;
    if (document.hidden) { stop(); } else { start(); }
  });

  if (slides.length) {
    show(0);
    start();
  }

  /* ----- Мобильное меню ----- */
  var burger = document.querySelector('.burger');
  var nav = document.getElementById('nav');

  function setMenu(open) {
    nav.classList.toggle('is-open', open);
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  if (burger && nav) {
    burger.addEventListener('click', function (event) {
      event.stopPropagation();
      setMenu(!nav.classList.contains('is-open'));
    });
    nav.addEventListener('click', function (event) {
      if (event.target.closest('a')) setMenu(false);
    });
    document.addEventListener('click', function (event) {
      if (!nav.contains(event.target)) setMenu(false);
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') setMenu(false);
    });
  }

  /* ----- Уведомление о cookie ----- */
  // Выбор хранится в localStorage под ключом cookieConsent: 'all' или 'necessary'.
  // Перед подключением аналитики проверяйте, что значение равно 'all'.
  var CONSENT_KEY = 'cookieConsent';

  function readConsent() {
    try { return window.localStorage.getItem(CONSENT_KEY); } catch (e) { return null; }
  }

  function saveConsent(value) {
    try { window.localStorage.setItem(CONSENT_KEY, value); } catch (e) { /* хранилище недоступно */ }
    document.dispatchEvent(new CustomEvent('cookieconsent', { detail: value }));
  }

  if (!readConsent()) {
    var banner = document.createElement('section');
    banner.className = 'cookie';
    banner.setAttribute('aria-label', 'Уведомление о файлах cookie');
    banner.innerHTML =
      '<p class="cookie__text">Мы используем файлы cookie, чтобы сайт работал корректно и становился удобнее. ' +
      'Подробнее — в <a href="cookies.html">политике использования cookie</a>.</p>' +
      '<div class="cookie__actions">' +
      '<button class="cookie__btn cookie__btn--ghost" type="button" data-consent="necessary">Только необходимые</button>' +
      '<button class="cookie__btn" type="button" data-consent="all">Принять</button>' +
      '</div>';
    banner.addEventListener('click', function (event) {
      var button = event.target.closest('[data-consent]');
      if (!button) return;
      saveConsent(button.getAttribute('data-consent'));
      banner.classList.remove('is-visible');
      setTimeout(function () { banner.remove(); }, 300);
    });
    document.body.appendChild(banner);
    // следующий кадр — чтобы сработала анимация появления
    setTimeout(function () { banner.classList.add('is-visible'); }, 50);
  }

  /* ----- Появление блоков при прокрутке ----- */
  var REVEAL = '.section__head, .cat, .product, .banner, .feature, .crumbs, .page__title, .page__lead, .chips, .legal > h2, .legal > p, .legal > ul, .fact, .store, .block-title, .service, .gallery__item, .reviews__aside, .embed, .contact-card';

  function initReveal() {
    var observer = new IntersectionObserver(function (entries) {
      // блоки, появившиеся одновременно, выезжают лесенкой
      var step = 0;
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.style.setProperty('--d', Math.min(step, 5) * 80 + 'ms');
        entry.target.classList.add('is-in');
        observer.unobserve(entry.target);
        step++;
      });
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.1 });

    document.querySelectorAll(REVEAL).forEach(function (el) {
      el.classList.add('reveal');
      observer.observe(el);
    });
  }

  if (!reduceMotion && 'IntersectionObserver' in window) {
    // Если запустить наблюдатель до показа страницы, Chrome отменяет анимацию перехода между страницами.
    // Поэтому ждём событие pagereveal (флаг ставит скрипт в <head>), а в браузерах без него стартуем сразу.
    if (typeof window.PageRevealEvent === 'undefined' || window.__pageRevealed) {
      initReveal();
    } else {
      window.addEventListener('pagereveal', initReveal, { once: true });
    }
  }

  /* ----- Переходы между страницами: запасной вариант для браузеров без view transitions ----- */
  var root = document.documentElement;

  if (root.classList.contains('no-vt') && !reduceMotion) {
    document.addEventListener('click', function (event) {
      if (event.defaultPrevented || event.button !== 0 ||
          event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      var link = event.target.closest('a[href]');
      if (!link || link.target || link.hasAttribute('download')) return;
      var url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      // якорь на той же странице — обычная плавная прокрутка
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      event.preventDefault();
      root.classList.add('is-leaving');
      setTimeout(function () { window.location.href = url.href; }, 220);
    });
    // возврат кнопкой «Назад» из кэша браузера
    window.addEventListener('pageshow', function (event) {
      if (event.persisted) root.classList.remove('is-leaving');
    });
  }

  /* ----- Виджеты Яндекс Карт (карта и отзывы) ----- */
  // Яндекс может ставить свои cookie, поэтому виджеты грузятся после «Принять» в баннере
  // или по кнопке «Показать карту / отзывы» в самом блоке.
  function loadEmbed(box) {
    if (box.classList.contains('is-loaded')) return;
    var frame = document.createElement('iframe');
    frame.src = box.getAttribute('data-embed');
    frame.title = box.getAttribute('data-embed-title') || '';
    frame.loading = 'lazy';
    frame.allowFullscreen = true;
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    box.appendChild(frame);
    box.classList.add('is-loaded');
  }
  var embeds = Array.prototype.slice.call(document.querySelectorAll('[data-embed]'));
  if (embeds.length) {
    if (readConsent() === 'all') embeds.forEach(loadEmbed);
    embeds.forEach(function (box) {
      var button = box.querySelector('[data-embed-load]');
      if (button) button.addEventListener('click', function () { loadEmbed(box); });
    });
    document.addEventListener('cookieconsent', function (event) {
      if (event.detail === 'all') embeds.forEach(loadEmbed);
    });
  }

  /* ----- Открыто / закрыто сейчас (часы работы по Москве) ----- */
  var statusNodes = document.querySelectorAll('[data-open-status]');
  var OPEN_HOUR = 9, CLOSE_HOUR = 20;
  function updateOpenStatus() {
    var parts = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', hour: 'numeric', minute: 'numeric', hour12: false })
      .formatToParts(new Date());
    var hour = 0, minute = 0;
    parts.forEach(function (p) {
      if (p.type === 'hour') hour = parseInt(p.value, 10) % 24;
      if (p.type === 'minute') minute = parseInt(p.value, 10);
    });
    var now = hour * 60 + minute;
    var open = now >= OPEN_HOUR * 60 && now < CLOSE_HOUR * 60;
    var text;
    if (open) {
      var left = CLOSE_HOUR * 60 - now;
      text = left <= 60 ? 'Открыто, закроемся через ' + left + ' мин' : 'Сейчас открыто до 20:00';
    } else {
      text = now < OPEN_HOUR * 60 ? 'Сейчас закрыто, откроемся в 9:00' : 'Сейчас закрыто, откроемся завтра в 9:00';
    }
    Array.prototype.forEach.call(statusNodes, function (node) {
      node.textContent = text;
      node.classList.toggle('is-open', open);
    });
  }
  if (statusNodes.length) {
    updateOpenStatus();
    setInterval(updateOpenStatus, 60000);
  }

  /* ----- Просмотр фото магазина ----- */
  var lightboxLinks = Array.prototype.slice.call(document.querySelectorAll('[data-lightbox]'));
  if (lightboxLinks.length && typeof HTMLDialogElement === 'function') {
    var dialog = document.createElement('dialog');
    dialog.className = 'lightbox';
    dialog.setAttribute('aria-label', 'Фото магазина');
    dialog.innerHTML =
      '<figure class="lightbox__figure"><img class="lightbox__img" alt=""><figcaption class="lightbox__caption"></figcaption></figure>' +
      '<button class="lightbox__btn lightbox__close" type="button" aria-label="Закрыть"><svg><use href="#i-close"/></svg></button>' +
      '<button class="lightbox__btn lightbox__prev" type="button" aria-label="Предыдущее фото"><svg><use href="#i-chevron"/></svg></button>' +
      '<button class="lightbox__btn lightbox__next" type="button" aria-label="Следующее фото"><svg><use href="#i-chevron"/></svg></button>';
    document.body.appendChild(dialog);
    var lbImg = dialog.querySelector('.lightbox__img');
    var lbCaption = dialog.querySelector('.lightbox__caption');
    var lbIndex = 0;
    var showPhoto = function (index) {
      lbIndex = (index + lightboxLinks.length) % lightboxLinks.length;
      var link = lightboxLinks[lbIndex];
      lbImg.src = link.getAttribute('href');
      lbImg.alt = link.getAttribute('data-caption') || '';
      lbCaption.textContent = (lbIndex + 1) + ' / ' + lightboxLinks.length + ' · ' + (link.getAttribute('data-caption') || '');
    };
    lightboxLinks.forEach(function (link, index) {
      link.addEventListener('click', function (event) {
        event.preventDefault();
        showPhoto(index);
        dialog.showModal();
      });
    });
    dialog.querySelector('.lightbox__close').addEventListener('click', function () { dialog.close(); });
    dialog.querySelector('.lightbox__prev').addEventListener('click', function () { showPhoto(lbIndex - 1); });
    dialog.querySelector('.lightbox__next').addEventListener('click', function () { showPhoto(lbIndex + 1); });
    dialog.addEventListener('click', function (event) { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowLeft') showPhoto(lbIndex - 1);
      if (event.key === 'ArrowRight') showPhoto(lbIndex + 1);
    });
  }
})();
