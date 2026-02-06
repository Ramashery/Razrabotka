// --- FIREBASE CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyAT4dDEIDUtzP60ibjahO06P75Q6h95ZN4",
    authDomain: "razrabotka-b61bc.firebaseapp.com",
    projectId: "razrabotka-b61bc",
    storageBucket: "razrabotka-b61bc.firebasestorage.app",
    messagingSenderId: "394402564794",
    appId: "1:394402564794:web:f610ffb03e655c600c5083"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// --- STATE ---
let siteData = {};
const defaultLang = 'en';
const supportedLangs = ['en', 'ka', 'ru', 'uk']; 

// --- DATA LOADING ---
async function loadData() {
    const freshSiteData = {};
    try {
        const collections = ['services', 'portfolio', 'blog', 'contact', 'carouselItems'];
        const dataPromises = [
            db.collection('home').doc('content').get(),
            ...collections.map(col => {
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
                    console.error('Failed to parse schemaJsonLd string:', e);
                    data.schemaJsonLd = {};
                }
            }
            return data;
        };

        freshSiteData.home = homeDoc.exists ? processDocData(homeDoc.data()) : {};
        collections.forEach((col, index) => {
            freshSiteData[col] = snapshots[index].docs.map(doc => ({ id: doc.id, ...processDocData(doc.data()) }));
        });
        return freshSiteData;
    } catch (error) {
        console.error("Error loading data from Firebase:", error);
        alert("Error loading data. Check console.");
        return {};
    }
}

// --- RENDERING FUNCTIONS ---
function renderAdminPanel() {
    renderAdminHome();
    renderAdminSection('services');
    renderAdminSection('portfolio');
    renderAdminSection('blog');
    renderAdminSection('contact');
    renderAdminCarouselItems('carouselItems');
}

function renderAdminHome() { 
    const container = document.querySelector('.tab-content[data-tab-content="home"]'); 
    if(!container) return; 
    const data = siteData.home || {}; 
    const dateValue = data.lastModified ? data.lastModified.substring(0, 10) : '';

    container.innerHTML = `<div class="admin-section-header"><h2>Home Page Content & SEO</h2></div><div class="admin-item" id="admin-home-item"><div class="admin-item-content"><h4>Visible Content</h4><label for="home-h1">Main Header (H1)</label><input type="text" id="home-h1" value="${data.h1 || ''}" disabled><label for="home-subtitle">Subtitle</label><textarea id="home-subtitle" rows="3" disabled>${data.subtitle || ''}</textarea>
    <label for="home-lastModified" style="color:var(--color-accent); margin-top:15px; border-top:1px solid var(--color-border); padding-top:10px;">Sitemap Last Modified (Leave empty for today)</label>
    <input type="date" id="home-lastModified" value="${dateValue}" disabled>
    <h4>Critical SEO</h4><label for="home-lang">Language (e.g., en, ru)</label><input type="text" id="home-lang" value="${data.lang || 'en'}" disabled><label for="home-seoTitle">SEO Title Tag (&lt; 60 chars)</label><input type="text" id="home-seoTitle" value="${data.seoTitle || ''}" disabled><label for="home-metaDescription">Meta Description (&lt; 160 chars)</label><textarea id="home-metaDescription" rows="3" disabled>${data.metaDescription || ''}</textarea><h4>Schema.org for Organization</h4><label>JSON-LD Code</label><textarea id="home-schemaJsonLd" rows="8" disabled>${typeof data.schemaJsonLd === 'object' ? JSON.stringify(data.schemaJsonLd, null, 2) : data.schemaJsonLd || '{}'}</textarea><h4>Social Media Sharing (Open Graph)</h4><label for="home-ogTitle">OG Title</label><input type="text" id="home-ogTitle" value="${data.ogTitle || ''}" disabled><label for="home-ogDescription">OG Description</label><textarea id="home-ogDescription" rows="3" disabled>${data.ogDescription || ''}</textarea><label for="home-ogImage">OG Image URL (1200x630px recommended)</label><input type="text" id="home-ogImage" value="${data.ogImage || ''}" disabled><h4>Custom Background</h4><label for="home-backgroundHtml">Custom Background HTML/JS/CSS (leave empty for default animation)</label><textarea id="home-backgroundHtml" rows="10" disabled>${data.backgroundHtml || ''}</textarea></div><div class="admin-item-actions"><button class="admin-btn edit-btn" data-action="edit-home">Edit</button><button class="admin-btn save-btn" data-action="save-home">Save</button></div></div>`;
};

