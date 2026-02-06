// --- FIREBASE CONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyAT4dDEIDUtzP60ibjahO06P75Q6h95ZN4",
  authDomain: "razrabotka-b61bc.firebaseapp.com",
  projectId: "razrabotka-b61bc",
  storageBucket: "razrabotka-b61bc.firebasestorage.app",
  messagingSenderId: "394402564794",
  appId: "1:394402564794:web:f610ffb03e655c600c5083"
};

let db;
let siteData = {};
const initialSiteData = {
    home: { h1: "", subtitle: "", lang: "en", seoTitle: "Digital Craft", metaDescription: "Professional websites for small businesses" },
    services: [], portfolio: [], blog: [], contact: [], carouselItems: [] // NEW: Добавлена коллекция carouselItems
};

const mainContentEl = document.querySelector('main');
let floatingObserver, animateOnceObserver, animateAlwaysObserver;

// Карта транслитерации для грузинского (Mkhedruli) в латиницу (упрощенная для slugs)
const GEORGIAN_TRANSLIT_MAP = {
    'ა': 'a', 'ბ': 'b', 'გ': 'g', 'დ': 'd', 'ე': 'e', 'ვ': 'v', 'ზ': 'z', 'თ': 't', 'ი': 'i',
    'კ': 'k', 'ლ': 'l', 'მ': 'm', 'ნ': 'n', 'ო': 'o', 'პ': 'p', 'ჟ': 'zh', 'რ': 'r', 'ს': 's',
    'ტ': 't', 'უ': 'u', 'ფ': 'p', 'ქ': 'k', 'ღ': 'gh', 'ყ': 'q', 'შ': 'sh', 'ჩ': 'ch', 'ც': 'ts',
    'ძ': 'dz', 'წ': 'ts', 'ჭ': 'ch', 'ხ': 'kh', 'ჯ': 'j', 'ჰ': 'h',
};

// Карта транслитерации для кириллических символов (русский, украинский)
const CYRILLIC_TRANSLIT_MAP = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'zh', 'з': 'z',
    'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r',
    'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch',
    'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
    'ґ': 'g', 'є': 'ye', 'і': 'i', 'ї': 'yi', // Украинские символы
};

// --- УТИЛИТА ДЛЯ ГЕНЕРАЦИИ ЯКОРЕЙ (SLUGS) ---
function slugify(text) {
    text = String(text).toLowerCase();

    // 1. Обработка грузинских символов
    let hasGeorgian = false;
    for (let i = 0; i < text.length; i++) {
        const charCode = text.charCodeAt(i);
        // Диапазон Unicode для грузинских символов (Mkhedruli)
        if (charCode >= 0x10D0 && charCode <= 0x10FF) {
            hasGeorgian = true;
            break;
        }
    }
    if (hasGeorgian) {
        let transliteratedGeorgian = '';
        for (let i = 0; i < text.length; i++) {
            transliteratedGeorgian += GEORGIAN_TRANSLIT_MAP[text[i]] || text[i];
        }
        text = transliteratedGeorgian;
    }

    // 2. Обработка кириллических символов
    let hasCyrillic = false;
    for (let i = 0; i < text.length; i++) {
        const charCode = text.charCodeAt(i);
        // Диапазон Unicode для кириллических символов
        if (charCode >= 0x0400 && charCode <= 0x04FF) {
            hasCyrillic = true;
            break;
        }
    }
    if (hasCyrillic) {
        let transliteratedCyrillic = '';
        for (let i = 0; i < text.length; i++) {
            transliteratedCyrillic += CYRILLIC_TRANSLIT_MAP[text[i]] || text[i];
        }
        text = transliteratedCyrillic;
    }

    // 3. Общая очистка: удаление всех, кроме латиницы, цифр и дефисов
    // Примечание: `\w` в JS включает `_`, но `[^a-z0-9-]` более точен для slugs
    text = text.replace(/[^a-z0-9-]+/g, '-');

    // 4. Нормализация дефисов и обрезка
    text = text.replace(/--+/g, '-').replace(/^-+/, '').replace(/-+$/, '');

    return text;
}


// --- ANIMATION & OBSERVER LOGIC ---
function setupObservers() {
    // Disconnect old observers before re-initialization
    if (floatingObserver) floatingObserver.disconnect();
    if (animateOnceObserver) animateOnceObserver.disconnect();
    if (animateAlwaysObserver) animateAlwaysObserver.disconnect();

    floatingObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const target = entry.target;
            const isAboveViewport = entry.boundingClientRect.top < 0 && !entry.isIntersecting;
            if (entry.isIntersecting) {
                target.classList.add('is-visible');
                target.classList.remove('is-above');
            } else {
                target.classList.remove('is-visible');
                if (isAboveViewport) {
                    target.classList.add('is-above');
                } else {
                    target.classList.remove('is-above');
                }
            }
        });
    }, { threshold: 0, rootMargin: "-50px 0px -50px 0px" });

    animateOnceObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1, rootMargin: "0px 0px -50px 0px" });

    animateAlwaysObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
            } else {
                entry.target.classList.remove('is-visible');
            }
        });
    }, { threshold: 0.1, rootMargin: "0px 0px -50px 0px" });
    
    // Connect observers to all elements with corresponding classes
    document.querySelectorAll('.floating-item').forEach(el => floatingObserver.observe(el));
    document.querySelectorAll('.animate-on-scroll').forEach(el => animateOnceObserver.observe(el));
    document.querySelectorAll('.animate-always').forEach(el => animateAlwaysObserver.observe(el));
}


