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

// --- DATA LOADING ---
async function loadData() {
    const freshSiteData = {};
    try {
        const collections = ['services', 'portfolio', 'blog', 'contact'];
        const dataPromises = [
            db.collection('home').doc('content').get(),
            ...collections.map(col => db.collection(col).get())
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
}
function renderAdminHome() { const container = document.querySelector('.tab-content[data-tab-content="home"]'); if(!container) return; const data = siteData.home || {}; container.innerHTML = `<div class="admin-section-header"><h2>Home Page Content & SEO</h2></div><div class="admin-item" id="admin-home-item"><div class="admin-item-content"><h4>Visible Content</h4><label for="home-h1">Main Header (H1)</label><input type="text" id="home-h1" value="${data.h1 || ''}" disabled><label for="home-subtitle">Subtitle</label><textarea id="home-subtitle" rows="3" disabled>${data.subtitle || ''}</textarea><h4>Critical SEO</h4><label for="home-lang">Language (e.g., en, ru)</label><input type="text" id="home-lang" value="${data.lang || 'en'}" disabled><label for="home-seoTitle">SEO Title Tag (&lt; 60 chars)</label><input type="text" id="home-seoTitle" value="${data.seoTitle || ''}" disabled><label for="home-metaDescription">Meta Description (&lt; 160 chars)</label><textarea id="home-metaDescription" rows="3" disabled>${data.metaDescription || ''}</textarea><h4>Schema.org for Organization</h4><label>JSON-LD Code</label><textarea id="home-schemaJsonLd" rows="8" disabled>${typeof data.schemaJsonLd === 'object' ? JSON.stringify(data.schemaJsonLd, null, 2) : data.schemaJsonLd || '{}'}</textarea><h4>Social Media Sharing (Open Graph)</h4><label for="home-ogTitle">OG Title</label><input type="text" id="home-ogTitle" value="${data.ogTitle || ''}" disabled><label for="home-ogDescription">OG Description</label><textarea id="home-ogDescription" rows="3" disabled>${data.ogDescription || ''}</textarea><label for="home-ogImage">OG Image URL (1200x630px recommended)</label><input type="text" id="home-ogImage" value="${data.ogImage || ''}" disabled><h4>Custom Background</h4><label for="home-backgroundHtml">Custom Background HTML/JS/CSS (leave empty for default animation)</label><textarea id="home-backgroundHtml" rows="10" disabled>${data.backgroundHtml || ''}</textarea></div><div class="admin-item-actions"><button class="admin-btn edit-btn" data-action="edit-home">Edit</button><button class="admin-btn save-btn" data-action="save-home">Save</button></div></div>`;};
function generateAdminItemFormHTML(item, key) { return `<div class="admin-item" data-id="${item.id}" data-key="${key}"><div class="admin-item-content"><h4>Card Content (On Home Page)</h4><label>Card Title</label><input type="text" class="admin-input-title" value="${item.title || ''}" disabled><label>Card Subtitle / Date</label><input type="text" class="admin-input-subtitle" value="${item.subtitle || ''}" disabled><label>Card Description</label><textarea class="admin-input-description" rows="3" disabled>${item.description || ''}</textarea><h4>Detailed Page Content</h4><label>Language</label><select class="admin-input-lang" disabled><option value="en" ${item.lang === 'en' ? 'selected' : ''}>English (en)</option><option value="ru" ${item.lang === 'ru' ? 'selected' : ''}>Русский (ru)</option><option value="ka" ${item.lang === 'ka' ? 'selected' : ''}>Georgian (ka)</option><option value="ua" ${item.lang === 'ua' ? 'selected' : ''}>Ukrainian (ua)</option></select><label>Page URL Slug</label><input type="text" class="admin-input-urlSlug" value="${item.urlSlug || ''}" disabled><label>Page Main Header (H1)</label><input type="text" class="admin-input-h1" value="${item.h1 || ''}" disabled><label>Price / Budget</label><input type="text" class="admin-input-price" value="${item.price || ''}" disabled><label>Main Page Content (Supports HTML and paragraph breaks)</label><textarea class="admin-input-mainContent" rows="8" disabled>${item.mainContent || ''}</textarea><label>Media (URLs, one per line)</label><textarea class="admin-input-media" rows="4" disabled>${(item.media || []).join('\n')}</textarea><label>Main Image Alt Text</label><input type="text" class="admin-input-mainImageAlt" value="${item.mainImageAlt || ''}" disabled><h4>SEO & Metadata</h4><label>SEO Title Tag</label><input type="text" class="admin-input-seoTitle" value="${item.seoTitle || ''}" disabled><label>Meta Description</label><textarea class="admin-input-metaDescription" rows="3" disabled>${item.metaDescription || ''}</textarea><label>Schema.org JSON-LD</label><textarea class="admin-input-schemaJsonLd" rows="5" disabled>${typeof item.schemaJsonLd === 'object' ? JSON.stringify(item.schemaJsonLd, null, 2) : item.schemaJsonLd || '{}'}</textarea><h4>Social Media Sharing (Open Graph)</h4><label>OG Title (If different from SEO Title)</label><input type="text" class="admin-input-ogTitle" value="${item.ogTitle || ''}" disabled><label>OG Description (If different from Meta Description)</label><textarea class="admin-input-ogDescription" rows="2" disabled>${item.ogDescription || ''}</textarea><label>OG Image URL (1200x630px recommended)</label><input type="text" class="admin-input-ogImage" value="${item.ogImage || ''}" disabled><h4>Custom Background</h4><label>Custom Page Background HTML/JS/CSS</label><textarea class="admin-input-backgroundHtml" rows="6" disabled>${item.backgroundHtml || ''}</textarea></div><div class="admin-item-actions"><button class="admin-btn edit-btn" data-action="edit">Edit</button><button class="admin-btn save-btn" data-action="save">Save</button><button class="admin-btn delete-btn" data-action="delete">Delete</button></div></div>`; }
function renderAdminSection(key) { const container = document.querySelector(`.tab-content[data-tab-content="${key}"]`); if (!container) return; const title = key.charAt(0).toUpperCase() + key.slice(1); const items = siteData[key] || []; const langOrder = ['en', 'ka', 'ru', 'ua']; const langNames = { en: 'English', ka: 'Georgian', ru: 'Russian', ua: 'Ukrainian' }; const groupedItems = {}; items.forEach(item => { const lang = item.lang || defaultLang; if (!groupedItems[lang]) groupedItems[lang] = []; groupedItems[lang].push(item); }); const listsHTML = langOrder.map(lang => { if (!groupedItems[lang] || groupedItems[lang].length === 0) return ''; const itemsListHTML = groupedItems[lang].sort((a, b) => (a.title || '').localeCompare(b.title || '')).map(item => `<li class="admin-list-item" data-id="${item.id}" data-key="${key}">${item.title || 'No Title'}<span class="admin-list-item-slug">(/${item.urlSlug || 'no-slug'})</span></li>`).join(''); return `<div class="admin-lang-group"><h4>${langNames[lang]} (${lang})</h4><ul class="admin-item-list">${itemsListHTML}</ul></div>`; }).join(''); container.innerHTML = `<div class="admin-section-header"><h2>Manage ${title}</h2><button class="admin-btn" data-action="add" data-key="${key}">+ Add New</button></div>${listsHTML}<div class="admin-item-editor-container"></div>`; };

// --- ACTIONS & EVENT HANDLERS ---
async function handleAdminActions(e) { const target = e.target; const action = target.dataset.action; if (!action) return; const itemEl = target.closest('.admin-item'); const setEditingState = (el, isEditing) => { el.classList.toggle('is-editing', isEditing); el.querySelectorAll('input, textarea, select').forEach(input => input.disabled = !isEditing); }; try { if (action === 'edit-home') { setEditingState(itemEl, true); return; } if (action === 'save-home') { setEditingState(itemEl, false); let schemaValue = itemEl.querySelector('#home-schemaJsonLd').value; try { schemaValue = JSON.parse(schemaValue); } catch(err) { console.error("Invalid JSON in home schema", err); alert("Error: Invalid JSON in Schema field."); return; } const updatedData = { h1: itemEl.querySelector('#home-h1').value, subtitle: itemEl.querySelector('#home-subtitle').value, lang: itemEl.querySelector('#home-lang').value, seoTitle: itemEl.querySelector('#home-seoTitle').value, metaDescription: itemEl.querySelector('#home-metaDescription').value, schemaJsonLd: schemaValue, ogTitle: itemEl.querySelector('#home-ogTitle').value, ogDescription: itemEl.querySelector('#home-ogDescription').value, ogImage: itemEl.querySelector('#home-ogImage').value, backgroundHtml: itemEl.querySelector('#home-backgroundHtml').value, }; await db.collection('home').doc('content').update(updatedData); siteData = await loadData(); renderAdminPanel(); alert('Home page updated!'); return; } const key = target.dataset.key || itemEl.dataset.key; const id = itemEl ? itemEl.dataset.id : null; switch(action) { case 'edit': setEditingState(itemEl, true); break; case 'save': { setEditingState(itemEl, false); let schemaValue = itemEl.querySelector('.admin-input-schemaJsonLd').value; try { schemaValue = JSON.parse(schemaValue); } catch(err) { console.error("Invalid JSON in item schema", err); alert("Error: Invalid JSON in Schema field."); return; } const updatedData = { lang: itemEl.querySelector('.admin-input-lang').value, title: itemEl.querySelector('.admin-input-title').value, subtitle: itemEl.querySelector('.admin-input-subtitle').value, description: itemEl.querySelector('.admin-input-description').value, urlSlug: itemEl.querySelector('.admin-input-urlSlug').value.trim(), h1: itemEl.querySelector('.admin-input-h1').value, price: itemEl.querySelector('.admin-input-price').value, mainContent: itemEl.querySelector('.admin-input-mainContent').value, media: itemEl.querySelector('.admin-input-media').value.split('\n').map(s => s.trim()).filter(Boolean), mainImageAlt: itemEl.querySelector('.admin-input-mainImageAlt').value, seoTitle: itemEl.querySelector('.admin-input-seoTitle').value, metaDescription: itemEl.querySelector('.admin-input-metaDescription').value, schemaJsonLd: schemaValue, ogTitle: itemEl.querySelector('.admin-input-ogTitle').value, ogDescription: itemEl.querySelector('.admin-input-ogDescription').value, ogImage: itemEl.querySelector('.admin-input-ogImage').value, backgroundHtml: itemEl.querySelector('.admin-input-backgroundHtml').value, }; await db.collection(key).doc(id).update(updatedData); siteData = await loadData(); renderAdminPanel(); alert('Item saved!'); break; } case 'delete': if (confirm('Are you sure you want to delete this item?')) { await db.collection(key).doc(id).delete(); siteData = await loadData(); renderAdminPanel(); alert('Item deleted!'); } break; case 'add': const newId = `${key.slice(0, -1)}-${Date.now()}`; const newTitle = 'New Item Title'; const newSlug = newTitle.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''); const newItemData = { lang: defaultLang, urlSlug: newSlug, title: newTitle, subtitle: 'New Subtitle', description: 'A short description for the card.', h1: newTitle, mainContent: 'Full content for the detailed page.\n\nHTML and paragraph breaks are supported!', price: '', media: [], mainImageAlt: '', seoTitle: newTitle, metaDescription: '', schemaJsonLd: {}, backgroundHtml: '', ogImage: '', ogTitle: '', ogDescription: '' }; await db.collection(key).doc(newId).set(newItemData); siteData = await loadData(); renderAdminPanel(); alert('New item added. You can now edit it.'); break; } } catch(error) { console.error("Admin action failed:", error); alert("An error occurred. Please check the console."); }};

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
                editorContainer.innerHTML = generateAdminItemFormHTML(itemData, key);
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
        // onAuthStateChanged will handle the rest
    } catch (error) {
        console.error("Admin login failed:", error.message);
        errorEl.textContent = "Login failed. Check email/password.";
    }
});