function generateAdminItemFormHTML(item, key) { 
    const isArchived = item.status === 'archived';
    const archiveBtnText = isArchived ? 'Unarchive (Publish)' : 'Archive (Hide)';
    
    const langOptions = supportedLangs.map(langCode => 
        `<option value="${langCode}" ${item.lang === langCode ? 'selected' : ''}>${langCode.toUpperCase()}</option>`
    ).join('');

    return `<div class="admin-item" data-id="${item.id}" data-key="${key}" data-status="${item.status || 'published'}">
    <div class="admin-item-content">
        <h4>Card Content (On Home Page)</h4><label>Card Title</label><input type="text" class="admin-input-title" value="${item.title || ''}" disabled><label>Card Subtitle / Date</label><input type="text" class="admin-input-subtitle" value="${item.subtitle || ''}" disabled><label>Card Description</label><textarea class="admin-input-description" rows="3" disabled>${item.description || ''}</textarea><h4>Detailed Page Content</h4><label>Language</label><select class="admin-input-lang" disabled>${langOptions}</select>
    
        <label>Region for Hreflang (e.g., GE, AZ, AM)</label>
        <input type="text" class="admin-input-region" value="${item.region || ''}" placeholder="GE" disabled>

        <label>Page URL Slug</label><input type="text" class="admin-input-urlSlug" value="${item.urlSlug || ''}" disabled><label>Page Main Header (H1)</label><input type="text" class="admin-input-h1" value="${item.h1 || ''}" disabled><label>Price / Budget</label><input type="text" class="admin-input-price" value="${item.price || ''}" disabled><label>Main Page Content</label><textarea class="admin-input-mainContent" rows="8" disabled>${item.mainContent || ''}</textarea><label>Media (URLs, one per line)</label><textarea class="admin-input-media" rows="4" disabled>${(item.media || []).join('\n')}</textarea><label>Main Image Alt Text</label><input type="text" class="admin-input-mainImageAlt" value="${item.mainImageAlt || ''}" disabled>
        
        <h4>SEO & Metadata</h4>
        <label>SEO Title Tag</label><input type="text" class="admin-input-seoTitle" value="${item.seoTitle || ''}" disabled>
        <label>Meta Description</label><textarea class="admin-input-metaDescription" rows="3" disabled>${item.metaDescription || ''}</textarea>
        
        <h4>Sitemap & Translation</h4>
        <label>Translation Group Key</label><input type="text" class="admin-input-translationGroupKey" value="${item.translationGroupKey || ''}" disabled>
        <label>Last Modified</label><input type="date" class="admin-input-lastModified" value="${(item.lastModified || '').substring(0, 10)}" disabled>
        <label>Priority</label><input type="number" step="0.1" class="admin-input-sitemapPriority" value="${item.sitemapPriority || '0.7'}" disabled>
        <label>Change Frequency</label>
        <select class="admin-input-sitemapChangefreq" disabled>
            <option value="monthly" ${!item.sitemapChangefreq || item.sitemapChangefreq === 'monthly' ? 'selected' : ''}>Monthly</option>
            <option value="weekly" ${item.sitemapChangefreq === 'weekly' ? 'selected' : ''}>Weekly</option>
            <option value="yearly" ${item.sitemapChangefreq === 'yearly' ? 'selected' : ''}>Yearly</option>
        </select>
        <label>Schema.org JSON-LD</label><textarea class="admin-input-schemaJsonLd" rows="5" disabled>${typeof item.schemaJsonLd === 'object' ? JSON.stringify(item.schemaJsonLd, null, 2) : item.schemaJsonLd || '{}'}</textarea>
        
        <h4>Social Media (OG)</h4>
        <label>OG Title</label><input type="text" class="admin-input-ogTitle" value="${item.ogTitle || ''}" disabled>
        <label>OG Description</label><textarea class="admin-input-ogDescription" rows="2" disabled>${item.ogDescription || ''}</textarea>
        <label>OG Image URL</label><input type="text" class="admin-input-ogImage" value="${item.ogImage || ''}" disabled>
        <label>Custom Background</label><textarea class="admin-input-backgroundHtml" rows="6" disabled>${item.backgroundHtml || ''}</textarea>
    
    </div>
    <div class="admin-item-actions">
        <button class="admin-btn edit-btn" data-action="edit">Edit</button>
        <button class="admin-btn save-btn" data-action="save">Save</button>
        <button class="admin-btn archive-btn" data-action="archive">${archiveBtnText}</button>
        <button class="admin-btn delete-btn" data-action="delete">Delete Forever</button>
    </div>
    </div>`; 
}