// --- SEO & DATA FUNCTIONS ---
function renderSeoTags(data) {
    document.querySelectorAll('meta[name="description"], meta[property^="og:"], script[type="application/ld+json"], link[rel="canonical"]').forEach(el => el.remove());
    document.title = data.seoTitle || "Digital Craft";
    document.documentElement.lang = data.lang || 'en';
    const createMeta = (attr, key, value) => {
        if (value) {
            const meta = document.createElement('meta');
            meta.setAttribute(attr, key);
            meta.content = value;
            document.head.appendChild(meta);
        }
    };
    createMeta('name', 'description', data.metaDescription);
    createMeta('property', 'og:title', data.ogTitle || data.seoTitle);
    createMeta('property', 'og:description', data.ogDescription || data.metaDescription);
    const mediaArray = data.media || [];
    const ogImage = data.ogImage || (mediaArray.find && mediaArray.find(url => !/youtube|vimeo/.test(url))) || '';
    if (ogImage) createMeta('property', 'og:image', ogImage);
    const canonical = document.createElement('link');
    canonical.rel = 'canonical';
    const canonicalBaseUrl = 'https://digital-craft-tbilisi.site';
    let path = window.location.pathname;
    if (path.length > 1 && !path.endsWith('/')) {
        path += '/';
    }
    canonical.href = canonicalBaseUrl + path;
    document.head.appendChild(canonical);
    let schemaData = data.schemaJsonLd;
    if (typeof schemaData === 'string' && schemaData.trim()) {
        try {
            schemaData = JSON.parse(schemaData);
        } catch (e) {
            console.error('Failed to parse schemaJsonLd:', e);
            schemaData = null;
        }
    }
    if (schemaData && typeof schemaData === 'object' && Object.keys(schemaData).length > 0) {
        const script = document.createElement('script');
        script.type = 'application/ld+json';
        script.textContent = JSON.stringify(schemaData);
        document.head.appendChild(script);
    }
}

async function loadData() {
    const freshSiteData = {};
    try {
        // NEW: Добавлена коллекция 'carouselItems'
        const collections = ['services', 'portfolio', 'blog', 'contact', 'carouselItems'];
        const dataPromises = [
            db.collection('home').doc('content').get(),
            ...collections.map(col => {
                // Для carouselItems добавим сортировку по полю 'order'
                if (col === 'carouselItems') {
                    return db.collection(col).orderBy('order').get();
                }
                return db.collection(col).get();
            })
        ];
        const [homeDoc, ...snapshots] = await Promise.all(dataPromises);
        const processDocData = (data) => {
            if (data && typeof data.schemaJsonLd === 'string' && data.schemaJsonLd.trim().startsWith('{')) {
                try {
                    data.schemaJsonLd = JSON.parse(data.schemaJsonLd);
                } catch (e) {
                    data.schemaJsonLd = {};
                }
            }
            return data;
        };
        freshSiteData.home = homeDoc.exists ? processDocData(homeDoc.data()) : {};
        collections.forEach((col, index) => {
            freshSiteData[col] = snapshots[index].docs
                .map(doc => ({ id: doc.id, ...processDocData(doc.data()) }))
                .filter(item => item.status !== 'archived');
        });
        return freshSiteData;
    } catch (error) {
        console.error("Error loading data from Firebase:", error);
        return JSON.parse(JSON.stringify(initialSiteData));
    }
}


