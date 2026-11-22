#!/usr/bin/env python3
"""Обновление каталога: товары, цены и наличие с сайта поставщика плюс наценка.

Запуск из папки сайта:
    python3 tools/update_catalog.py           # обычное обновление
    python3 tools/update_catalog.py --force   # записать результат, даже если товаров стало сильно меньше

Настройки (источник, разделы и наценки) берутся из переменной окружения CATALOG_CONFIG,
а если её нет — из файла tools/markup.json. На GitHub конфиг хранится в секрете CATALOG_CONFIG,
чтобы наценки не попадали в открытый репозиторий.

Что делает:
  1. Обходит разделы сайта поставщика (список и наценки — в tools/markup.json).
  2. Из каждой карточки берёт название, фото, варианты (например, с физической SIM / только eSIM),
     цену и наличие.
  3. Прибавляет наценку раздела и сохраняет data/products.json — каталог на сайте читает этот файл сам.

Цены поставщика и ссылки на его карточки в data/products.json не попадают: файл публичный.
Нужен только Python 3.8+, сторонние библиотеки не используются.
"""
import datetime
import html
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_PATH = os.path.join(ROOT, 'tools', 'markup.json')
OUT_PATH = os.path.join(ROOT, 'data', 'products.json')

USER_AGENT = 'Mozilla/5.0 (compatible; EplCentrCatalogSync/1.0)'
DELAY_SECONDS = 1.5          # пауза между запросами, чтобы не нагружать сайт поставщика
MAX_PAGES_PER_CATEGORY = 60  # предохранитель от бесконечного обхода
MIN_SHARE_OF_PREVIOUS = 0.5  # если товаров меньше половины от прошлого раза — не перезаписываем файл

MSK = datetime.timezone(datetime.timedelta(hours=3))


def log(*parts):
    print(*parts, flush=True)


def fetch(url, attempts=3):
    last_error = None
    for attempt in range(1, attempts + 1):
        try:
            request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT, 'Accept-Language': 'ru'})
            with urllib.request.urlopen(request, timeout=40) as response:
                return response.read().decode('utf-8', errors='replace')
        except (urllib.error.URLError, TimeoutError, ConnectionError) as error:
            last_error = error
            log(f'  ! {url}: {error} (попытка {attempt}/{attempts})')
            time.sleep(DELAY_SECONDS * 3 * attempt)
    raise RuntimeError(f'Не удалось загрузить {url}: {last_error}')


def text_of(fragment):
    fragment = re.sub(r'<[^>]+>', ' ', fragment)
    return re.sub(r'\s+', ' ', html.unescape(fragment)).strip()


def absolute(source, path):
    if not path:
        return None
    if path.startswith('//'):
        return 'https:' + path
    if path.startswith('/'):
        return source.rstrip('/') + path
    return path


def clean_name(name):
    # «(без RuStore)» и «(eSIM)» — пометки варианта, а не модели: их показывает переключатель SIM
    name = re.sub(r'\s*\((?:без RuStore|eSIM)\)\s*$', '', name, flags=re.I)
    return name.strip()


# Блок цены карточки. Учитывает:
#  - пометку «нет в наличии» (класс not-avaliable — так, с опечаткой, на сайте поставщика);
#  - товары с выбором гарантии: первой идёт base-price — цена с гарантией 1 год, её и берём;
#  - скидки: зачёркнутая старая цена (old-value) пропускается, берётся актуальная.
PRICE_RE = re.compile(
    r'<div class="\s*price(?P<na>\s+not-avaliable)?\s*">\s*'
    r'(?:<div class="base-price"[^>]*>\s*)?'
    r'<div class="value">\s*(?:<div class="old-value">[^<]*</div>\s*)?'
    r'(?P<price>[\d\s ]+)\s*₽',
)


def parse_cards(page, source, category):
    """Возвращает список товаров с одной страницы раздела."""
    starts = [m.start() for m in re.finditer(r'class="catalog-item-holder', page)]
    products = []
    for index, start in enumerate(starts):
        end = starts[index + 1] if index + 1 < len(starts) else start + 20000
        card = page[start:end]

        link = re.search(r'class="[^"]*catalog-item-detail-link[^"]*"[^>]*href="([^"]+)"', card) \
            or re.search(r'href="(/catalog/[^"]+)"', card)
        if not link:
            continue
        path_parts = link.group(1).strip('/').split('/')
        subcategory = path_parts[2] if len(path_parts) > 3 else ''

        name_match = re.search(r'<div class="name">\s*<a[^>]*>(.*?)</a>', card, flags=re.S)
        image_match = re.search(r'<img[^>]+src="([^"]+)"', card)
        badge_match = re.search(r'<div class="stamp[^"]*">\s*([^<]+?)\s*</div>', card)
        compare_match = re.search(r'compare-item-(\d+)', card)

        # кнопки «Физическая SIM: Да / Нет» у iPhone
        sim_labels = {}
        for m in re.finditer(r'class="btn simCardItem[^"]*"\s+data-itemid="(\d+)"[^>]*>\s*(Да|Нет)\s*<', card):
            sim_labels[m.group(1)] = 'SIM+eSIM' if m.group(2) == 'Да' else 'eSIM'

        variants = []
        for m in PRICE_RE.finditer(card):
            block_ids = re.findall(r'itemPriceBlockFor-(\d+)', card[:m.start()])
            variant_id = block_ids[-1] if block_ids else (compare_match.group(1) if compare_match else None)
            after = card[m.end():m.end() + 1500]
            name_after = re.search(r'data-itemname="([^"]*)"', after)
            price = int(re.sub(r'\D', '', m.group('price')) or 0)
            if not variant_id or price <= 0 or any(v['id'] == variant_id for v in variants):
                continue
            variants.append({
                'id': variant_id,
                'label': sim_labels.get(variant_id),
                'name': html.unescape(name_after.group(1)) if name_after else None,
                'supplierPrice': price,
                'available': not m.group('na'),
            })
        if not variants:
            # карточка без цены: товар снят с продажи или «сообщить о поступлении» — сохраняем как «нет в наличии»
            fallback_id = compare_match.group(1) if compare_match else link.group(1)
            variants.append({'id': fallback_id, 'label': None, 'name': None, 'supplierPrice': None, 'available': False})

        name = text_of(name_match.group(1)) if name_match else (variants[0]['name'] or '')
        # если вариантов несколько и подписи не нашлись — подписываем по имени варианта
        if len(variants) > 1:
            for variant in variants:
                if not variant['label']:
                    variant['label'] = variant['name'] or f"Вариант {variants.index(variant) + 1}"
        products.append({
            'id': compare_match.group(1) if compare_match else variants[0]['id'],
            'category': category,
            'subcategory': subcategory,
            'name': clean_name(name),
            'image': absolute(source, image_match.group(1)) if image_match else None,
            'badge': badge_match.group(1).strip().capitalize() if badge_match else None,
            'variants': variants,
        })
    return products