function renderAdminSection(key) { 
    const container = document.querySelector(`.tab-content[data-tab-content="${key}"]`); 
    if (!container) return; 
    
    const title = key.charAt(0).toUpperCase() + key.slice(1); 
    const items = siteData[key] || []; 
    const langOrder = ['en', 'ka', 'ru', 'uk']; 
    const langNames = { en: 'English', ka: 'Georgian', ru: 'Russian', uk: 'Ukrainian' }; 
    const groupedItems = {}; 
    
    items.forEach(item => { 
        const lang = item.lang || defaultLang; 
        if (!groupedItems[lang]) groupedItems[lang] = []; 
        groupedItems[lang].push(item); 
    }); 
    
    const listsHTML = langOrder.map(lang => { 
        if (!groupedItems[lang] || groupedItems[lang].length === 0) return ''; 
        
        const itemsListHTML = groupedItems[lang]
            .sort((a, b) => (a.title || '').localeCompare(b.title || ''))
            .map(item => {
                const archivedClass = item.status === 'archived' ? 'is-archived' : '';
                return `<li class="admin-list-item ${archivedClass}" data-id="${item.id}" data-key="${key}" data-status="${item.status || 'published'}">${item.title || 'No Title'}<span class="admin-list-item-slug">(/${item.urlSlug || 'no-slug'})</span></li>`;
            })
            .join(''); 
            
        return `<div class="admin-lang-group"><h4>${langNames[lang]} (${lang})</h4><ul class="admin-item-list">${itemsListHTML}</ul></div>`; 
    }).join(''); 
    
    container.innerHTML = `<div class="admin-section-header"><h2>Manage ${title}</h2><button class="admin-btn" data-action="add" data-key="${key}">+ Add New</button></div>${listsHTML}<div class="admin-item-editor-container"></div>`; 
};

// NEW: Функция для генерации HTML формы для элемента карусели
function generateAdminCarouselItemFormHTML(item, key) {
    const isArchived = item.status === 'archived';
    const archiveBtnText = isArchived ? 'Unarchive (Publish)' : 'Archive (Hide)';
    
    const langOptions = supportedLangs.map(langCode => 
        `<option value="${langCode}" ${item.lang === langCode ? 'selected' : ''}>${langCode.toUpperCase()}</option>`
    ).join('');

    return `<div class="admin-item" data-id="${item.id}" data-key="${key}" data-status="${item.status || 'published'}">
        <div class="admin-item-content">
            <h4>Carousel Slide Content</h4>
            <label>Language</label>
            <select class="admin-input-lang" disabled>${langOptions}</select>
            
            <label>Order (for sorting)</label>
            <input type="number" class="admin-input-order" value="${item.order || 0}" disabled>
            
            <!-- NEW: Поле для ключа группы -->
            <label>Group Key (e.g. 'project-gallery', 'team'). Default: 'default'</label>
            <input type="text" class="admin-input-groupKey" value="${item.groupKey || 'default'}" placeholder="default" disabled>
            
            <label>Image URL</label>
            <input type="text" class="admin-input-imageUrl" value="${item.imageUrl || ''}" disabled>
            <label>Title</label>
            <input type="text" class="admin-input-title" value="${item.title || ''}" disabled>
            <label>Kicker (Subtitle)</label>
            <input type="text" class="admin-input-kicker" value="${item.kicker || ''}" disabled>
            <label>Description</label>
            <textarea class="admin-input-description" rows="3" disabled>${item.description || ''}</textarea>
            <label>Button Text</label>
            <input type="text" class="admin-input-buttonText" value="${item.buttonText || ''}" disabled>
            <label>Button Link</label>
            <input type="text" class="admin-input-buttonLink" value="${item.buttonLink || ''}" disabled>
        </div>
        <div class="admin-item-actions">
            <button class="admin-btn edit-btn" data-action="edit">Edit</button>
            <button class="admin-btn save-btn" data-action="save">Save</button>
            <button class="admin-btn archive-btn" data-action="archive">${archiveBtnText}</button>
            <button class="admin-btn delete-btn" data-action="delete">Delete Forever</button>
        </div>
    </div>`;
}