// --- RENDER FUNCTIONS ---
function formatContentHtml(content) {
    if (!content) return '';

    let processedContent = content.replace(/<pre(.*?)>([\s\S]*?)<\/pre>/gim, function(match, attrs, inner) {
        const codeMatch = inner.match(/^\s*<code(.*?)>([\s\S]*?)<\/code>\s*$/i);
        if (codeMatch) {
            const codeAttrs = codeMatch[1];
            const codeContent = codeMatch[2];
            const escapedContent = codeContent.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return `<pre${attrs}><code${codeAttrs}>${escapedContent}</code></pre>`;
        } else {
            const escapedInner = inner.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return `<pre${attrs}>${escapedInner}</pre>`;
        }
    });

    processedContent = processedContent.replace(/\r\n/g, '\n');
    const blocks = processedContent.split(/\n{2,}/);
    
    const html_parts = blocks.map(block => {
        const trimmedBlock = block.trim();
        if (!trimmedBlock) return '';
        
        const youtubeRegex = /^https?:\/\/(?:www\.|m\.)?(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch?v=|watch\?.*&v=|shorts\/))([a-zA-Z0-9_-]{11}).*$/;
        const imageRegex = /^https?:\/\/[^<>"']+\.(?:jpg|jpeg|png|gif|webp|svg)\s*$/i;
        
        const youtubeMatch = trimmedBlock.match(youtubeRegex);
        const imageMatch = trimmedBlock.match(imageRegex);
        
        if (/^<(p|div|h[1-6]|ul|ol|li|blockquote|hr|table|pre)/i.test(trimmedBlock)) {
            return trimmedBlock;
        } else if (youtubeMatch && youtubeMatch[1]) {
            const videoId = youtubeMatch[1];
            return `<div class="embedded-video" style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%; background: #000; margin: 1.5em 0; border-radius: 4px; border: 1px solid var(--color-border);"><iframe style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" src="https://www.youtube.com/embed/${videoId}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
        } else if (imageMatch) {
            return `<p style="margin: 1.5em 0;"><img src="${trimmedBlock}" alt="Embedded content" style="max-width: 100%; height: auto; display: block; margin: 0 auto; border-radius: 4px; border: 1px solid var(--color-border);" /></p>`;
        } else {
            return `<p>${trimmedBlock.replace(/\n/g, '<br>')}</p>`;
        }
    }).filter(Boolean);
    
    const groupedHtml = [];
    const GROUP_SIZE = 3;
    for (let i = 0; i < html_parts.length; i += GROUP_SIZE) {
        const group = html_parts.slice(i, i + GROUP_SIZE);
        if (group.length > 0) {
            groupedHtml.push(`<div class="content-group">${group.join('')}</div>`);
        }
    }
    
    return groupedHtml.join('\n');
}

function renderSection(key, title, items) {
    const section = document.getElementById(key);
    if (!section) return;
    const isMobile = window.matchMedia("(max-width: 767px)").matches;
    const itemsFromDb = items || siteData[key] || [];
    const langOrder = ['en', 'ka', 'uk', 'ru'];
    const langNames = { en: 'English', ka: 'Georgian', uk: 'Ukrainian', ru: 'Russian' };
    const itemsByLang = {};
    itemsFromDb.forEach(item => {
        const lang = item.lang || 'en';
        if (!itemsByLang[lang]) itemsByLang[lang] = [];
        itemsByLang[lang].push(item);
    });
    let finalHtml;
    if (isMobile) {
        const mobileSlidersHTML = langOrder.map(lang => {
            const langItems = itemsByLang[lang];
            if (!langItems || langItems.length === 0) return '';
            const slidesHTML = langItems.map((item, index) => {
                const langPrefix = item.lang ? `/${item.lang}` : '';
                let itemUrl = `${langPrefix}/${key}/${item.urlSlug}/`;
                const mediaArray = item.media || [];
                const imageUrl = (mediaArray.find && mediaArray.find(url => !/youtube|vimeo/.test(url))) || '';
                return `<a href="${itemUrl}" class="item-card ${index === 0 ? 'active' : ''}"><div class="item-card__image" style="background-image: url('${imageUrl}')"></div><div class="item-card__content"><h3>${item.title}</h3><div class="card-subtitle">${item.subtitle}</div><p>${item.description}</p></div></a>`
            }).join('');
            const dotsHTML = langItems.length > 1 ? langItems.map((_, index) => `<span class="slider-dot ${index === 0 ? 'active' : ''}" data-index="${index}"></span>`).join('') : '';
            return `<div class="language-slider-block"><div class="cross-fade-slider">${slidesHTML}</div><div class="slider-nav">${dotsHTML}</div></div>`;
        }).join('');
        finalHtml = `<div class="mobile-sliders-container">${mobileSlidersHTML}</div>`;
    } else {
        const desktopGridsHTML = langOrder.map(lang => {
            const langItems = itemsByLang[lang];
            if (!langItems || langItems.length === 0) return '';
            const slides = [];
            for (let i = 0; i < langItems.length; i += 3) {
                slides.push(langItems.slice(i, i + 3));
            }
            const slidesHTML = slides.map((slideItems, index) => {
                const cardsHTML = slideItems.map(item => {
                    const langPrefix = item.lang ? `/${item.lang}` : '';
                    let itemUrl = `${langPrefix}/${key}/${item.urlSlug}/`;
                    const mediaArray = item.media || [];
                    const imageUrl = (mediaArray.find && mediaArray.find(url => !/youtube|vimeo/.test(url))) || '';
                    return `<a href="${itemUrl}" class="item-card"><div class="item-card__image" style="background-image: url('${imageUrl}')"></div><div class="item-card__content"><h3>${item.title}</h3><div class="card-subtitle">${item.subtitle}</div><p>${item.description}</p></div></a>`;
                }).join('');
                return `<div class="desktop-grid-slide ${index === 0 ? 'active' : ''}">${cardsHTML}</div>`;
            }).join('');
            const dotsHTML = slides.length > 1 ? slides.map((_, index) => `<span class="desktop-slider-dot ${index === 0 ? 'active' : ''}" data-index="${index}"></span>`).join('') : '';
            return `<div class="desktop-language-group"><h4 class="desktop-lang-title">${langNames[lang]}</h4><div class="desktop-carousel-container">${slidesHTML}</div>${slides.length > 1 ? `<div class="desktop-slider-nav">${dotsHTML}</div>` : ''}</div>`;
        }).join('');
        finalHtml = `<div class="desktop-grid-wrapper">${desktopGridsHTML}</div>`;
    }
    // Changed to direct h2 with animation classes for immediate visibility
    section.innerHTML = `<h2 class="animate-on-scroll is-visible">${title}</h2>${finalHtml}`;
};

// --- Инициализация переключателя TOC ---
let floatingTocToggleInitialized = false;
function initFloatingTocToggle() {
    // This function should be called only once to set up event listeners
    // and only if TOC elements are present and not display: none.
    if (floatingTocToggleInitialized) return; 
    
    const floatingTocWrapper = document.getElementById('floating-toc-wrapper');
    const toggleBtn = document.getElementById('toc-toggle-btn');
    const contentPanel = document.getElementById('toc-content-panel');

    if (!floatingTocWrapper || !toggleBtn || !contentPanel) return;

    toggleBtn.addEventListener('click', (event) => {
        event.stopPropagation(); 
        const isExpanded = toggleBtn.getAttribute('aria-expanded') === 'true';
        toggleBtn.setAttribute('aria-expanded', !isExpanded);
        contentPanel.setAttribute('aria-hidden', isExpanded);
        contentPanel.classList.toggle('is-visible', !isExpanded);
        toggleBtn.classList.toggle('is-active', !isExpanded);
    });

    document.addEventListener('click', (event) => {
        if (contentPanel.classList.contains('is-visible') && !floatingTocWrapper.contains(event.target)) {
            toggleBtn.setAttribute('aria-expanded', 'false');
            contentPanel.setAttribute('aria-hidden', 'true');
            contentPanel.classList.remove('is-visible');
            toggleBtn.classList.remove('is-active');
        }
    });

    floatingTocToggleInitialized = true;
}

// NEW: Глобальная функция для инициализации карусели
let mzaCarouselInstance = null;
function initializeCarousel() {
    const carouselRoot = document.getElementById('mzaCarousel');
    if (carouselRoot && typeof window.initMzaCarousel === 'function') {
        // Если карусель уже была инициализирована, возможно, её нужно "уничтожить"
        // или просто переинициализировать, если элемент был заменен.
        // В данном случае, так как элемент заменяется при навигации,
        // просто создаем новый экземпляр.
        mzaCarouselInstance = window.initMzaCarousel('mzaCarousel', { transitionMs: 900 });
        console.log("MzaCarousel initialized.");
    } else if (mzaCarouselInstance) {
        // Если элемент карусели больше не присутствует на странице, сбрасываем ссылку
        mzaCarouselInstance = null;
    }
}


function renderDetailPage(collection, slug, lang) {
    const item = siteData[collection]?.find(d => d.urlSlug === slug && d.lang === lang);
    const floatingTocWrapper = document.getElementById('floating-toc-wrapper');
    const tocContentPanel = document.getElementById('toc-content-panel');
    const tocToggleBtn = document.getElementById('toc-toggle-btn');

    if (!item) {
        mainContentEl.innerHTML = `<section class="detail-page-header"><h1>404 - Not Found</h1><p>The page you were looking for does not exist.</p><a href="/">Go back home</a></section>`;
        if (floatingTocWrapper) floatingTocWrapper.style.display = 'none';
        initializeCarousel(); // NEW: Ensure carousel is cleared if page not found
        return;
    }
    renderSeoTags(item);
    applyCustomBackground(item);

    const rawContent = item.mainContent || '';
    let tocHtmlContent = ''; 
    let finalContentHtml = '';

    const tocTitles = {
        'en': 'Table of Contents',
        'ru': 'Содержание',
        'ka': 'სარჩევი',
        'uk': 'Зміст'
    };
    const tocTitle = tocTitles[lang] || 'Table of Contents';

    if (rawContent.trim().startsWith('[TOC]')) {
        const contentWithoutTocMarker = rawContent.replace('[TOC]', '', 1).trim();
        const contentHtml = formatContentHtml(contentWithoutTocMarker);

        const parser = new DOMParser();
        const doc = parser.parseFromString(contentHtml, 'text/html');
        
        const tocItems = [];
        doc.querySelectorAll('h2, h3').forEach(header => {
            const headerText = header.innerText.trim();
            if (headerText) {
                const headerSlug = slugify(headerText);
                header.id = headerSlug; 
                tocItems.push({
                    level: header.tagName.toLowerCase(),
                    text: headerText,
                    slug: headerSlug
                });
            }
        });

        if (tocItems.length > 0) {
            let tocListHtml = '<ul>';
            tocItems.forEach(item => {
                const className = item.level === 'h3' ? 'toc-level-h3' : '';
                tocListHtml += `<li class="${className}"><a href="#${item.slug}">${item.text}</a></li>`;
            });
            tocListHtml += '</ul>';
            tocHtmlContent = tocListHtml;
        }
        finalContentHtml = doc.body.innerHTML;
    } else {
        finalContentHtml = formatContentHtml(rawContent);
    }

    // NEW: Получаем HTML карусели из server-rendered content.
    // generate_site.py уже вставляет carousel_html в template.html.
    // Поэтому, когда мы устанавливаем mainContentEl.innerHTML, карусель уже будет там.
    // Нам просто нужно её инициализировать.
    
    // Внимание: Если carousel_html не был передан в шаблон или не был вставлен в final_content_html,
    // то его нужно будет добавить здесь вручную, если вы хотите, чтобы он был динамическим.
    // Но текущая логика generate_site.py вставляет его после detail-content.
    // Поэтому просто убедимся, что он будет в DOM.

    const detailPageHTML = `
        <section>
            <div class="detail-page-header">
                <h1 class="animate-always is-visible">${item.h1 || item.title || ''}</h1>
                ${item.price ? `<div class="detail-price animate-on-scroll"><span>${item.price}</span></div>` : ''} 
            </div>
            <div class="detail-content">${finalContentHtml}</div>
        </section>
        <button id="scroll-to-top-btn" title="Наверх">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
                <path fill="none" d="M0 0h24v24H0z"/>
                <path d="M13 7.828V20h-2V7.828l-5.364 5.364-1.414-1.414L12 4l7.778 7.778-1.414 1.414L13 7.828z"/>
            </svg>
        </button>
    `;
    mainContentEl.innerHTML = detailPageHTML;

    // Apply animation classes immediately after HTML insertion
    document.querySelectorAll('.detail-content > .content-group').forEach(el => el.classList.add('floating-item'));

    if (floatingTocWrapper && tocContentPanel && tocToggleBtn) {
        if (tocHtmlContent) {
            tocToggleBtn.innerHTML = `${tocTitle} <span class="toc-arrow"></span>`;
            tocContentPanel.innerHTML = tocHtmlContent; 
            floatingTocWrapper.style.display = 'flex'; 
            
            // Reset TOC state on new page load, so it's always closed by default
            tocToggleBtn.setAttribute('aria-expanded', 'false');
            tocContentPanel.setAttribute('aria-hidden', 'true');
            tocContentPanel.classList.remove('is-visible');
            tocToggleBtn.classList.remove('is-active');
            
            initFloatingTocToggle(); // Initialize event listeners, if not already
        } else {
            floatingTocWrapper.style.display = 'none'; 
            tocContentPanel.innerHTML = '';
        }
    }

    renderRelatedPosts(collection, slug, lang); // This function will append its elements and classes
    initializeCarousel(); // NEW: Initialize carousel after all content is rendered
    document.getElementById('site-footer').style.display = 'none';
}

function renderRelatedPosts(currentCollection, currentSlug, currentLang) {
    if (!siteData.services || !siteData.blog) return;
    const pool = [...siteData.services.map(i => ({...i, collection: 'services'})), ...siteData.blog.map(i => ({...i, collection: 'blog'}))];
    const relatedItems = pool.filter(item => item.lang === currentLang && !(item.collection === currentCollection && item.urlSlug === currentSlug)).sort(() => 0.5 - Math.random()).slice(0, 6);
    if (relatedItems.length === 0) return;
    const itemsHTML = relatedItems.map(item => {
        const langPrefix = item.lang ? `/${item.lang}` : '';
        let itemUrl = `${langPrefix}/${item.collection}/${item.urlSlug}/`;
        const mediaArray = item.media || [];
        const imageUrl = (mediaArray.find && mediaArray.find(url => !/youtube|vimeo/.test(url))) || '';
        // Класс animate-on-scroll добавлен прямо в HTML карточки
        return `<a href="${itemUrl}" class="item-card animate-on-scroll"><div class="item-card__image" style="background-image: url('${imageUrl}')"></div><div class="item-card__content"><h3>${item.title}</h3><div class="card-subtitle">${item.subtitle}</div><p>${item.description}</p></div></a>`
    }).join('');
    const relatedSection = document.createElement('section');
    relatedSection.id = 'related-posts';
    // Класс animate-on-scroll добавлен для h2
    relatedSection.innerHTML = `<h2 class="animate-on-scroll">You Might Also Like</h2><div class="item-grid">${itemsHTML}</div>`;
    mainContentEl.appendChild(relatedSection);
}

function renderMenu() { const menuEl = document.querySelector('.nav-menu'); if (!menuEl) return; const menuItems = [{ label: 'Home', href: '/' }, { label: 'Services', href: '/#services' }, { label: 'Portfolio', href: '/#portfolio' }, { label: 'Blog', href: '/#blog' }, { label: 'Contact', href: '/#contact' }]; menuEl.innerHTML = menuItems.map(item => `<li><a href="${item.href}">${item.label}</a></li>`).join(''); }

function applyCustomBackground(item) {
    const iframe = document.getElementById('custom-background-iframe');
    if (!iframe) return;
    const homeBgHtml = (siteData.home && siteData.home.backgroundHtml) || '';
    const itemBgHtml = (item && item.backgroundHtml) || '';
    const customCode = itemBgHtml || homeBgHtml || '';
    if (customCode && customCode.trim() !== "") {
        if (iframe.srcdoc === customCode && iframe.style.display === 'block') {
            return;
        }
        iframe.classList.remove('is-visible');
        iframe.onload = () => {
            iframe.classList.add('is-visible');
            iframe.onload = null;
        };
        iframe.style.display = 'block';
        iframe.srcdoc = customCode;
    } else {
        iframe.classList.remove('is-visible');
    }
}

function calculateQuizResult() {
    const quizForm = document.getElementById('business-quiz');
    if (!quizForm) { console.error('Quiz form not found!'); return; }
    const selectedAnswers = quizForm.querySelectorAll('input[type="radio"]:checked');
    if (selectedAnswers.length < 8) { alert('Please answer all 8 questions to get your result.'); return; }
    let scores = { landing: 0, website: 0, hybrid: 0 };
    selectedAnswers.forEach(answer => { scores[answer.value]++; });
    const resultDiv = document.getElementById('quiz-result');
    if (!resultDiv) { console.error('Quiz result container not found!'); return; }
    let resultHTML = '', resultStyle = '';
    if (scores.hybrid >= 5 || (scores.hybrid >= scores.landing && scores.hybrid >= scores.website)) {
        resultHTML = `<h3>Your Result: Hybrid Approach</h3><p>Consider a phased approach: start with a core website (5-8 pages) and add campaign-specific landing pages as needed. This balances long-term brand building with short-term conversion optimization.</p>`;
        resultStyle = 'background-color: rgba(255, 251, 230, 0.1); border-color: #ffe58f;';
    } else if (scores.landing >= 5 || scores.landing > scores.website) {
        resultHTML = `<h3>Your Result: Landing Page</h3><p>You need a focused, conversion-optimized landing page. Perfect for campaigns, single offers, events, or testing new business ideas. Expected investment: $500-$2,000 for professional landing page design in Tbilisi.</p>`;
        resultStyle = 'background-color: rgba(230, 247, 255, 0.1); border-color: #91d5ff;';
    } else {
        resultHTML = `<h3>Your Result: Multi-Page Website</h3><p>You need comprehensive site development. Invest in a multi-page website to build brand credibility, rank in search engines, and support complex sales processes. Expected investment: $3,000-$15,000+ depending on features.</p>`;
        resultStyle = 'background-color: rgba(246, 255, 237, 0.1); border-color: #b7eb8f;';
    }
    resultDiv.innerHTML = resultHTML;
    resultDiv.style.cssText = resultStyle + ' margin-top: 20px; padding: 15px; border-width: 2px; border-style: solid; border-radius: 8px; display: block;';
    resultDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function initDesktopCarousels() { document.querySelectorAll('.desktop-carousel-container').forEach(carousel => { const slides = carousel.querySelectorAll('.desktop-grid-slide'); const nav = carousel.nextElementSibling; if (!nav || !nav.matches('.desktop-slider-nav')) return; const dots = nav.querySelectorAll('.desktop-slider-dot'); if (slides.length <= 1) return; let currentIndex = 0; let autoSlideInterval; function goToSlide(index) { currentIndex = (index + slides.length) % slides.length; slides.forEach((s, i) => s.classList.toggle('active', i === currentIndex)); dots.forEach((d, i) => d.classList.toggle('active', i === currentIndex)); } function startAutoSlide() { stopAutoSlide(); autoSlideInterval = setInterval(() => goToSlide(currentIndex + 1), 7000); } function stopAutoSlide() { clearInterval(autoSlideInterval); } goToSlide(0); startAutoSlide(); nav.addEventListener('click', e => { if (e.target.matches('.desktop-slider-dot')) { stopAutoSlide(); goToSlide(parseInt(e.target.dataset.index)); startAutoSlide(); } }); }); }
function initMobileSliders() { document.querySelectorAll('.language-slider-block').forEach(sliderBlock => { const slider = sliderBlock.querySelector('.cross-fade-slider'); const slides = slider.querySelectorAll('.item-card'); const nav = sliderBlock.querySelector('.slider-nav'); const dots = nav.querySelectorAll('.slider-dot'); if (slides.length <= 1) return; let currentIndex = 0; let touchStartX = 0; let autoSlideInterval; function goToSlide(index) { currentIndex = (index + slides.length) % slides.length; slides.forEach((s, i) => s.classList.toggle('active', i === currentIndex)); dots.forEach((d, i) => d.classList.toggle('active', i === currentIndex)); } function startAutoSlide() { stopAutoSlide(); autoSlideInterval = setInterval(() => goToSlide(currentIndex + 1), 5000); } function stopAutoSlide() { clearInterval(autoSlideInterval); } goToSlide(0); startAutoSlide(); nav.addEventListener('click', e => { if (e.target.matches('.slider-dot')) { stopAutoSlide(); goToSlide(parseInt(e.target.dataset.index)); startAutoSlide(); } }); slider.addEventListener('touchstart', e => { touchStartX = e.changedTouches[0].screenX; stopAutoSlide(); }, { passive: true }); slider.addEventListener('touchend', e => { const touchEndX = e.changedTouches[0].screenX; const swipeThreshold = 40; if (touchEndX < touchStartX - swipeThreshold) { goToSlide(currentIndex + 1); } else if (touchEndX > touchStartX + swipeThreshold) { goToSlide(currentIndex - 1); } startAutoSlide(); }, { passive: true }); }); }

function scrollToElementWithOffset(elementId, offset = 120) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    const elementTop = element.getBoundingClientRect().top + window.pageYOffset;
    const targetPosition = elementTop - offset;
    
    window.scrollTo({
        top: targetPosition,
        behavior: 'smooth'
    });
}

// --- ROUTER & NAVIGATION LOGIC ---

async function navigateToHome(hash = '') {
    try {
        // Fetch the index.html content directly
        const response = await fetch('/'); 
        if (!response.ok) throw new Error('Failed to fetch home page');
        const htmlText = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlText, 'text/html');
        
        // Replace main content
        const newMain = doc.querySelector('main');
        if (newMain) {
            mainContentEl.innerHTML = newMain.innerHTML;
            mainContentEl.classList.remove('loading');
            document.title = doc.querySelector('title')?.textContent || 'Digital Craft';
        }

        // Apply custom background from home data
        applyCustomBackground(siteData.home);

        // Hydrate home page content with fetched data (sliders etc.)
        hydrateHomePageContent();

        // NEW: Initialize carousel on home page too, if present
        initializeCarousel();

        // Handle hero animations for immediate visibility
        requestAnimationFrame(() => {
            const heroTitle = document.querySelector('.hero h1');
            const heroSubtitle = document.querySelector('.hero-subtitle-container');
            if (heroTitle) { heroTitle.classList.add('is-visible'); } // Ensure it's visible
            if (heroSubtitle) { heroSubtitle.classList.add('is-visible'); } // Ensure it's visible
        });


        if (hash) {
            // Scroll to hash after content is rendered and observers are set up
            setTimeout(() => {
                scrollToElementWithOffset(hash.substring(1), 120);
            }, 100);
        }
    } catch (error) {
        console.error("Failed to navigate to home, reloading:", error);
        window.location.href = '/';
    } finally {
        // Ensure TOC is hidden on the home page
        const floatingTocWrapper = document.getElementById('floating-toc-wrapper');
        if (floatingTocWrapper) {
            floatingTocWrapper.style.display = 'none';
            const tocContentPanel = document.getElementById('toc-content-panel');
            const tocToggleBtn = document.getElementById('toc-toggle-btn');
            if (tocContentPanel && tocToggleBtn) {
                tocToggleBtn.setAttribute('aria-expanded', 'false');
                tocContentPanel.setAttribute('aria-hidden', 'true');
                tocContentPanel.classList.remove('is-visible');
                tocToggleBtn.classList.remove('is-active');
            }
        }
    }
}

async function routeAndRender(isPopState = false, hash = '') {
    if (typeof ym === 'function' && !isPopState) {
        ym(103413242, 'hit', window.location.href);
    }
    const path = window.location.pathname;
    const detailPageRegex = /^\/(?:([a-z]{2})\/)?(services|portfolio|blog|contact)\/([a-zA-Z0-9-]+)\/?$/;
    const match = path.match(detailPageRegex);

    if (match) {
        const [, lang, collection, slug] = match;
        renderDetailPage(collection, slug, lang || 'en');
    } else {
        await navigateToHome(hash || window.location.hash);
    }

    // Call setupObservers AFTER ALL dynamic content (including page content and related posts)
    // has been rendered and necessary animation classes applied.
    requestAnimationFrame(() => { // Use requestAnimationFrame to ensure DOM is ready
        setupObservers(); 
    });
    
    document.documentElement.style.setProperty('--main-visibility', 'visible');
    updateScrollButtonVisibility();
    
    if (!hash && !window.location.hash) {
        window.scrollTo({
            top: 0,
            behavior: 'instant'
        });
    }
}

function handleNavigation(e) {
    const link = e.target.closest('a');
    if (!link || link.target === '_blank' || link.protocol !== window.location.protocol || link.host !== window.location.host || e.metaKey || e.ctrlKey || e.shiftKey) { return; }
    
    const targetUrl = new URL(link.href);
    
    e.preventDefault();
    const menuToggle = document.querySelector('.menu-toggle'); 
    const navOverlay = document.querySelector('.nav-overlay'); 
    const isMenuOpen = document.body.classList.contains('nav-is-open');

    if (isMenuOpen) {
        document.body.classList.remove('nav-is-open'); 
        menuToggle.classList.remove('is-active'); 
        navOverlay.classList.remove('is-active'); 
    }

    const menuCloseDelay = isMenuOpen ? 350 : 0;

    if (targetUrl.pathname === window.location.pathname && targetUrl.hash) {
        setTimeout(() => {
            const hash = targetUrl.hash.substring(1);
            window.history.pushState({}, '', targetUrl.href);
            
            const isTocLink = link.closest('.toc-content-panel');
            const contentPanel = document.getElementById('toc-content-panel');
            const toggleBtn = document.getElementById('toc-toggle-btn');
            
            if (isTocLink && contentPanel && toggleBtn) {
                toggleBtn.setAttribute('aria-expanded', 'false');
                contentPanel.setAttribute('aria-hidden', 'true');
                contentPanel.classList.remove('is-visible');
                toggleBtn.classList.remove('is-active');
            }
            
            scrollToElementWithOffset(hash, 120);
        }, menuCloseDelay);
        return;
    }

    if (targetUrl.href === window.location.href) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
    }

    setTimeout(() => {
        mainContentEl.style.transition = 'opacity 0.4s ease-out';
        mainContentEl.classList.add('is-transitioning');
        
        setTimeout(() => {
            window.history.pushState({}, '', targetUrl.href);
            mainContentEl.style.transition = 'none'; 
            routeAndRender(false, targetUrl.hash); 

            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    mainContentEl.style.transition = 'opacity 0.6s ease-out';
                    mainContentEl.classList.remove('is-transitioning');
                });
            });
        }, 400);
    }, menuCloseDelay);
}


// --- HYDRATION LOGIC ---

function hydrateHomePageContent() {
    const preloadedDataEl = document.getElementById('preloaded-data');
    if (preloadedDataEl) {
        try {
            const preloadedSections = JSON.parse(preloadedDataEl.textContent);
            // Use preloaded data only if siteData for collections is not yet loaded from Firestore.
            // This prioritizes fast initial rendering, but after loadData() always use full data.
            ['services', 'portfolio', 'blog', 'contact'].forEach(key => {
                if (!siteData[key] || siteData[key].length === 0 || !siteData[key][0].h1) { // Check for full data presence
                    siteData[key] = preloadedSections[key] || [];
                }
            });
            preloadedDataEl.remove();
        } catch (e) { console.error("Error parsing preloaded data:", e); }
    }
    
    // Apply home custom background
    applyCustomBackground(siteData.home);

    // Render sections with dynamic content (sliders/grids)
    ['services', 'portfolio', 'blog', 'contact'].forEach(key => {
        renderSection(key, `Our ${key.charAt(0).toUpperCase() + key.slice(1)}`, siteData[key]);
    });
    
    // Initialize sliders after rendering
    initMobileSliders();
    initDesktopCarousels();
    initializeCarousel(); // NEW: Initialize carousel on home page too, if present

    // Ensure dynamically added sliders/grids are immediately visible
    requestAnimationFrame(() => {
        document.querySelectorAll('.desktop-grid-slide.active').forEach(slide => slide.classList.add('is-visible'));
        document.querySelectorAll('.mobile-sliders-container .item-card.active').forEach(card => card.classList.add('is-visible'));
        
        // Also ensure SSR-ed animation targets are observed
        document.querySelectorAll('section h2, .item-card').forEach(el => el.classList.add('animate-on-scroll')); 
    });


    const footer = document.getElementById('site-footer');
    if (footer) {
        footer.style.display = 'block';
        footer.innerHTML = `© ${new Date().getFullYear()} Digital Craft. All rights reserved.`;
        footer.onclick = () => { window.location.href = '/admin.html'; };
    }

    const hash = window.location.hash;
    if (hash) {
        requestAnimationFrame(() => {
            scrollToElementWithOffset(hash.substring(1), 120);
        });
    }
}

async function hydrateStaticPage() {
    renderMenu();
    // Elements on the static page may already have these classes from HTML (SSR)
    // For TOC, if present (which it will be on detail pages now), initialize it
    const floatingTocWrapper = document.getElementById('floating-toc-wrapper');
    if (floatingTocWrapper && floatingTocWrapper.style.display !== 'none') {
        initFloatingTocToggle();
    }
    
    updateScrollButtonVisibility();

    try {
        siteData = await loadData(); // First, load full data
        const path = window.location.pathname;
        const detailPageRegex = /^\/(?:([a-z]{2})\/)?(services|portfolio|blog|contact)\/([a-zA-Z0-9-]+)\/?$/;
        const match = path.match(detailPageRegex);
        if (match) {
            const [, lang, collection, slug] = match;
            const itemLang = lang || 'en';
            const collectionData = siteData[collection] || [];
            const currentItem = collectionData.find && collectionData.find(d => d.urlSlug === slug && d.lang === itemLang);
            if (currentItem) {
                applyCustomBackground(currentItem);
                // Related posts will be rendered dynamically, their classes will be added in renderRelatedPosts
                if (!document.getElementById('related-posts')) {
                    renderRelatedPosts(collection, slug, itemLang);
                }
            }
        } else {
            // This is a direct load of the home page, ensure full data is used for hydration
            hydrateHomePageContent(); 
        }
        initializeCarousel(); // NEW: Initialize carousel after data is loaded and content potentially rendered
    } catch (error) {
        console.error("Background data load failed during hydration:", error);
    }
    // setupObservers will be called from routeAndRender after all rendering is complete.
}

// --- INITIALIZATION ---
function initStaticEventListeners() { 
    document.body.addEventListener('click', handleNavigation); 
    window.addEventListener('popstate', () => routeAndRender(true)); 
    const menuToggle = document.querySelector('.menu-toggle'); 
    const navOverlay = document.querySelector('.nav-overlay'); 
    if (menuToggle && navOverlay) { 
        menuToggle.addEventListener('click', () => { 
            document.body.classList.toggle('nav-is-open'); 
            menuToggle.classList.toggle('is-active'); 
            navOverlay.classList.toggle('is-active'); 
        }); 
    }
    
    mainContentEl.addEventListener('click', function(event) {
        if (event.target.id === 'quiz-submit-button') { calculateQuizResult(); }
        if (event.target.closest('#scroll-to-top-btn')) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });
}

function updateScrollButtonVisibility() {
    const button = document.getElementById('scroll-to-top-btn');
    if (!button) return;
    
    if (window.scrollY > 300) {
        button.classList.add('visible');
    } else {
        button.classList.remove('visible');
    }
}

function initScrollListener() {
    window.addEventListener('scroll', updateScrollButtonVisibility, { passive: true });
}

async function initApp() { 
    firebase.initializeApp(firebaseConfig); 
    db = firebase.firestore(); 
    
    initStaticEventListeners();
    initScrollListener();

    const isStaticPage = document.body.dataset.staticPage === 'true'; 
    if (isStaticPage) { 
        await hydrateStaticPage(); // Wait for static page hydration to complete
        // For static pages, routeAndRender will be called once after initial load completes.
        requestAnimationFrame(() => routeAndRender(false, window.location.hash));
    } else { 
        try { 
            siteData = await loadData(); 
            renderMenu(); 
            await routeAndRender(); // Wait for routing to complete
        } catch (error) { 
            console.error("Failed to initialize app:", error); 
            mainContentEl.innerHTML = "<h1>Error loading site data. Please try again later.</h1>"; 
        } 
    } 
}
window.addEventListener('DOMContentLoaded', initApp);