def page_count(page):
    numbers = [(m.group(1), int(m.group(2))) for m in re.finditer(r'PAGEN_(\d+)=(\d+)', page)]
    if not numbers:
        return None, 1
    param = numbers[0][0]
    return f'PAGEN_{param}', max(n for p, n in numbers if p == param)


def subcategory_titles(home, category):
    titles = {}
    pattern = rf'<a[^>]+href="/catalog/{re.escape(category)}/([a-z0-9-]+)"[^>]*>(.*?)</a>'
    for m in re.finditer(pattern, home, flags=re.S):
        title = text_of(m.group(2))
        if title and m.group(1) not in titles:
            titles[m.group(1)] = title
    return titles


def apply_markup(product, markup):
    variants = []
    for v in product['variants']:
        variants.append({
            'id': v['id'],
            'label': v['label'],
            'price': v['supplierPrice'] + markup if v['supplierPrice'] else None,
            'available': v['available'],
        })
    return {
        'id': product['id'],
        'category': product['category'],
        'subcategory': product['subcategory'],
        'name': product['name'],
        'image': product['image'],
        'badge': product['badge'],
        'available': any(v['available'] and v['price'] for v in variants),
        'variants': variants,
    }


def main():
    force = '--force' in sys.argv
    if os.environ.get('CATALOG_CONFIG'):
        config = json.loads(os.environ['CATALOG_CONFIG'])
    else:
        with open(CONFIG_PATH, encoding='utf-8') as f:
            config = json.load(f)
    source = config['source'].rstrip('/')

    log(f'Источник: {source}')
    home = fetch(source + '/')
    time.sleep(DELAY_SECONDS)

    categories_out = []
    products_out = []
    seen = set()

    for cat in config['categories']:
        if not cat.get('enabled', True):
            continue
        slug, markup = cat['slug'], int(cat.get('markup', 0))
        base = f'{source}/catalog/{slug}'
        first = fetch(base)
        param, pages = page_count(first)
        pages = min(pages, MAX_PAGES_PER_CATEGORY)

        found = []
        for number in range(1, pages + 1):
            page = first if number == 1 else fetch(f'{base}?{param}={number}')
            cards = parse_cards(page, source, slug)
            fresh = [p for p in cards if (slug, p['id']) not in seen]
            for p in fresh:
                seen.add((slug, p['id']))
            found.extend(fresh)
            if number > 1 and not fresh:
                break
            time.sleep(DELAY_SECONDS)

        titles = subcategory_titles(home, slug)
        order = list(titles)
        counts = {}
        for p in found:
            counts[p['subcategory']] = counts.get(p['subcategory'], 0) + 1
        subcategories = [
            {'slug': s, 'title': titles.get(s, s), 'count': counts[s]}
            for s in sorted(counts, key=lambda s: order.index(s) if s in order else len(order))
            if s
        ]
        marked = [apply_markup(p, markup) for p in found]
        products_out.extend(marked)
        available = sum(1 for p in marked if p['available'])
        categories_out.append({
            'slug': slug,
            'title': cat.get('title', slug),
            'count': len(marked),
            'available': available,
            'subcategories': subcategories,
        })
        log(f'  {cat.get("title", slug):<20} страниц: {pages:>2}  товаров: {len(marked):>4}  в наличии: {available:>4}  наценка: {markup} ₽')

    total = len(products_out)
    log(f'Итого товаров: {total}, в наличии: {sum(1 for p in products_out if p["available"])}')

    if total == 0:
        log('Ни одного товара не найдено — вероятно, изменилась вёрстка сайта поставщика. Файл не изменён.')
        return 2
    if os.path.exists(OUT_PATH) and not force:
        with open(OUT_PATH, encoding='utf-8') as f:
            previous = len(json.load(f).get('products', []))
        if previous and total < previous * MIN_SHARE_OF_PREVIOUS:
            log(f'Товаров стало {total} вместо {previous} — похоже на сбой. Файл не изменён (запустите с --force, если так и надо).')
            return 3

    data = {
        'updatedAt': datetime.datetime.now(MSK).isoformat(timespec='minutes'),
        'currency': 'RUB',
        'categories': categories_out,
        'products': products_out,
    }
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    tmp = OUT_PATH + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    os.replace(tmp, OUT_PATH)
    log(f'Сохранено: {os.path.relpath(OUT_PATH, ROOT)} ({os.path.getsize(OUT_PATH) // 1024} КБ)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