// NEW: Функция для рендеринга секции элементов карусели в админ-панели
function renderAdminCarouselItems(key) {
    const container = document.querySelector(`.tab-content[data-tab-content="${key}"]`);
    if (!container) return;

    const title = 'Carousel Items';
    const items = siteData[key] || [];
    const langOrder = ['en', 'ka', 'ru', 'uk'];
    const langNames = { en: 'English', ka: 'Georgian', ru: 'Russian', uk: 'Ukrainian' };
    const groupedItems = {};

    items.forEach(item => {
        const lang = item.lang || defaultLang;
        if (!groupedItems[lang]) groupedItems[lang] = [];
        groupedItems[lang].push(item);
    });

    const listsHTML = langOrder.map(lang => {
        if (!groupedItems[lang] || groupedItems[lang].length === 0) return '';
        
        const itemsListHTML = groupedItems[lang]
            .sort((a, b) => (a.order || 0) - (b.order || 0)) // Сортировка по полю 'order'
            .map(item => {
                const archivedClass = item.status === 'archived' ? 'is-archived' : '';
                const groupKey = item.groupKey || 'default';
                return `<li class="admin-list-item ${archivedClass}" data-id="${item.id}" data-key="${key}" data-status="${item.status || 'published'}">${item.title || 'No Title'}<span class="admin-list-item-slug"> (Group: ${groupKey}, Order: ${item.order || 0})</span></li>`;
            })
            .join('');
            
        return `<div class="admin-lang-group"><h4>${langNames[lang]} (${lang})</h4><ul class="admin-item-list">${itemsListHTML}</ul></div>`;
    }).join('');
    
    container.innerHTML = `<div class="admin-section-header"><h2>Manage ${title}</h2><button class="admin-btn" data-action="add" data-key="${key}">+ Add New</button></div>${listsHTML}<div class="admin-item-editor-container"></div>`;
}


// --- ACTIONS & EVENT HANDLERS ---
async function handleAdminActions(e) { 
    const target = e.target; 
    const action = target.dataset.action; 
    if (!action) return; 
    const itemEl = target.closest('.admin-item'); 
    
    const setEditingState = (el, isEditing) => { 
        el.classList.toggle('is-editing', isEditing); 
        el.querySelectorAll('input, textarea, select').forEach(input => input.disabled = !isEditing); 
    }; 
    
    try { 
        if (action === 'edit-home') { 
            setEditingState(itemEl, true); 
            return; 
        } 
        
        if (action === 'save-home') { 
            setEditingState(itemEl, false); 
            let schemaValue = itemEl.querySelector('#home-schemaJsonLd').value; 
            try { schemaValue = JSON.parse(schemaValue); } catch(err) { console.error("Invalid JSON in home schema", err); alert("Error: Invalid JSON in Schema field."); return; } 
            
            const dateInput = itemEl.querySelector('#home-lastModified').value;
            const lastModifiedIso = dateInput ? new Date(dateInput).toISOString() : new Date().toISOString();

            const updatedData = { 
                h1: itemEl.querySelector('#home-h1').value, 
                subtitle: itemEl.querySelector('#home-subtitle').value, 
                lastModified: lastModifiedIso,
                lang: itemEl.querySelector('#home-lang').value, 
                seoTitle: itemEl.querySelector('#home-seoTitle').value, 
                metaDescription: itemEl.querySelector('#home-metaDescription').value, 
                schemaJsonLd: schemaValue, 
                ogTitle: itemEl.querySelector('#home-ogTitle').value, 
                ogDescription: itemEl.querySelector('#home-ogDescription').value, 
                ogImage: itemEl.querySelector('#home-ogImage').value, 
                backgroundHtml: itemEl.querySelector('#home-backgroundHtml').value, 
            }; 
            await db.collection('home').doc('content').update(updatedData); 
            siteData = await loadData(); 
            renderAdminPanel(); 
            alert('Home page updated!'); 
            return; 
        } 

        const key = target.dataset.key || (itemEl ? itemEl.dataset.key : null);
        const id = itemEl ? itemEl.dataset.id : null; 
        
        switch(action) { 
            case 'edit': 
                setEditingState(itemEl, true); 
                break; 

            case 'archive': {
                const currentStatus = itemEl.dataset.status;
                const newStatus = currentStatus === 'archived' ? 'published' : 'archived';
                const confirmMsg = newStatus === 'archived' 
                    ? "Архивировать эту страницу? Она исчезнет с сайта при следующей сборке, но останется в базе." 
                    : "Восстановить (опубликовать) эту страницу?";
                
                if (confirm(confirmMsg)) {
                    await db.collection(key).doc(id).update({ status: newStatus });
                    siteData = await loadData();
                    renderAdminPanel();
                    alert(`Страница переведена в статус: ${newStatus.toUpperCase()}`);
                }
                break;
            }
            
            case 'save': { 
                setEditingState(itemEl, false); 
                let updatedData;

                if (key === 'carouselItems') { 
                    updatedData = {
                        lang: itemEl.querySelector('.admin-input-lang').value,
                        order: parseInt(itemEl.querySelector('.admin-input-order').value) || 0,
                        groupKey: itemEl.querySelector('.admin-input-groupKey').value.trim() || 'default', // NEW: Сохранение groupKey
                        imageUrl: itemEl.querySelector('.admin-input-imageUrl').value,
                        title: itemEl.querySelector('.admin-input-title').value,
                        kicker: itemEl.querySelector('.admin-input-kicker').value,
                        description: itemEl.querySelector('.admin-input-description').value,
                        buttonText: itemEl.querySelector('.admin-input-buttonText').value,
                        buttonLink: itemEl.querySelector('.admin-input-buttonLink').value,
                        status: itemEl.dataset.status || 'published'
                    };
                } else { 
                    let schemaValue = itemEl.querySelector('.admin-input-schemaJsonLd').value; 
                    try { schemaValue = JSON.parse(schemaValue); } catch(err) { console.error("Invalid JSON in item schema", err); alert("Error: Invalid JSON in Schema field."); return; } 
                    
                    const dateValue = itemEl.querySelector('.admin-input-lastModified').value;
                    updatedData = { 
                        lang: itemEl.querySelector('.admin-input-lang').value, 
                        region: itemEl.querySelector('.admin-input-region').value.trim().toUpperCase(),
                        title: itemEl.querySelector('.admin-input-title').value, 
                        subtitle: itemEl.querySelector('.admin-input-subtitle').value, 
                        description: itemEl.querySelector('.admin-input-description').value, 
                        urlSlug: itemEl.querySelector('.admin-input-urlSlug').value.trim(), 
                        h1: itemEl.querySelector('.admin-input-h1').value, 
                        price: itemEl.querySelector('.admin-input-price').value, 
                        mainContent: itemEl.querySelector('.admin-input-mainContent').value, 
                        media: itemEl.querySelector('.admin-input-media').value.split('\n').map(s => s.trim()).filter(Boolean), 
                        mainImageAlt: itemEl.querySelector('.admin-input-mainImageAlt').value, 
                        seoTitle: itemEl.querySelector('.admin-input-seoTitle').value, 
                        metaDescription: itemEl.querySelector('.admin-input-metaDescription').value, 
                        schemaJsonLd: schemaValue, 
                        ogTitle: itemEl.querySelector('.admin-input-ogTitle').value, 
                        ogDescription: itemEl.querySelector('.admin-input-ogDescription').value, 
                        ogImage: itemEl.querySelector('.admin-input-ogImage').value, 
                        backgroundHtml: itemEl.querySelector('.admin-input-backgroundHtml').value, 
                        translationGroupKey: itemEl.querySelector('.admin-input-translationGroupKey').value.trim(),
                        sitemapPriority: itemEl.querySelector('.admin-input-sitemapPriority').value,
                        sitemapChangefreq: itemEl.querySelector('.admin-input-sitemapChangefreq').value,
                        lastModified: dateValue ? new Date(dateValue).toISOString() : new Date().toISOString(),
                        status: itemEl.dataset.status || 'published'
                    }; 
                }
                
                await db.collection(key).doc(id).update(updatedData); 
                siteData = await loadData(); 
                renderAdminPanel(); 
                alert('Item saved!'); 
                break; 
            } 
            case 'delete': 
                if (confirm('ВНИМАНИЕ: Вы уверены, что хотите УДАЛИТЬ эту страницу НАВСЕГДА?\n\nВосстановить её будет невозможно.\n\nЛучше используйте кнопку "Archive".')) { 
                    if (confirm('Подтвердите удаление еще раз. Данные будут стерты из базы.')) {
                        await db.collection(key).doc(id).delete(); 
                        siteData = await loadData(); 
                        renderAdminPanel(); 
                        alert('Страница удалена безвозвратно.'); 
                    }
                } 
                break; 
            case 'add': 
                const newId = `${key.slice(0, -1)}-${Date.now()}`; 
                let newItemData;
                if (key === 'carouselItems') { 
                    newItemData = {
                        lang: defaultLang,
                        order: siteData[key].length,
                        groupKey: 'default', // NEW: Ключ по умолчанию
                        imageUrl: 'https://picsum.photos/id/1000/1600/1000',
                        title: 'New Carousel Slide',
                        kicker: 'A catchy subtitle',
                        description: 'Brief description of the slide content.',
                        buttonText: 'Learn More',
                        buttonLink: '#',
                        status: 'published'
                    };
                } else { 
                    const newTitle = 'New Item Title'; 
                    const newSlug = newTitle.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''); 
                    newItemData = { 
                        lang: defaultLang, 
                        region: '',
                        urlSlug: newSlug, 
                        title: newTitle, 
                        subtitle: 'New Subtitle', 
                        description: 'A short description for the card.', 
                        h1: newTitle, 
                        mainContent: 'Full content for the detailed page.\n\nHTML and paragraph breaks are supported!', 
                        price: '', 
                        media: [], 
                        mainImageAlt: '', 
                        seoTitle: newTitle, 
                        metaDescription: '', 
                        schemaJsonLd: {}, 
                        backgroundHtml: '', 
                        ogImage: '', 
                        ogTitle: '', 
                        ogDescription: '',
                        status: 'published'
                    }; 
                }
                await db.collection(key).doc(newId).set(newItemData); 
                siteData = await loadData(); 
                renderAdminPanel(); 
                alert('New item added. You can now edit it.'); 
                break; 
        } 
    } catch(error) { 
        console.error("Admin action failed:", error); 
        alert("An error occurred. Please check the console."); 
    }
};

function initAdminEventListeners() {
    document.querySelector('.admin-tabs').addEventListener('click', e => {
        if (e.target.matches('.admin-tab')) {
            document.querySelectorAll('.admin-tab, .tab-content').forEach(el => el.classList.remove('active'));
            e.target.classList.add('active');
            document.querySelector(`.tab-content[data-tab-content="${e.target.dataset.tab}"]`).classList.add('active');
        }
    });

    document.querySelector('.admin-content').addEventListener('click', e => {
        const listItem = e.target.closest('.admin-list-item');
        if (listItem) {
            const id = listItem.dataset.id;
            const key = listItem.dataset.key;
            const itemData = siteData[key]?.find(i => i.id === id);
            if (itemData) {
                const tabContent = listItem.closest('.tab-content');
                tabContent.querySelectorAll('.admin-list-item').forEach(el => el.classList.remove('selected'));
                listItem.classList.add('selected');
                const editorContainer = tabContent.querySelector('.admin-item-editor-container');
                if (key === 'carouselItems') {
                    editorContainer.innerHTML = generateAdminCarouselItemFormHTML(itemData, key);
                } else {
                    editorContainer.innerHTML = generateAdminItemFormHTML(itemData, key);
                }
            }
            return;
        }
        handleAdminActions(e);
    });

    document.getElementById('logout-btn').addEventListener('click', () => {
        auth.signOut();
    });
}

// --- INITIALIZATION ---
function showAdminPanel() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('admin-panel').classList.add('logged-in');
}

function showLoginScreen() {
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('admin-panel').classList.remove('logged-in');
}

async function initializeAdminApp() {
    showAdminPanel();
    initAdminEventListeners();
    siteData = await loadData();
    renderAdminPanel();
}

auth.onAuthStateChanged(user => {
    if (user) {
        initializeAdminApp();
    } else {
        showLoginScreen();
    }
});

document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');
    errorEl.textContent = '';

    try {
        await auth.signInWithEmailAndPassword(email, password);
    } catch (error) {
        console.error("Admin login failed:", error.message);
        errorEl.textContent = "Login failed. Check email/password.";
    }
});